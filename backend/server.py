"""MediAssist Backend - FastAPI + MongoDB"""
import os
import uuid
import logging
import math
import asyncio
from pathlib import Path
from datetime import datetime, timedelta, timezone, date as DateType
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
import bcrypt
import jwt
import httpx
from dotenv import load_dotenv

import google.generativeai as genai

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# --- Config ---
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "10080"))
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
NOSYAPI_KEY = os.environ.get("NOSYAPI_KEY", "")
NOSYAPI_BASE = os.environ.get("NOSYAPI_BASE", "https://www.nosyapi.com/apiv2/service")

# --- DB ---
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="MediAssist API")
api = APIRouter(prefix="/api")
security = HTTPBearer()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("mediassist")


# =========================
# MODELS
# =========================
class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1)
    surname: str = Field(..., min_length=1)
    email: EmailStr
    password: str = Field(..., min_length=6)
    date_of_birth: str  # YYYY-MM-DD
    phone_number: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    name: str
    surname: str
    email: str
    date_of_birth: str
    phone_number: str
    language: str = "tr"
    dark_mode: bool = False
    created_at: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class MedicationCreate(BaseModel):
    name: str
    dosage: str  # e.g. "500 mg"
    frequency_per_day: int = Field(..., ge=1, le=12)
    times: List[str]  # e.g. ["08:00", "14:00", "21:00"]
    duration_days: int = Field(..., ge=1)
    notes: Optional[str] = ""
    start_date: Optional[str] = None  # YYYY-MM-DD
    notifications_enabled: bool = True


class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    frequency_per_day: Optional[int] = None
    times: Optional[List[str]] = None
    duration_days: Optional[int] = None
    notes: Optional[str] = None
    notifications_enabled: Optional[bool] = None


class Medication(BaseModel):
    id: str
    user_id: str
    name: str
    dosage: str
    frequency_per_day: int
    times: List[str]
    duration_days: int
    notes: str
    start_date: str
    end_date: str
    notifications_enabled: bool
    created_at: str


class DoseLogCreate(BaseModel):
    medication_id: str
    scheduled_date: str  # YYYY-MM-DD
    scheduled_time: str  # HH:MM
    status: Literal["taken", "skipped"]


class DoseLog(BaseModel):
    id: str
    user_id: str
    medication_id: str
    medication_name: str
    scheduled_date: str
    scheduled_time: str
    status: str
    logged_at: str


class ChatRequest(BaseModel):
    message: str
    language: str = "tr"


class ChatMessage(BaseModel):
    id: str
    role: str  # 'user' | 'assistant'
    content: str
    timestamp: str


class VisionScanRequest(BaseModel):
    image_base64: str
    language: str = "tr"


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    surname: Optional[str] = None
    phone_number: Optional[str] = None
    date_of_birth: Optional[str] = None
    language: Optional[str] = None
    dark_mode: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6)


# =========================
# AUTH HELPERS
# =========================
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def create_jwt(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(401, "Invalid token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


def to_user_public(u: dict) -> UserPublic:
    return UserPublic(
        id=u["id"],
        name=u["name"],
        surname=u["surname"],
        email=u["email"],
        date_of_birth=u["date_of_birth"],
        phone_number=u["phone_number"],
        language=u.get("language", "tr"),
        dark_mode=u.get("dark_mode", False),
        created_at=u["created_at"],
    )


# =========================
# AUTH ROUTES
# =========================
@api.post("/auth/register", response_model=TokenResponse)
async def register(req: RegisterRequest):
    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(409, "Email already registered")

    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "name": req.name.strip(),
        "surname": req.surname.strip(),
        "email": req.email.lower(),
        "password_hash": hash_password(req.password),
        "date_of_birth": req.date_of_birth,
        "phone_number": req.phone_number,
        "language": "tr",
        "dark_mode": False,
        "notification_settings": {"quiet_hours_start": None, "quiet_hours_end": None, "enabled": True},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_jwt(user_id, req.email.lower())
    return TokenResponse(access_token=token, user=to_user_public(user_doc))


@api.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = create_jwt(user["id"], user["email"])
    return TokenResponse(access_token=token, user=to_user_public(user))


@api.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return to_user_public(user)


@api.put("/auth/profile", response_model=UserPublic)
async def update_profile(payload: ProfileUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in payload.dict(exclude_none=True).items()}
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return to_user_public(updated)


@api.post("/auth/change-password")
async def change_password(req: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    if not verify_password(req.old_password, user["password_hash"]):
        raise HTTPException(401, "Old password is incorrect")
    await db.users.update_one(
        {"id": user["id"]}, {"$set": {"password_hash": hash_password(req.new_password)}}
    )
    return {"success": True}


@api.delete("/auth/account")
async def delete_account(user: dict = Depends(get_current_user)):
    uid = user["id"]
    await db.users.delete_one({"id": uid})
    await db.medications.delete_many({"user_id": uid})
    await db.dose_logs.delete_many({"user_id": uid})
    await db.chat_messages.delete_many({"user_id": uid})
    return {"success": True}


# =========================
# MEDICATIONS
# =========================
def _med_doc_to_model(d: dict) -> Medication:
    return Medication(
        id=d["id"],
        user_id=d["user_id"],
        name=d["name"],
        dosage=d["dosage"],
        frequency_per_day=d["frequency_per_day"],
        times=d["times"],
        duration_days=d["duration_days"],
        notes=d.get("notes", ""),
        start_date=d["start_date"],
        end_date=d["end_date"],
        notifications_enabled=d.get("notifications_enabled", True),
        created_at=d["created_at"],
    )


@api.post("/medications", response_model=Medication)
async def create_medication(payload: MedicationCreate, user: dict = Depends(get_current_user)):
    today = DateType.today()
    start = DateType.fromisoformat(payload.start_date) if payload.start_date else today
    end = start + timedelta(days=payload.duration_days - 1)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": payload.name.strip(),
        "dosage": payload.dosage.strip(),
        "frequency_per_day": payload.frequency_per_day,
        "times": payload.times,
        "duration_days": payload.duration_days,
        "notes": payload.notes or "",
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "notifications_enabled": payload.notifications_enabled,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.medications.insert_one(doc)
    return _med_doc_to_model(doc)


@api.get("/medications", response_model=List[Medication])
async def list_medications(user: dict = Depends(get_current_user), only_active: bool = False):
    query = {"user_id": user["id"]}
    if only_active:
        today = DateType.today().isoformat()
        query["end_date"] = {"$gte": today}
    docs = await db.medications.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_med_doc_to_model(d) for d in docs]


@api.get("/medications/{med_id}", response_model=Medication)
async def get_medication(med_id: str, user: dict = Depends(get_current_user)):
    d = await db.medications.find_one({"id": med_id, "user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Medication not found")
    return _med_doc_to_model(d)


@api.put("/medications/{med_id}", response_model=Medication)
async def update_medication(med_id: str, payload: MedicationUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in payload.dict(exclude_none=True).items()}
    if "duration_days" in update:
        d = await db.medications.find_one({"id": med_id, "user_id": user["id"]}, {"_id": 0})
        if d:
            start = DateType.fromisoformat(d["start_date"])
            update["end_date"] = (start + timedelta(days=update["duration_days"] - 1)).isoformat()
    if update:
        await db.medications.update_one({"id": med_id, "user_id": user["id"]}, {"$set": update})
    d = await db.medications.find_one({"id": med_id, "user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Medication not found")
    return _med_doc_to_model(d)


@api.delete("/medications/{med_id}")
async def delete_medication(med_id: str, user: dict = Depends(get_current_user)):
    res = await db.medications.delete_one({"id": med_id, "user_id": user["id"]})
    await db.dose_logs.delete_many({"medication_id": med_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Medication not found")
    return {"success": True}


# =========================
# DOSE LOGS / TODAY SCHEDULE
# =========================
@api.post("/dose-logs", response_model=DoseLog)
async def log_dose(payload: DoseLogCreate, user: dict = Depends(get_current_user)):
    med = await db.medications.find_one({"id": payload.medication_id, "user_id": user["id"]}, {"_id": 0})
    if not med:
        raise HTTPException(404, "Medication not found")

    # Upsert logic - prevent duplicate logs for same dose
    existing = await db.dose_logs.find_one(
        {
            "user_id": user["id"],
            "medication_id": payload.medication_id,
            "scheduled_date": payload.scheduled_date,
            "scheduled_time": payload.scheduled_time,
        },
        {"_id": 0},
    )
    log_id = existing["id"] if existing else str(uuid.uuid4())
    doc = {
        "id": log_id,
        "user_id": user["id"],
        "medication_id": payload.medication_id,
        "medication_name": med["name"],
        "scheduled_date": payload.scheduled_date,
        "scheduled_time": payload.scheduled_time,
        "status": payload.status,
        "logged_at": datetime.now(timezone.utc).isoformat(),
    }
    if existing:
        await db.dose_logs.update_one({"id": log_id}, {"$set": doc})
    else:
        await db.dose_logs.insert_one(doc)
    return DoseLog(**doc)


@api.get("/schedule/today")
async def schedule_today(user: dict = Depends(get_current_user)):
    """Return today's medication doses with their status."""
    today = DateType.today()
    today_str = today.isoformat()

    meds = await db.medications.find(
        {
            "user_id": user["id"],
            "start_date": {"$lte": today_str},
            "end_date": {"$gte": today_str},
        },
        {"_id": 0},
    ).to_list(500)

    logs = await db.dose_logs.find(
        {"user_id": user["id"], "scheduled_date": today_str}, {"_id": 0}
    ).to_list(500)
    log_idx = {(l["medication_id"], l["scheduled_time"]): l for l in logs}

    items = []
    for m in meds:
        for t in m["times"]:
            log = log_idx.get((m["id"], t))
            items.append(
                {
                    "medication_id": m["id"],
                    "medication_name": m["name"],
                    "dosage": m["dosage"],
                    "notes": m.get("notes", ""),
                    "scheduled_date": today_str,
                    "scheduled_time": t,
                    "status": log["status"] if log else "pending",
                }
            )
    items.sort(key=lambda x: x["scheduled_time"])
    return {"date": today_str, "items": items}


@api.get("/stats/summary")
async def stats_summary(user: dict = Depends(get_current_user)):
    """Dashboard summary: total active meds, today taken, today remaining, streak."""
    today = DateType.today()
    today_str = today.isoformat()

    active_meds = await db.medications.count_documents(
        {
            "user_id": user["id"],
            "start_date": {"$lte": today_str},
            "end_date": {"$gte": today_str},
        }
    )

    # Today
    sched = await schedule_today(user)
    items = sched["items"]
    today_taken = sum(1 for i in items if i["status"] == "taken")
    today_remaining = sum(1 for i in items if i["status"] == "pending")
    today_skipped = sum(1 for i in items if i["status"] == "skipped")
    today_total = len(items)

    # Streak: consecutive past days where every scheduled dose was taken
    streak = 0
    for i in range(0, 60):
        d = today - timedelta(days=i)
        d_str = d.isoformat()
        meds = await db.medications.find(
            {
                "user_id": user["id"],
                "start_date": {"$lte": d_str},
                "end_date": {"$gte": d_str},
            },
            {"_id": 0},
        ).to_list(500)
        scheduled = sum(len(m["times"]) for m in meds)
        if scheduled == 0:
            if i == 0:
                continue
            else:
                break
        logs = await db.dose_logs.count_documents(
            {"user_id": user["id"], "scheduled_date": d_str, "status": "taken"}
        )
        # For today, consider partial OK (don't break streak yet for incomplete day)
        if i == 0:
            if logs >= scheduled:
                streak += 1
            continue
        if logs >= scheduled:
            streak += 1
        else:
            break

    return {
        "active_medications": active_meds,
        "today_taken": today_taken,
        "today_remaining": today_remaining,
        "today_skipped": today_skipped,
        "today_total": today_total,
        "streak_days": streak,
    }


@api.get("/stats/adherence")
async def adherence_stats(user: dict = Depends(get_current_user), days: int = 7):
    """Per-day taken/missed for the last N days for charts."""
    today = DateType.today()
    result = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        d_str = d.isoformat()
        meds = await db.medications.find(
            {
                "user_id": user["id"],
                "start_date": {"$lte": d_str},
                "end_date": {"$gte": d_str},
            },
            {"_id": 0},
        ).to_list(500)
        scheduled = sum(len(m["times"]) for m in meds)
        taken = await db.dose_logs.count_documents(
            {"user_id": user["id"], "scheduled_date": d_str, "status": "taken"}
        )
        rate = round(100 * taken / scheduled) if scheduled > 0 else 0
        result.append({"date": d_str, "scheduled": scheduled, "taken": taken, "rate": rate})
    return {"days": result}


@api.get("/stats/medication-adherence")
async def per_med_adherence(user: dict = Depends(get_current_user)):
    """Per-medication adherence rate."""
    today = DateType.today().isoformat()
    meds = await db.medications.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    out = []
    for m in meds:
        start = DateType.fromisoformat(m["start_date"])
        end = DateType.fromisoformat(m["end_date"])
        cap_end = min(end, DateType.today())
        if cap_end < start:
            out.append({"medication_id": m["id"], "name": m["name"], "rate": 0, "taken": 0, "scheduled": 0})
            continue
        days = (cap_end - start).days + 1
        scheduled = days * len(m["times"])
        taken = await db.dose_logs.count_documents(
            {"user_id": user["id"], "medication_id": m["id"], "status": "taken"}
        )
        rate = round(100 * taken / scheduled) if scheduled > 0 else 0
        out.append(
            {
                "medication_id": m["id"],
                "name": m["name"],
                "dosage": m["dosage"],
                "rate": rate,
                "taken": taken,
                "scheduled": scheduled,
                "is_active": m["end_date"] >= today,
            }
        )
    return {"medications": out}


# =========================
# AI CHAT
# =========================
HEALTH_SYSTEM_PROMPT = """You are MediAssist Health Assistant, a helpful but cautious AI designed exclusively to assist users with health-related questions. You ONLY respond to questions about: symptoms, medications, herbal remedies, nutrition, general wellness, first aid, and medical terminology. You MUST REFUSE to answer any non-health-related questions politely. You NEVER provide definitive diagnoses or prescribe treatments. Every response MUST end with: '⚠️ Bu bilgi yalnızca genel sağlık amaçlıdır. Lütfen mutlaka bir doktora veya eczacıya danışın.' You may suggest herbal/natural remedies when relevant but always note they are complementary, not replacements for medical care. Respond in the same language as the user (Turkish or English). Keep responses concise, clear, and empathetic."""


@api.post("/chat/send")
async def chat_send(req: ChatRequest, user: dict = Depends(get_current_user)):
    user_msg_id = str(uuid.uuid4())
    user_msg_doc = {
        "id": user_msg_id,
        "user_id": user["id"],
        "role": "user",
        "content": req.message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.chat_messages.insert_one(user_msg_doc)
    user_msg_doc.pop("_id", None)

    try:
        model = genai.GenerativeModel('gemini-2.5-flash', system_instruction=HEALTH_SYSTEM_PROMPT)
        recent_msgs = await db.chat_messages.find({"user_id": user["id"]}, {"_id": 0}).sort("timestamp", 1).to_list(50)
        
        contents = []
        for m in recent_msgs:
            role = "user" if m["role"] == "user" else "model"
            contents.append({"role": role, "parts": [m["content"]]})
            
        response = await model.generate_content_async(contents)
        response_text = response.text
    except Exception as e:
        logger.exception("LLM error")
        raise HTTPException(500, f"AI service error: {str(e)}")

    ai_msg = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "role": "assistant",
        "content": response_text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.chat_messages.insert_one(dict(ai_msg))
    ai_msg.pop("_id", None)

    # Trim to last 50
    count = await db.chat_messages.count_documents({"user_id": user["id"]})
    if count > 50:
        oldest = await db.chat_messages.find({"user_id": user["id"]}, {"_id": 0}).sort(
            "timestamp", 1
        ).to_list(count - 50)
        ids = [o["id"] for o in oldest]
        await db.chat_messages.delete_many({"id": {"$in": ids}})

    return {"user_message": user_msg_doc, "ai_message": ai_msg}


@api.get("/chat/history")
async def chat_history(user: dict = Depends(get_current_user)):
    msgs = await db.chat_messages.find({"user_id": user["id"]}, {"_id": 0}).sort(
        "timestamp", 1
    ).to_list(100)
    return {"messages": msgs}


@api.delete("/chat/history")
async def clear_chat(user: dict = Depends(get_current_user)):
    await db.chat_messages.delete_many({"user_id": user["id"]})
    return {"success": True}


# =========================
# VISION SCAN
# =========================
VISION_PROMPT_TR = """Bu ilaç fotoğrafını analiz et. Kutu, blister, hap veya etiket olabilir. Lütfen aşağıdaki bilgileri JSON formatında döndür:
{
  "medication_name": "İlaç adı",
  "active_ingredients": ["etken madde 1", "etken madde 2"],
  "common_uses": "Genel kullanım alanları",
  "side_effects": ["yan etki 1", "yan etki 2"],
  "dosage_info": "Genel dozaj bilgisi",
  "warnings": ["uyarı 1", "uyarı 2"],
  "confidence": "high|medium|low",
  "identifiable": true
}
Eğer ilaç tanımlanamıyorsa identifiable=false ve medication_name='Tanımlanamadı' yap. Sadece JSON döndür, başka açıklama yapma."""

VISION_PROMPT_EN = """Analyze this medication photo. It may be a box, blister, pill or label. Return the following info in JSON:
{
  "medication_name": "Medication name",
  "active_ingredients": ["ingredient 1", "ingredient 2"],
  "common_uses": "Common uses/indications",
  "side_effects": ["side effect 1", "side effect 2"],
  "dosage_info": "General dosage info",
  "warnings": ["warning 1", "warning 2"],
  "confidence": "high|medium|low",
  "identifiable": true
}
If unable to identify, set identifiable=false and medication_name='Not identified'. Return ONLY valid JSON, no other text."""


@api.post("/vision/scan-medication")
async def scan_medication(req: VisionScanRequest, user: dict = Depends(get_current_user)):
    if not req.image_base64:
        raise HTTPException(400, "No image provided")

    # Strip data URL prefix if present
    img_b64 = req.image_base64
    if img_b64.startswith("data:"):
        img_b64 = img_b64.split(",", 1)[-1]

    prompt = VISION_PROMPT_TR if req.language == "tr" else VISION_PROMPT_EN

    try:
        model = genai.GenerativeModel('gemini-2.5-flash', generation_config={"response_mime_type": "application/json"})
        response = await model.generate_content_async([
            {"mime_type": "image/jpeg", "data": img_b64},
            "You are a pharmaceutical vision expert. Always respond with valid JSON only.\n\n" + prompt
        ])
        response_text = response.text
    except Exception as e:
        logger.exception("Vision error")
        raise HTTPException(500, f"AI vision error: {str(e)}")

    # Strip markdown fences if any
    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    import json as _json
    try:
        data = _json.loads(cleaned)
    except Exception:
        data = {
            "medication_name": "Tanımlanamadı" if req.language == "tr" else "Not identified",
            "active_ingredients": [],
            "common_uses": response_text[:300],
            "side_effects": [],
            "dosage_info": "",
            "warnings": [],
            "confidence": "low",
            "identifiable": False,
        }

    return data


LAB_TEST_PROMPT_TR = """Bu bir tıbbi tahlil/laboratuvar sonucu görselidir. Lütfen sonuçları analiz et. Anormal değerleri (referans aralığı dışında olanları) vurgula. Hastanın anlayabileceği sade bir dille sonuçların genel bir özetini yap. Unutma, bu sadece bilgilendirme amaçlıdır ve doktor tavsiyesi yerine geçmez. Lütfen Markdown formatında düzenli bir metin döndür."""

LAB_TEST_PROMPT_EN = """This is a medical lab test/laboratory result image. Please analyze the results. Highlight any abnormal values (outside the reference range). Provide a general summary of the results in simple language that a patient can understand. Remember, this is for informational purposes only and does not replace medical advice. Please return the response in formatted Markdown."""

@api.post("/vision/scan-lab-test")
async def scan_lab_test(req: VisionScanRequest, user: dict = Depends(get_current_user)):
    if not req.image_base64:
        raise HTTPException(400, "No image provided")

    img_b64 = req.image_base64
    if img_b64.startswith("data:"):
        img_b64 = img_b64.split(",", 1)[-1]

    prompt = LAB_TEST_PROMPT_TR if req.language == "tr" else LAB_TEST_PROMPT_EN

    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = await model.generate_content_async([
            {"mime_type": "image/jpeg", "data": img_b64},
            prompt
        ])
        return {"result": response.text}
    except Exception as e:
        logger.exception("Lab test vision error")
        raise HTTPException(500, f"AI vision error: {str(e)}")


# =========================
# PHARMACY FINDER - NosyAPI proxy
# =========================
def haversine(lat1, lon1, lat2, lon2):
    R = 6371000  # meters
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# Tiny in-memory cache (key: f"{lat:.3f},{lon:.3f},{duty}", expires after 60s)
_pharmacy_cache: dict = {}
_PHARMACY_CACHE_TTL = 60  # seconds


def _normalize_pharmacy_item(p: dict, user_lat: float, user_lon: float, on_call: bool) -> dict:
    """Convert NosyAPI item into our app's pharmacy format."""
    # NosyAPI fields can be: name, district, city, address, phone, lat/lng or latitude/longitude
    plat = p.get("lat") or p.get("latitude") or p.get("Latitude")
    plon = p.get("lng") or p.get("lon") or p.get("longitude") or p.get("Longitude")
    try:
        plat = float(plat) if plat is not None else None
        plon = float(plon) if plon is not None else None
    except (TypeError, ValueError):
        plat = plon = None

    distance_m = int(haversine(user_lat, user_lon, plat, plon)) if plat and plon else None
    name = p.get("name") or p.get("pharmacyName") or p.get("Name") or "Eczane"
    address = p.get("address") or p.get("Address") or p.get("loc") or ""
    if p.get("district") and p["district"] not in address:
        address = f"{address}, {p['district']}".strip(", ")
    phone = p.get("phone") or p.get("Phone") or p.get("phoneNumber") or ""
    # Compose hours/dutyDate
    duty_start = p.get("dutyStart") or p.get("startDate") or p.get("StartDate")
    duty_end = p.get("dutyEnd") or p.get("endDate") or p.get("EndDate")
    if on_call and duty_start and duty_end:
        hours = "24 Saat (Nöbetçi)"
    else:
        hours = p.get("workingHours") or "08:30 - 19:00"

    return {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{name}-{address}")),
        "name": name,
        "address": address,
        "phone": phone,
        "hours": hours,
        "on_call": on_call,
        "lat": plat,
        "lon": plon,
        "distance_m": distance_m,
    }


async def _fetch_nosy_duty_locations(lat: float, lon: float) -> list:
    """Query NosyAPI for nearest 20 duty pharmacies."""
    if not NOSYAPI_KEY:
        return []
    url = f"{NOSYAPI_BASE}/pharmacies-on-duty/locations"
    params = {"apiKey": NOSYAPI_KEY, "latitude": lat, "longitude": lon}
    try:
        async with httpx.AsyncClient(timeout=12.0) as cx:
            r = await cx.get(url, params=params)
            if r.status_code != 200:
                logger.warning(f"NosyAPI duty/locations -> {r.status_code}: {r.text[:200]}")
                return []
            data = r.json()
            if data.get("status") == "failure":
                logger.warning(f"NosyAPI failure: {data.get('message')}")
                return []
            return data.get("data") or data.get("result") or []
    except Exception as e:
        logger.exception(f"NosyAPI duty/locations error: {e}")
        return []


async def _fetch_nosy_duty_by_city(city: str, district: Optional[str] = None) -> list:
    if not NOSYAPI_KEY:
        return []
    url = f"{NOSYAPI_BASE}/pharmacies-on-duty"
    params = {"apiKey": NOSYAPI_KEY, "city": city}
    if district:
        params["district"] = district
    try:
        async with httpx.AsyncClient(timeout=12.0) as cx:
            r = await cx.get(url, params=params)
            if r.status_code != 200:
                logger.warning(f"NosyAPI duty -> {r.status_code}: {r.text[:200]}")
                return []
            data = r.json()
            return data.get("data") or data.get("result") or []
    except Exception as e:
        logger.exception(f"NosyAPI duty by city error: {e}")
        return []


async def _fetch_nosy_all_locations(lat: float, lon: float) -> list:
    # Use Nominatim (OSM) for all pharmacies to avoid NosyAPI credit limits
    radius_m = 5000
    dlat = radius_m / 111000.0
    dlon = radius_m / (111000.0 * 0.75)
    viewbox = f"{lon-dlon},{lat+dlat},{lon+dlon},{lat-dlat}"
    
    url = "https://nominatim.openstreetmap.org/search.php"
    params = {"q": "pharmacy", "format": "jsonv2", "viewbox": viewbox, "bounded": 1, "limit": 50, "extratags": 1}
    try:
        async with httpx.AsyncClient(timeout=12.0) as cx:
            r = await cx.get(url, params=params, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0) MediAssist/1.0"})
            if r.status_code != 200:
                logger.warning(f"Nominatim all/locations -> {r.status_code}: {r.text[:200]}")
                return []
            data = r.json()
            out = []
            for d in data:
                out.append({
                    "name": d.get("name") or "Eczane",
                    "address": d.get("display_name", ""),
                    "phone": d.get("extratags", {}).get("phone") or d.get("extratags", {}).get("contact:phone") or "",
                    "latitude": d.get("lat"),
                    "longitude": d.get("lon")
                })
            return out
    except Exception as e:
        logger.exception(f"Nominatim all/locations error: {e}")
        return []


async def _fetch_nosy_all_by_city(city: str, district: Optional[str] = None) -> list:
    # Use Nominatim (OSM) for all pharmacies by city
    url = "https://nominatim.openstreetmap.org/search.php"
    q_str = f"pharmacy in {district}, {city}, Turkey" if district else f"pharmacy in {city}, Turkey"
    params = {"q": q_str, "format": "jsonv2", "limit": 50, "extratags": 1}
    try:
        async with httpx.AsyncClient(timeout=12.0) as cx:
            r = await cx.get(url, params=params, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0) MediAssist/1.0"})
            if r.status_code != 200:
                logger.warning(f"Nominatim all/city -> {r.status_code}: {r.text[:200]}")
                return []
            data = r.json()
            out = []
            for d in data:
                out.append({
                    "name": d.get("name") or "Eczane",
                    "address": d.get("display_name", ""),
                    "phone": d.get("extratags", {}).get("phone") or d.get("extratags", {}).get("contact:phone") or "",
                    "latitude": d.get("lat"),
                    "longitude": d.get("lon")
                })
            return out
    except Exception as e:
        logger.exception(f"Nominatim all/city error: {e}")
        return []


@api.get("/pharmacies/nearby")
async def pharmacies_nearby(
    lat: float, lon: float, radius_m: int = 5000, on_call_only: bool = False,
    user: dict = Depends(get_current_user),
):
    """Returns nearby pharmacies. Uses NosyAPI duty/locations endpoint with caching.

    For 'all' tab: returns all pharmacies.
    For 'on_call_only': returns duty pharmacies.
    """
    cache_key = f"{lat:.3f},{lon:.3f},{on_call_only}"
    now_ts = datetime.now(timezone.utc).timestamp()
    cached = _pharmacy_cache.get(cache_key)
    raw_items: list
    if cached and now_ts - cached["t"] < _PHARMACY_CACHE_TTL:
        raw_items = cached["items"]
    else:
        if on_call_only:
            raw_items = await _fetch_nosy_duty_locations(lat, lon)
        else:
            raw_items = await _fetch_nosy_all_locations(lat, lon)
        _pharmacy_cache[cache_key] = {"t": now_ts, "items": raw_items}

    out = []
    for it in raw_items:
        item = _normalize_pharmacy_item(it, lat, lon, on_call=on_call_only)
        if item["distance_m"] is None:
            continue
        if item["distance_m"] > radius_m:
            continue
        out.append(item)

    if on_call_only:
        out = [p for p in out if p["on_call"]]

    out.sort(key=lambda x: x["distance_m"])

    # Fallback: if NosyAPI returned nothing (e.g., key has no active plan / outage),
    # use a small mock so UI is never empty
    if not out:
        for offset in [(0.0010, 0.0012, "Şifa Eczanesi", "Atatürk Caddesi No:12", "+90 212 555 0101", False),
                       (-0.0015, 0.0008, "Merkez Eczanesi", "Cumhuriyet Mah. 5. Sok.", "+90 212 555 0102", True),
                       (0.0025, -0.0018, "Hayat Eczanesi", "Bahçelievler Cad. No:34", "+90 212 555 0103", False),
                       (-0.0008, -0.0022, "Sağlık Eczanesi", "İstiklal Cad. No:88", "+90 212 555 0104", True),
                       (0.0040, 0.0030, "Anadolu Eczanesi", "Yeni Mahalle 2. Cad.", "+90 212 555 0105", False),
                       (-0.0035, 0.0019, "Doğa Eczanesi", "Park Yolu No:7", "+90 212 555 0106", False),
                       (0.0018, -0.0040, "Yaşam Eczanesi", "Hastane Karşısı No:1", "+90 212 555 0107", True)]:
            dlat, dlon, name, addr, phone, oc = offset
            plat, plon = lat + dlat, lon + dlon
            d = int(haversine(lat, lon, plat, plon))
            if d > radius_m:
                continue
            if on_call_only and not oc:
                continue
            out.append({
                "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, name)),
                "name": name, "address": addr, "phone": phone,
                "hours": "24 Saat (Nöbetçi)" if oc else "08:30 - 19:00",
                "on_call": oc, "lat": plat, "lon": plon, "distance_m": d,
            })
        out.sort(key=lambda x: x["distance_m"])
        return {"pharmacies": out, "source": "fallback"}

    return {"pharmacies": out, "source": "nosyapi"}


@api.get("/pharmacies/by-city")
async def pharmacies_by_city(
    city: str, district: Optional[str] = None, on_call_only: bool = False,
    user: dict = Depends(get_current_user),
):
    """Lookup pharmacies by city/district name (NosyAPI proxy)."""
    if on_call_only:
        raw = await _fetch_nosy_duty_by_city(city, district)
    else:
        raw = await _fetch_nosy_all_by_city(city, district)
    out = [_normalize_pharmacy_item(it, 0.0, 0.0, on_call=on_call_only) for it in raw]
    return {"pharmacies": out, "city": city, "district": district}


# =========================
# NOTIFICATION LOGS
# =========================
class NotificationLogCreate(BaseModel):
    medication_id: str
    notification_id: str  # the local notification identifier from expo-notifications
    scheduled_date: str   # YYYY-MM-DD
    scheduled_time: str   # HH:MM
    fired_at: Optional[str] = None
    status: Literal["scheduled", "delivered", "taken", "snoozed", "skipped", "missed"] = "scheduled"
    snooze_minutes: Optional[int] = None


class NotificationLogUpdate(BaseModel):
    status: Optional[Literal["scheduled", "delivered", "taken", "snoozed", "skipped", "missed"]] = None
    fired_at: Optional[str] = None
    snooze_minutes: Optional[int] = None


@api.post("/notification-logs")
async def create_notification_log(payload: NotificationLogCreate, user: dict = Depends(get_current_user)):
    # Idempotency: same notification_id → upsert
    existing = await db.notification_logs.find_one(
        {"user_id": user["id"], "notification_id": payload.notification_id}, {"_id": 0}
    )
    log_id = existing["id"] if existing else str(uuid.uuid4())
    doc = {
        "id": log_id,
        "user_id": user["id"],
        "medication_id": payload.medication_id,
        "notification_id": payload.notification_id,
        "scheduled_date": payload.scheduled_date,
        "scheduled_time": payload.scheduled_time,
        "fired_at": payload.fired_at,
        "status": payload.status,
        "snooze_minutes": payload.snooze_minutes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if existing:
        await db.notification_logs.update_one({"id": log_id}, {"$set": doc})
    else:
        await db.notification_logs.insert_one(dict(doc))
    return doc


@api.get("/notification-logs")
async def list_notification_logs(
    user: dict = Depends(get_current_user),
    medication_id: Optional[str] = None,
    status: Optional[str] = None,
    days: int = 7,
):
    since = (DateType.today() - timedelta(days=days)).isoformat()
    q: dict = {"user_id": user["id"], "scheduled_date": {"$gte": since}}
    if medication_id:
        q["medication_id"] = medication_id
    if status:
        q["status"] = status
    docs = await db.notification_logs.find(q, {"_id": 0}).sort("scheduled_date", -1).to_list(500)
    return {"logs": docs}


@api.put("/notification-logs/{log_id}")
async def update_notification_log(
    log_id: str, payload: NotificationLogUpdate, user: dict = Depends(get_current_user),
):
    update = {k: v for k, v in payload.dict(exclude_none=True).items()}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.notification_logs.update_one({"id": log_id, "user_id": user["id"]}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Notification log not found")
    doc = await db.notification_logs.find_one({"id": log_id}, {"_id": 0})
    return doc


@api.post("/notification-logs/sweep-missed")
async def sweep_missed(user: dict = Depends(get_current_user)):
    """Mark scheduled notifications older than 60 minutes as missed (called by background task)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=60)).isoformat()
    today = DateType.today().isoformat()

    # Find all scheduled/delivered logs for today/yesterday whose dose time + 60min has passed
    candidates = await db.notification_logs.find(
        {
            "user_id": user["id"],
            "status": {"$in": ["scheduled", "delivered", "snoozed"]},
            "scheduled_date": {"$lte": today},
        },
        {"_id": 0},
    ).to_list(500)

    missed_count = 0
    for log in candidates:
        try:
            dose_dt = datetime.strptime(f"{log['scheduled_date']} {log['scheduled_time']}", "%Y-%m-%d %H:%M")
            if (datetime.now() - dose_dt).total_seconds() > 3600:
                # check there's no dose log marking it taken/skipped
                taken_log = await db.dose_logs.find_one({
                    "user_id": user["id"],
                    "medication_id": log["medication_id"],
                    "scheduled_date": log["scheduled_date"],
                    "scheduled_time": log["scheduled_time"],
                })
                if not taken_log:
                    await db.notification_logs.update_one(
                        {"id": log["id"]}, {"$set": {"status": "missed", "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    missed_count += 1
        except Exception:
            continue
    return {"missed_count": missed_count}


@api.get("/missed-doses")
async def get_missed_doses(user: dict = Depends(get_current_user), days: int = 1):
    """Return missed doses for warning UI. Combines dose_logs (no log = potential miss) and notification_logs (status=missed)."""
    today = DateType.today()
    out = []
    for i in range(days):
        d = today - timedelta(days=i)
        d_str = d.isoformat()

        meds = await db.medications.find(
            {
                "user_id": user["id"],
                "start_date": {"$lte": d_str},
                "end_date": {"$gte": d_str},
            },
            {"_id": 0},
        ).to_list(200)

        logs = await db.dose_logs.find(
            {"user_id": user["id"], "scheduled_date": d_str}, {"_id": 0}
        ).to_list(500)
        log_idx = {(l["medication_id"], l["scheduled_time"]) for l in logs}

        now = datetime.now()
        for m in meds:
            for t in m["times"]:
                try:
                    dose_dt = datetime.strptime(f"{d_str} {t}", "%Y-%m-%d %H:%M")
                except Exception:
                    continue
                if (now - dose_dt).total_seconds() < 3600:
                    continue  # not yet missed (within 60 min grace)
                if (m["id"], t) in log_idx:
                    continue
                out.append({
                    "medication_id": m["id"],
                    "medication_name": m["name"],
                    "dosage": m["dosage"],
                    "scheduled_date": d_str,
                    "scheduled_time": t,
                })
    return {"missed": out}


# =========================
# HEALTH
# =========================
@api.get("/")
async def root():
    return {"service": "MediAssist API", "status": "ok"}


# Register router
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.medications.create_index([("user_id", 1), ("created_at", -1)])
    await db.dose_logs.create_index([("user_id", 1), ("scheduled_date", 1)])
    await db.chat_messages.create_index([("user_id", 1), ("timestamp", 1)])
    await db.notification_logs.create_index([("user_id", 1), ("scheduled_date", -1)])
    await db.notification_logs.create_index([("notification_id", 1)])


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
