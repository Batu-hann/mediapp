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
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mediassist")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-only-change-me-please-replace-this-secret")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "10080"))
GEMINI_API_KEY = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
GEMINI_MODEL = (os.environ.get("GEMINI_MODEL") or "gemini-2.0-flash").strip()
GEMINI_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
]
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
NOSYAPI_KEY = os.environ.get("NOSYAPI_KEY", "").strip()
NOSYAPI_BASE = os.environ.get("NOSYAPI_BASE", "https://www.nosyapi.com/apiv2/service").strip()
print("ACTIVE NOSY KEY:", NOSYAPI_KEY[:8], NOSYAPI_KEY[-8:])

# --- DB ---
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="MediAssist API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
api = APIRouter(prefix="/api")
security = HTTPBearer()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("mediassist")


async def generate_content_async_with_fallback(
    contents,
    system_instruction: Optional[str] = None,
    generation_config: Optional[dict] = None,
    primary_model: Optional[str] = None
):
    # Prioritize primary requested model, then GEMINI_MODEL, then the fallback models
    models_to_try = []
    
    if primary_model:
        models_to_try.append(primary_model)
    if GEMINI_MODEL and GEMINI_MODEL not in models_to_try:
        models_to_try.append(GEMINI_MODEL)
    
    for m in GEMINI_MODELS:
        if m not in models_to_try:
            models_to_try.append(m)

    last_exception = None
    for model_name in models_to_try:
        try:
            logger.info(f"Attempting content generation with model: {model_name}")
            model = genai.GenerativeModel(
                model_name,
                system_instruction=system_instruction,
                generation_config=generation_config
            )
            res = await model.generate_content_async(contents)
            return res
        except Exception as e:
            last_exception = e
            logger.warning(f"Gemini API model {model_name} failed: {e}. Trying next fallback...")
            continue
            
    logger.error("All Gemini fallback models exhausted.")
    raise last_exception


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
    notifications_enabled: bool = True
    created_at: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class MedicationCreate(BaseModel):
    name: str
    dosage: Optional[str] = "1 Doz"  # e.g. "500 mg"
    frequency_per_day: int = Field(..., ge=0, le=12)
    times: List[str]  # e.g. ["08:00", "14:00", "21:00"]
    duration_days: Optional[int] = None
    notes: Optional[str] = ""
    start_date: Optional[str] = None  # YYYY-MM-DD
    notifications_enabled: bool = True
    preferred_times: Optional[List[str]] = None
    meal_relation: Optional[str] = None
    usage_type: Optional[str] = "continuous"
    stock_total: Optional[int] = None
    stock_take: Optional[int] = None
    side_effects: Optional[List[dict]] = None
    follow_up_enabled: Optional[bool] = True
    # Premium Fields
    medication_type: Optional[str] = "tablet"
    visual_shape: Optional[str] = "tablet"
    visual_color: Optional[str] = "blue"
    stock_count: Optional[int] = None
    stock_unit: Optional[str] = "adet"
    instructions: Optional[str] = ""
    archived: Optional[bool] = False
    schedule_type: Optional[str] = "everyday"
    weekdays: Optional[List[int]] = None
    interval_days: Optional[int] = None
    periodic_use_days: Optional[int] = None
    periodic_break_days: Optional[int] = None
    periodic_cycle_type: Optional[str] = "day"


class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    frequency_per_day: Optional[int] = None
    times: Optional[List[str]] = None
    duration_days: Optional[int] = None
    notes: Optional[str] = None
    notifications_enabled: Optional[bool] = None
    preferred_times: Optional[List[str]] = None
    meal_relation: Optional[str] = None
    usage_type: Optional[str] = None
    stock_total: Optional[int] = None
    stock_take: Optional[int] = None
    side_effects: Optional[List[dict]] = None
    is_active: Optional[bool] = None
    follow_up_enabled: Optional[bool] = None
    # Premium Fields
    medication_type: Optional[str] = None
    visual_shape: Optional[str] = None
    visual_color: Optional[str] = None
    stock_count: Optional[int] = None
    stock_unit: Optional[str] = None
    instructions: Optional[str] = None
    archived: Optional[bool] = None
    schedule_type: Optional[str] = None
    weekdays: Optional[List[int]] = None
    interval_days: Optional[int] = None
    periodic_use_days: Optional[int] = None
    periodic_break_days: Optional[int] = None
    periodic_cycle_type: Optional[str] = None


class Medication(BaseModel):
    id: str
    user_id: str
    name: str
    dosage: Optional[str] = "1 Doz"
    frequency_per_day: int
    times: List[str]
    duration_days: Optional[int] = 365
    notes: Optional[str] = ""
    start_date: Optional[str] = ""
    end_date: Optional[str] = ""
    notifications_enabled: bool
    created_at: str
    preferred_times: Optional[List[str]] = None
    meal_relation: Optional[str] = None
    usage_type: Optional[str] = "continuous"
    stock_total: Optional[int] = None
    stock_take: Optional[int] = None
    side_effects: Optional[List[dict]] = None
    is_active: Optional[bool] = True
    follow_up_enabled: Optional[bool] = True
    # Premium Fields
    medication_type: Optional[str] = "tablet"
    visual_shape: Optional[str] = "tablet"
    visual_color: Optional[str] = "blue"
    stock_count: Optional[int] = None
    stock_unit: Optional[str] = "adet"
    instructions: Optional[str] = ""
    archived: Optional[bool] = False
    schedule_type: Optional[str] = "everyday"
    weekdays: Optional[List[int]] = None
    interval_days: Optional[int] = None
    periodic_use_days: Optional[int] = None
    periodic_break_days: Optional[int] = None
    periodic_cycle_type: Optional[str] = "day"


class DoseLogCreate(BaseModel):
    medication_id: str
    scheduled_date: str  # YYYY-MM-DD
    scheduled_time: str  # HH:MM
    status: str  # e.g. "taken", "skipped", "postponed", "snoozed", "missed"
    postponed_time: Optional[str] = None
    actual_time: Optional[str] = None
    dose_amount: Optional[float] = 1.0
    dose_unit: Optional[str] = "adet"
    note: Optional[str] = ""


class DoseLog(BaseModel):
    id: str
    user_id: str
    medication_id: str
    medication_name: str
    scheduled_date: str
    scheduled_time: str
    status: str
    logged_at: str
    postponed_time: Optional[str] = None
    actual_time: Optional[str] = None
    dose_amount: Optional[float] = 1.0
    dose_unit: Optional[str] = "adet"
    note: Optional[str] = ""
    created_at: Optional[str] = None


class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str
    language: str = "tr"


class ChatMessage(BaseModel):
    id: str
    conversation_id: Optional[str] = None
    role: str  # 'user' | 'assistant'
    content: str
    timestamp: str


class ChatMessageEditRequest(BaseModel):
    content: str
    language: str = "tr"


class ConversationCreate(BaseModel):
    title: Optional[str] = None


class ConversationUpdate(BaseModel):
    title: str


class ConversationResponse(BaseModel):
    id: str
    user_id: str
    title: str
    created_at: str
    updated_at: str



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
    notifications_enabled: Optional[bool] = None


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
        notifications_enabled=u.get("notifications_enabled", True),
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
        dosage=d.get("dosage") or "1 Doz",
        frequency_per_day=d["frequency_per_day"],
        times=d["times"],
        duration_days=d.get("duration_days") if d.get("duration_days") is not None else 365,
        notes=d.get("notes") or "",
        start_date=d.get("start_date") or "",
        end_date=d.get("end_date") or "",
        notifications_enabled=d.get("notifications_enabled", True),
        created_at=d["created_at"],
        preferred_times=d.get("preferred_times") or [],
        meal_relation=d.get("meal_relation") or None,
        usage_type=d.get("usage_type") or "continuous",
        stock_total=d.get("stock_total") if d.get("stock_total") is not None else None,
        stock_take=d.get("stock_take") if d.get("stock_take") is not None else None,
        side_effects=d.get("side_effects") or [],
        is_active=d.get("is_active", True),
        follow_up_enabled=d.get("follow_up_enabled", True),
        # Premium Fields
        medication_type=d.get("medication_type", "tablet"),
        visual_shape=d.get("visual_shape", "tablet"),
        visual_color=d.get("visual_color", "blue"),
        stock_count=d.get("stock_count"),
        stock_unit=d.get("stock_unit", "adet"),
        instructions=d.get("instructions", ""),
        archived=d.get("archived", False),
        schedule_type=d.get("schedule_type", "everyday"),
        weekdays=d.get("weekdays"),
        interval_days=d.get("interval_days"),
        periodic_use_days=d.get("periodic_use_days"),
        periodic_break_days=d.get("periodic_break_days"),
        periodic_cycle_type=d.get("periodic_cycle_type", "day"),
    )



@api.post("/medications", response_model=Medication)
async def create_medication(payload: MedicationCreate, user: dict = Depends(get_current_user)):
    today = DateType.today()
    start = today
    if payload.start_date:
        try:
            # Check if it has Turkish text like "Mayıs" and map/clean it if needed,
            # or try to extract standard YYYY-MM-DD from frontend.
            months_tr = {
                "ocak": "01", "şubat": "02", "mart": "03", "nisan": "04", "mayıs": "05", "haziran": "06",
                "temmuz": "07", "ağustos": "08", "eylül": "09", "ekim": "10", "kasım": "11", "aralık": "12"
            }
            clean_date = payload.start_date.lower().strip()
            for k, v in months_tr.items():
                if k in clean_date:
                    parts = clean_date.split()
                    if len(parts) == 3:
                        day = parts[0].zfill(2)
                        year = parts[2]
                        clean_date = f"{year}-{v}-{day}"
                    break
            start = DateType.fromisoformat(clean_date)
        except Exception:
            start = today
            
    dur_days = payload.duration_days if (payload.duration_days is not None and payload.duration_days >= 1) else 365
    end = start + timedelta(days=dur_days - 1)
    
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": payload.name.strip(),
        "dosage": payload.dosage.strip() if payload.dosage else "1 Doz",
        "frequency_per_day": payload.frequency_per_day,
        "times": payload.times,
        "duration_days": payload.duration_days,  # Keep None in DB if it was None (continuous)
        "notes": payload.notes or "",
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "notifications_enabled": payload.notifications_enabled,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "preferred_times": payload.preferred_times or [],
        "meal_relation": payload.meal_relation,
        "usage_type": payload.usage_type or "continuous",
        "stock_total": payload.stock_total,
        "stock_take": payload.stock_take,
        "side_effects": payload.side_effects or [],
        "is_active": True,
        "follow_up_enabled": payload.follow_up_enabled if payload.follow_up_enabled is not None else True,
        # Premium Fields
        "medication_type": payload.medication_type or "tablet",
        "visual_shape": payload.visual_shape or "tablet",
        "visual_color": payload.visual_color or "blue",
        "stock_count": payload.stock_count,
        "stock_unit": payload.stock_unit or "adet",
        "instructions": payload.instructions or "",
        "archived": payload.archived or False,
        "schedule_type": payload.schedule_type or "everyday",
        "weekdays": payload.weekdays,
        "interval_days": payload.interval_days,
        "periodic_use_days": payload.periodic_use_days,
        "periodic_break_days": payload.periodic_break_days,
        "periodic_cycle_type": payload.periodic_cycle_type or "day",
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
        if d and d.get("start_date"):
            try:
                start = DateType.fromisoformat(d["start_date"])
                dur = update["duration_days"] if update["duration_days"] is not None else 365
                update["end_date"] = (start + timedelta(days=dur - 1)).isoformat()
            except Exception as ex:
                logger.error(f"Error calculating end_date during update: {ex}")
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
    
    # Handle pending status deletion (undo log)
    if payload.status == "pending":
        if existing:
            await db.dose_logs.delete_one({"id": log_id})
            # Refund stock if it was taken previously
            if existing.get("status") == "taken":
                stock_take = med.get("stock_take") or 1
                
                # Refund stock_total
                stock_total = med.get("stock_total")
                if stock_total is not None:
                    await db.medications.update_one(
                        {"id": payload.medication_id, "user_id": user["id"]},
                        {"$set": {"stock_total": stock_total + stock_take}}
                    )
                
                # Refund premium stock_count
                stock_count = med.get("stock_count")
                if stock_count is not None:
                    await db.medications.update_one(
                        {"id": payload.medication_id, "user_id": user["id"]},
                        {"$set": {"stock_count": stock_count + int(stock_take)}}
                    )
                    
        return DoseLog(
            id=log_id,
            user_id=user["id"],
            medication_id=payload.medication_id,
            medication_name=med["name"],
            scheduled_date=payload.scheduled_date,
            scheduled_time=payload.scheduled_time,
            status="pending",
            logged_at=datetime.now(timezone.utc).isoformat(),
            postponed_time=None,
            actual_time=None,
            dose_amount=float(med.get("stock_take") or 1.0),
            dose_unit=med.get("stock_unit", "adet"),
            note="",
            created_at=datetime.now(timezone.utc).isoformat()
        )

    # Stock adjustment logic
    old_status = existing["status"] if existing else "pending"
    new_status = payload.status

    if old_status != new_status:
        stock_take = med.get("stock_take") or 1
        
        # 1. Update stock_total (legacy)
        stock_total = med.get("stock_total")
        if stock_total is not None:
            adjusted_stock = stock_total
            if old_status == "taken" and new_status != "taken":
                adjusted_stock = stock_total + stock_take
            elif old_status != "taken" and new_status == "taken":
                adjusted_stock = max(0, stock_total - stock_take)
            
            if adjusted_stock != stock_total:
                await db.medications.update_one(
                    {"id": payload.medication_id, "user_id": user["id"]},
                    {"$set": {"stock_total": adjusted_stock}}
                )
                
        # 2. Update stock_count (premium)
        stock_count = med.get("stock_count")
        if stock_count is not None:
            adjusted_count = stock_count
            if old_status == "taken" and new_status != "taken":
                adjusted_count = stock_count + int(stock_take)
            elif old_status != "taken" and new_status == "taken":
                adjusted_count = max(0, stock_count - int(stock_take))
                
            if adjusted_count != stock_count:
                await db.medications.update_one(
                    {"id": payload.medication_id, "user_id": user["id"]},
                    {"$set": {"stock_count": adjusted_count}}
                )

    actual_time_val = payload.actual_time or (datetime.now(timezone.utc).isoformat() if payload.status in ["taken", "skipped"] else None)

    doc = {
        "id": log_id,
        "user_id": user["id"],
        "medication_id": payload.medication_id,
        "medication_name": med["name"],
        "scheduled_date": payload.scheduled_date,
        "scheduled_time": payload.scheduled_time,
        "status": payload.status,
        "logged_at": datetime.now(timezone.utc).isoformat(),
        "postponed_time": payload.postponed_time,
        "actual_time": actual_time_val,
        "dose_amount": payload.dose_amount if payload.dose_amount is not None else float(med.get("stock_take") or 1.0),
        "dose_unit": payload.dose_unit or med.get("stock_unit", "adet"),
        "note": payload.note or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    if existing:
        await db.dose_logs.update_one({"id": log_id}, {"$set": doc})
    else:
        await db.dose_logs.insert_one(dict(doc))

    return DoseLog(**doc)


def is_medication_scheduled_on(m: dict, target_date: DateType) -> bool:
    start_str = m.get("start_date")
    if not start_str:
        return False
    try:
        months_tr = {
            "ocak": "01", "şubat": "02", "mart": "03", "nisan": "04", "mayıs": "05", "haziran": "06",
            "temmuz": "07", "ağustos": "08", "eylül": "09", "ekim": "10", "kasım": "11", "aralık": "12"
        }
        clean_date = start_str.lower().strip()
        for k, v in months_tr.items():
            if k in clean_date:
                parts = clean_date.split()
                if len(parts) == 3:
                    day = parts[0].zfill(2)
                    year = parts[2]
                    clean_date = f"{year}-{v}-{day}"
                break
        start_date = DateType.fromisoformat(clean_date)
    except Exception:
        return False

    if target_date < start_date:
        return False

    end_str = m.get("end_date")
    if end_str and end_str != "Yok":
        try:
            clean_end = end_str.lower().strip()
            for k, v in months_tr.items():
                if k in clean_end:
                    parts = clean_end.split()
                    if len(parts) == 3:
                        day = parts[0].zfill(2)
                        year = parts[2]
                        clean_end = f"{year}-{v}-{day}"
                    break
            end_date = DateType.fromisoformat(clean_end)
            if target_date > end_date:
                return False
        except Exception:
            pass

    stype = m.get("schedule_type", "everyday")
    if stype == "everyday":
        return True
    elif stype == "specific_days":
        weekday = target_date.weekday() # Monday=0, Sunday=6
        weekdays = m.get("weekdays")
        if weekdays is None:
            return True
        return weekday in weekdays
    elif stype == "every_few_days":
        diff_days = (target_date - start_date).days
        if diff_days < 0:
            return False
        interval = m.get("interval_days") or 2
        return diff_days % interval == 0
    elif stype == "periodic":
        diff_days = (target_date - start_date).days
        if diff_days < 0:
            return False
        use_days = m.get("periodic_use_days") or 21
        break_days = m.get("periodic_break_days") or 7
        cycle_len = use_days + break_days
        if cycle_len <= 0:
            return True
        day_of_cycle = diff_days % cycle_len
        return day_of_cycle < use_days
    elif stype == "as_needed":
        return False
        
    return True


@api.get("/schedule/today")
async def schedule_today(user: dict = Depends(get_current_user)):
    """Return today's medication doses with their status."""
    today = DateType.today()
    today_str = today.isoformat()

    meds = await db.medications.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    active_meds = [m for m in meds if is_medication_scheduled_on(m, today)]

    logs = await db.dose_logs.find(
        {"user_id": user["id"], "scheduled_date": today_str}, {"_id": 0}
    ).to_list(500)
    log_idx = {(l["medication_id"], l["scheduled_time"]): l for l in logs}

    items = []
    for m in active_meds:
        for t in m["times"]:
            log = log_idx.get((m["id"], t))
            status = log["status"] if log else "pending"
            disp_time = t
            postponed_time = None
            if log and log.get("status") == "postponed" and log.get("postponed_time"):
                disp_time = log["postponed_time"]
                postponed_time = log["postponed_time"]
            
            items.append(
                {
                    "medication_id": m["id"],
                    "medication_name": m["name"],
                    "dosage": m["dosage"],
                    "notes": m.get("notes", ""),
                    "scheduled_date": today_str,
                    "scheduled_time": disp_time,
                    "original_time": t,
                    "status": status,
                    "postponed_time": postponed_time,
                    "stock_total": m.get("stock_total"),
                    "stock_take": m.get("stock_take"),
                    # Premium Fields
                    "medication_type": m.get("medication_type", "tablet"),
                    "visual_shape": m.get("visual_shape", "tablet"),
                    "visual_color": m.get("visual_color", "blue"),
                    "stock_count": m.get("stock_count"),
                    "stock_unit": m.get("stock_unit", "adet"),
                    "instructions": m.get("instructions", ""),
                }
            )
    items.sort(key=lambda x: x["scheduled_time"])
    return {"date": today_str, "items": items}


@api.get("/stats/summary")
async def stats_summary(user: dict = Depends(get_current_user)):
    """Dashboard summary: total active meds, today taken, today remaining, streak."""
    today = DateType.today()
    today_str = today.isoformat()

    meds = await db.medications.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    active_meds_count = sum(1 for m in meds if is_medication_scheduled_on(m, today))

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
        day_meds = [m for m in meds if is_medication_scheduled_on(m, d)]
        scheduled = sum(len(m["times"]) for m in day_meds)
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
        "active_medications": active_meds_count,
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
    meds = await db.medications.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        d_str = d.isoformat()
        day_meds = [m for m in meds if is_medication_scheduled_on(m, d)]
        scheduled = sum(len(m["times"]) for m in day_meds)
        taken = await db.dose_logs.count_documents(
            {"user_id": user["id"], "scheduled_date": d_str, "status": "taken"}
        )
        rate = round(100 * taken / scheduled) if scheduled > 0 else 0
        result.append({"date": d_str, "scheduled": scheduled, "taken": taken, "rate": rate})
    return {"days": result}


@api.get("/stats/medication-adherence")
async def per_med_adherence(user: dict = Depends(get_current_user)):
    """Per-medication adherence rate."""
    today = DateType.today()
    today_str = today.isoformat()
    meds = await db.medications.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    out = []
    for m in meds:
        try:
            start_str = m.get("start_date") or today_str
            start = DateType.fromisoformat(start_str)
        except Exception:
            start = today
            
        end_str = m.get("end_date") or today_str
        if end_str == "Yok" or not end_str:
            end = today
        else:
            try:
                end = DateType.fromisoformat(end_str)
            except Exception:
                end = today

        cap_end = min(end, today)
        if cap_end < start:
            out.append({
                "medication_id": m["id"],
                "name": m["name"],
                "dosage": m.get("dosage") or "1 Doz",
                "rate": 0,
                "taken": 0,
                "scheduled": 0,
                "is_active": m.get("end_date", "") >= today_str if m.get("end_date") != "Yok" else True
            })
            continue

        # Count actual scheduled days
        scheduled_days = 0
        curr = start
        while curr <= cap_end:
            if is_medication_scheduled_on(m, curr):
                scheduled_days += 1
            curr += timedelta(days=1)
            
        scheduled = scheduled_days * len(m.get("times") or [])
        taken = await db.dose_logs.count_documents(
            {"user_id": user["id"], "medication_id": m["id"], "status": "taken"}
        )
        rate = round(100 * taken / scheduled) if scheduled > 0 else 0
        out.append(
            {
                "medication_id": m["id"],
                "name": m["name"],
                "dosage": m.get("dosage") or "1 Doz",
                "rate": rate,
                "taken": taken,
                "scheduled": scheduled,
                "is_active": m.get("end_date", "") >= today_str if m.get("end_date") != "Yok" else True,
            }
        )
    return {"medications": out}


# =========================
# AI CHAT
# =========================
HEALTH_SYSTEM_PROMPT = """You are MediAssist Health Assistant, a helpful but cautious AI designed exclusively to assist users with health-related questions. You ONLY respond to questions about: symptoms, medications, herbal remedies, nutrition, general wellness, first aid, and medical terminology. You MUST REFUSE to answer any non-health-related questions politely. You NEVER provide definitive diagnoses or prescribe treatments. Every response MUST end with: '⚠️ Bu bilgi yalnızca genel sağlık amaçlıdır. Lütfen mutlaka bir doktora veya eczacıya danışın.' You may suggest herbal/natural remedies when relevant but always note they are complementary, not replacements for medical care. Respond in the same language as the user (Turkish or English). Keep responses concise, clear, and empathetic."""
HEALTH_SYSTEM_PROMPT += """ Be conversational and active: remember the recent conversation, ask one useful follow-up question when details are missing, offer practical next steps, and gently guide the user toward safer decisions. When the user shares symptoms, ask about duration, severity, age, pregnancy status when relevant, current medications, allergies, and red flags. Do not overwhelm the user; keep each answer structured and easy to continue."""


async def _get_default_conversation(user_id: str) -> str:
    conv = await db.conversations.find_one({"user_id": user_id}, {"_id": 0}, sort=[("updated_at", -1)])
    if conv:
        return conv["id"]
    new_id = str(uuid.uuid4())
    doc = {
        "id": new_id,
        "user_id": user_id,
        "title": "Varsayılan Sohbet",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.conversations.insert_one(doc)
    return new_id


@api.get("/chat/conversations")
async def get_conversations(user: dict = Depends(get_current_user)):
    docs = await db.conversations.find({"user_id": user["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(100)
    return {"conversations": docs}


@api.post("/chat/new")
async def create_conversation(req: ConversationCreate, user: dict = Depends(get_current_user)):
    new_id = str(uuid.uuid4())
    doc = {
        "id": new_id,
        "user_id": user["id"],
        "title": req.title or "Yeni Sohbet",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.conversations.insert_one(doc)
    return doc


@api.delete("/chat/conversations/{conv_id}")
async def delete_conversation(conv_id: str, user: dict = Depends(get_current_user)):
    await db.conversations.delete_one({"id": conv_id, "user_id": user["id"]})
    await db.chat_messages.delete_many({"conversation_id": conv_id, "user_id": user["id"]})
    return {"success": True}


@api.patch("/chat/conversations/{conv_id}")
async def update_conversation(conv_id: str, req: ConversationUpdate, user: dict = Depends(get_current_user)):
    res = await db.conversations.update_one(
        {"id": conv_id, "user_id": user["id"]},
        {"$set": {"title": req.title.strip(), "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Conversation not found")
    return {"success": True}


@api.post("/chat/send")
@api.post("/chat/message")
async def chat_send(req: ChatRequest, user: dict = Depends(get_current_user)):
    if not GEMINI_API_KEY:
        raise HTTPException(503, "GEMINI_API_KEY is missing. Add it to backend/.env and restart the backend.")

    conv_id = req.conversation_id
    is_new = False
    
    # Check if the user passed an old implicit ID (from legacy frontend) or none at all
    if not conv_id:
        conv_id = str(uuid.uuid4())
        is_new = True
        doc = {
            "id": conv_id,
            "user_id": user["id"],
            "title": "Yeni Sohbet",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.conversations.insert_one(doc)

    user_msg_id = str(uuid.uuid4())
    user_msg_doc = {
        "id": user_msg_id,
        "user_id": user["id"],
        "conversation_id": conv_id,
        "role": "user",
        "content": req.message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.chat_messages.insert_one(user_msg_doc)
    user_msg_doc.pop("_id", None)

    # Title generation for new chats
    if is_new:
        try:
            lang_str = "Türkçe" if req.language == "tr" else "İngilizce"
            t_prompt = f"Aşağıdaki mesajı özetleyen, en fazla 3-4 kelimelik, tırnaksız ve noktalama işareti içermeyen kısa bir başlık oluştur. Dil: {lang_str}. Mesaj: {req.message}"
            t_resp = await generate_content_async_with_fallback(t_prompt)
            generated_title = t_resp.text.strip().replace('"', '').replace("'", "")
            if generated_title:
                await db.conversations.update_one({"id": conv_id}, {"$set": {"title": generated_title}})
        except Exception:
            pass

    try:
        # Fetch recent messages strictly for this conversation
        recent_msgs = await db.chat_messages.find(
            {"conversation_id": conv_id, "user_id": user["id"]}, {"_id": 0}
        ).sort("timestamp", 1).to_list(50)
        
        # In case some old messages don't have conversation_id, fall back to getting the user's latest 50
        if not recent_msgs and not is_new:
            recent_msgs = await db.chat_messages.find({"user_id": user["id"]}, {"_id": 0}).sort("timestamp", 1).to_list(50)

        contents = []
        for m in recent_msgs:
            role = "user" if m["role"] == "user" else "model"
            contents.append({"role": role, "parts": [m["content"]]})
            
        response = await generate_content_async_with_fallback(contents, system_instruction=HEALTH_SYSTEM_PROMPT)
        response_text = response.text
    except Exception as e:
        logger.exception("LLM error")
        raise HTTPException(502, f"AI service error: {str(e)}")

    ai_msg = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "conversation_id": conv_id,
        "role": "assistant",
        "content": response_text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.chat_messages.insert_one(dict(ai_msg))
    ai_msg.pop("_id", None)

    await db.conversations.update_one(
        {"id": conv_id},
        {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Trim to last 50 per conversation
    count = await db.chat_messages.count_documents({"conversation_id": conv_id, "user_id": user["id"]})
    if count > 50:
        oldest = await db.chat_messages.find({"conversation_id": conv_id, "user_id": user["id"]}, {"_id": 0}).sort(
            "timestamp", 1
        ).to_list(count - 50)
        ids = [o["id"] for o in oldest]
        await db.chat_messages.delete_many({"id": {"$in": ids}})

    conv_doc = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
    if not conv_doc:
        conv_doc = {"id": conv_id, "title": "Sohbet"}

    return {"conversation": conv_doc, "user_message": user_msg_doc, "ai_message": ai_msg}


@api.get("/chat/history")
async def chat_history(user: dict = Depends(get_current_user), conversation_id: Optional[str] = None):
    # Backward compatibility: if no conversation_id, find the latest one or create default
    conv_id = conversation_id or await _get_default_conversation(user["id"])
    
    # First, let's see if there are old messages without a conversation_id and attach them to default
    old_unattached = await db.chat_messages.find({"conversation_id": {"$exists": False}, "user_id": user["id"]}).to_list(1)
    if old_unattached:
        await db.chat_messages.update_many(
            {"conversation_id": {"$exists": False}, "user_id": user["id"]},
            {"$set": {"conversation_id": conv_id}}
        )

    msgs = await db.chat_messages.find({"conversation_id": conv_id, "user_id": user["id"]}, {"_id": 0}).sort(
        "timestamp", 1
    ).to_list(100)
    
    return {"messages": msgs, "conversation_id": conv_id}


@api.delete("/chat/history")
async def clear_chat(user: dict = Depends(get_current_user)):
    await db.chat_messages.delete_many({"user_id": user["id"]})
    await db.conversations.delete_many({"user_id": user["id"]})
    return {"success": True}


@api.put("/chat/message/{message_id}")
async def edit_chat_message(
    message_id: str, req: ChatMessageEditRequest, user: dict = Depends(get_current_user)
):
    # 1. Find the target message
    target_msg = await db.chat_messages.find_one({"id": message_id, "user_id": user["id"]})
    if not target_msg:
        raise HTTPException(404, "Message not found")

    conv_id = target_msg["conversation_id"]
    timestamp = target_msg["timestamp"]

    # 2. Delete all subsequent messages in this conversation
    await db.chat_messages.delete_many(
        {
            "conversation_id": conv_id,
            "user_id": user["id"],
            "timestamp": {"$gt": timestamp}
        }
    )

    # 3. Update the content of the target message
    await db.chat_messages.update_one(
        {"id": message_id, "user_id": user["id"]},
        {"$set": {"content": req.content}}
    )

    # 4. Fetch the history of the conversation to feed into Gemini
    recent_msgs = await db.chat_messages.find(
        {"conversation_id": conv_id, "user_id": user["id"]}, {"_id": 0}
    ).sort("timestamp", 1).to_list(50)

    contents = []
    for m in recent_msgs:
        role = "user" if m["role"] == "user" else "model"
        contents.append({"role": role, "parts": [m["content"]]})

    # 5. Generate new AI response
    try:
        response = await generate_content_async_with_fallback(contents, system_instruction=HEALTH_SYSTEM_PROMPT)
        response_text = response.text
    except Exception as e:
        logger.exception("LLM error during edit")
        raise HTTPException(502, f"AI service error: {str(e)}")

    # 6. Save the new AI response
    ai_msg = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "conversation_id": conv_id,
        "role": "assistant",
        "content": response_text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.chat_messages.insert_one(dict(ai_msg))
    ai_msg.pop("_id", None)

    # Update conversation's updated_at
    await db.conversations.update_one(
        {"id": conv_id},
        {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    # 7. Return updated history
    updated_msgs = await db.chat_messages.find(
        {"conversation_id": conv_id, "user_id": user["id"]}, {"_id": 0}
    ).sort("timestamp", 1).to_list(100)

    return {"messages": updated_msgs, "ai_message": ai_msg}


@api.post("/chat/conversations/{conv_id}/regenerate")
async def regenerate_chat_response(
    conv_id: str, user: dict = Depends(get_current_user)
):
    # 1. Verify the conversation exists and belongs to the user
    conv = await db.conversations.find_one({"id": conv_id, "user_id": user["id"]})
    if not conv:
        raise HTTPException(404, "Conversation not found")

    # 2. Find the last message in this conversation
    last_msg = await db.chat_messages.find_one(
        {"conversation_id": conv_id, "user_id": user["id"]},
        sort=[("timestamp", -1)]
    )
    if not last_msg:
        raise HTTPException(400, "No messages in conversation to regenerate")

    # 3. If the last message is an assistant message, delete it
    if last_msg["role"] == "assistant":
        await db.chat_messages.delete_one({"id": last_msg["id"]})

    # 4. Fetch the history of the conversation to feed into Gemini
    recent_msgs = await db.chat_messages.find(
        {"conversation_id": conv_id, "user_id": user["id"]}, {"_id": 0}
    ).sort("timestamp", 1).to_list(50)

    if not recent_msgs:
        raise HTTPException(400, "No messages left in conversation to regenerate")

    # Ensure the last message in history is a user message
    if recent_msgs[-1]["role"] != "user":
        raise HTTPException(400, "Last message must be a user message to regenerate response")

    contents = []
    for m in recent_msgs:
        role = "user" if m["role"] == "user" else "model"
        contents.append({"role": role, "parts": [m["content"]]})

    # 5. Generate new AI response
    try:
        response = await generate_content_async_with_fallback(contents, system_instruction=HEALTH_SYSTEM_PROMPT)
        response_text = response.text
    except Exception as e:
        logger.exception("LLM error during regenerate")
        raise HTTPException(502, f"AI service error: {str(e)}")

    # 6. Save the new AI response
    ai_msg = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "conversation_id": conv_id,
        "role": "assistant",
        "content": response_text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.chat_messages.insert_one(dict(ai_msg))
    ai_msg.pop("_id", None)

    # Update conversation's updated_at
    await db.conversations.update_one(
        {"id": conv_id},
        {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    # 7. Return the updated messages list
    updated_msgs = await db.chat_messages.find(
        {"conversation_id": conv_id, "user_id": user["id"]}, {"_id": 0}
    ).sort("timestamp", 1).to_list(100)

    return {"messages": updated_msgs, "ai_message": ai_msg}


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
        response = await generate_content_async_with_fallback(
            [
                {"mime_type": "image/jpeg", "data": img_b64},
                "You are a pharmaceutical vision expert. Always respond with valid JSON only.\n\n" + prompt
            ],
            generation_config={"response_mime_type": "application/json"}
        )
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
        response = await generate_content_async_with_fallback([
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


# Fallback cities and districts
FALLBACK_CITIES = [
    {"name": "İstanbul", "slug": "istanbul"},
    {"name": "Ankara", "slug": "ankara"},
    {"name": "İzmir", "slug": "izmir"},
    {"name": "Bursa", "slug": "bursa"},
    {"name": "Antalya", "slug": "antalya"},
    {"name": "Adana", "slug": "adana"},
    {"name": "Konya", "slug": "konya"},
    {"name": "Gaziantep", "slug": "gaziantep"},
    {"name": "Kocaeli", "slug": "kocaeli"},
    {"name": "Mersin", "slug": "mersin"},
]

FALLBACK_DISTRICTS = {
    "istanbul": [
        {"name": "Adalar", "slug": "adalar"}, {"name": "Arnavutköy", "slug": "arnavutkoy"},
        {"name": "Ataşehir", "slug": "atasehir"}, {"name": "Avcılar", "slug": "avcilar"},
        {"name": "Bağcılar", "slug": "bagcilar"}, {"name": "Bahçelievler", "slug": "bahcelievler"},
        {"name": "Bakırköy", "slug": "bakirkoy"}, {"name": "Başakşehir", "slug": "basaksehir"},
        {"name": "Bayrampaşa", "slug": "bayrampasa"}, {"name": "Beşiktaş", "slug": "besiktas"},
        {"name": "Beykoz", "slug": "beykoz"}, {"name": "Beylikdüzü", "slug": "beylikduzu"},
        {"name": "Beyoğlu", "slug": "beyoglu"}, {"name": "Büyükçekmece", "slug": "buyukcekmece"},
        {"name": "Çatalca", "slug": "catalca"}, {"name": "Çekmeköy", "slug": "cekmekoy"},
        {"name": "Esenler", "slug": "esenler"}, {"name": "Esenyurt", "slug": "esenyurt"},
        {"name": "Eyüpsultan", "slug": "eyupsultan"}, {"name": "Fatih", "slug": "fatih"},
        {"name": "Gaziosmanpaşa", "slug": "gaziosmanpasa"}, {"name": "Güngören", "slug": "gungoren"},
        {"name": "Kadıköy", "slug": "kadikoy"}, {"name": "Kağıthane", "slug": "kagithane"},
        {"name": "Kartal", "slug": "kartal"}, {"name": "Küçükçekmece", "slug": "kucukcekmece"},
        {"name": "Maltepe", "slug": "maltepe"}, {"name": "Pendik", "slug": "pendik"},
        {"name": "Sancaktepe", "slug": "sancaktepe"}, {"name": "Sarıyer", "slug": "sariyer"},
        {"name": "Silivri", "slug": "silivri"}, {"name": "Sultanbeyli", "slug": "sultanbeyli"},
        {"name": "Sultangazi", "slug": "sultangazi"}, {"name": "Şile", "slug": "sile"},
        {"name": "Şişli", "slug": "sisli"}, {"name": "Tuzla", "slug": "tuzla"},
        {"name": "Ümraniye", "slug": "umraniye"}, {"name": "Üsküdar", "slug": "uskudar"},
        {"name": "Zeytinburnu", "slug": "zeytinburnu"}
    ],
    "ankara": [
        {"name": "Akyurt", "slug": "akyurt"}, {"name": "Altındağ", "slug": "altindag"},
        {"name": "Ayaş", "slug": "ayas"}, {"name": "Bala", "slug": "bala"},
        {"name": "Beypazarı", "slug": "beypazari"}, {"name": "Çamlıdere", "slug": "camlidere"},
        {"name": "Çankaya", "slug": "cankaya"}, {"name": "Çubuk", "slug": "cubuk"},
        {"name": "Elmadağ", "slug": "elmadag"}, {"name": "Etimesgut", "slug": "etimesgut"},
        {"name": "Evren", "slug": "evren"}, {"name": "Gölbaşı", "slug": "golbasi"},
        {"name": "Güdül", "slug": "gudul"}, {"name": "Haymana", "slug": "haymana"},
        {"name": "Kahramankazan", "slug": "kahramankazan"}, {"name": "Kalecik", "slug": "kalecik"},
        {"name": "Keçiören", "slug": "kecioren"}, {"name": "Kızılcahamam", "slug": "kizilcahamam"},
        {"name": "Mamak", "slug": "mamak"}, {"name": "Nallıhan", "slug": "nallihan"},
        {"name": "Polatlı", "slug": "polatli"}, {"name": "Pursaklar", "slug": "pursaklar"},
        {"name": "Sincan", "slug": "sincan"}, {"name": "Şereflikoçhisar", "slug": "sereflikochisar"},
        {"name": "Yenimahalle", "slug": "yenimahalle"}
    ],
    "izmir": [
        {"name": "Aliağa", "slug": "aliaga"}, {"name": "Balçova", "slug": "balcova"},
        {"name": "Bayındır", "slug": "bayindir"}, {"name": "Bayraklı", "slug": "bayrakli"},
        {"name": "Bergama", "slug": "bergama"}, {"name": "Beydağ", "slug": "beydag"},
        {"name": "Bornova", "slug": "bornova"}, {"name": "Buca", "slug": "buca"},
        {"name": "Çeşme", "slug": "cesme"}, {"name": "Çiğli", "slug": "cigli"},
        {"name": "Dikili", "slug": "dikili"}, {"name": "Foça", "slug": "foca"},
        {"name": "Gaziemir", "slug": "gaziemir"}, {"name": "Güzelbahçe", "slug": "guzelbahce"},
        {"name": "Karabağlar", "slug": "karabaglar"}, {"name": "Karaburun", "slug": "karaburun"},
        {"name": "Karşıyaka", "slug": "karsiyaka"}, {"name": "Kemalpaşa", "slug": "kemalpasa"},
        {"name": "Kınık", "slug": "kinik"}, {"name": "Kiraz", "slug": "kiraz"},
        {"name": "Konak", "slug": "konak"}, {"name": "Menderes", "slug": "menderes"},
        {"name": "Menemen", "slug": "menemen"}, {"name": "Narlıdere", "slug": "narlidere"},
        {"name": "Ödemiş", "slug": "odemis"}, {"name": "Seferihisar", "slug": "seferihisar"},
        {"name": "Selçuk", "slug": "selcuk"}, {"name": "Tire", "slug": "tire"},
        {"name": "Torbalı", "slug": "torbali"}, {"name": "Urla", "slug": "urla"}
    ]
}


def slugify_turkish(text: str) -> str:
    """Normalize Turkish characters and slugify the input text."""
    if not text:
        return ""
    # Map Turkish characters to English equivalents
    mapping = {
        "İ": "i", "I": "ı", "Ş": "ş", "Ğ": "ğ", "Ü": "ü", "Ö": "ö", "Ç": "ç",
        "ı": "i", "ş": "s", "ğ": "g", "ü": "u", "ö": "o", "ç": "c"
    }
    cleaned = text
    for k, v in mapping.items():
        cleaned = cleaned.replace(k, v)
    cleaned = cleaned.lower()
    
    # Remove non-alphanumeric (except spaces and hyphens)
    import re
    cleaned = re.sub(r'[^a-z0-9\s-]', '', cleaned)
    # Replace multiple spaces/hyphens with a single hyphen
    cleaned = re.sub(r'[\s-]+', '-', cleaned)
    return cleaned.strip('-')


def normalize_pharmacy(p: dict, is_duty_context: bool = False) -> dict:
    """Safe, robust normalization of pharmacy data from multiple schemas."""
    # Check all coordinate variations
    lat = p.get("latitude") or p.get("lat") or p.get("Latitude")
    lon = p.get("longitude") or p.get("lng") or p.get("lon") or p.get("Longitude")
    try:
        lat = float(lat) if lat is not None else None
        lon = float(lon) if lon is not None else None
    except (TypeError, ValueError):
        lat = lon = None

    # Check on-duty status variations
    is_on_duty = p.get("isOnDuty")
    if is_on_duty is None:
        is_on_duty = p.get("dutyPharmacy")
    if is_on_duty is None:
        is_on_duty = is_duty_context
    if isinstance(is_on_duty, str):
        is_on_duty = is_on_duty.lower() == "true"
    is_on_duty = bool(is_on_duty)

    # Resolve name, address, phone, city, district
    name = p.get("name") or p.get("pharmacyName") or p.get("Name") or p.get("eczane") or "Eczane"
    address = p.get("address") or p.get("adres") or p.get("Address") or p.get("loc") or ""
    phone = p.get("phone") or p.get("telefon") or p.get("Phone") or p.get("phoneNumber") or ""
    city = p.get("city") or p.get("il") or p.get("City") or ""
    district = p.get("district") or p.get("ilce") or p.get("District") or ""

    if district and district not in address:
        address = f"{address}, {district}".strip(", ")

    # Format working hours
    duty_start = p.get("dutyStart") or p.get("startDate") or p.get("StartDate")
    duty_end = p.get("dutyEnd") or p.get("endDate") or p.get("EndDate")
    if is_on_duty and (duty_start or duty_end or is_duty_context):
        hours = "24 Saat (Nöbetçi)"
    else:
        hours = p.get("hours") or p.get("workingHours") or "08:30 - 19:00"

    return {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{name}-{address}")),
        "name": name,
        "address": address,
        "phone": phone,
        "city": city,
        "district": district,
        "latitude": lat,
        "longitude": lon,
        # Backward compatibility for the legacy client fields
        "lat": lat,
        "lon": lon,
        "isOnDuty": is_on_duty,
        "on_call": is_on_duty,
        "hours": hours,
    }


def validate_and_fallback_coords(
    lat, lon, city_name="", district_name="", reference_lat=None, reference_lon=None
):
    """Validate coordinates and return fallback values if they are out of bounds or invalid."""
    try:
        if lat is not None and lon is not None:
            lat_f, lon_f = float(lat), float(lon)
            # Coordinates must be valid and within reasonable Turkey bounding box
            if abs(lat_f) > 0.01 and abs(lon_f) > 0.01 and 34.0 <= lat_f <= 43.0 and 24.0 <= lon_f <= 46.0:
                return lat_f, lon_f
    except (ValueError, TypeError):
        pass

    logger.warning(f"Invalid/missing coords ({lat}, {lon}) for {city_name}/{district_name}. Fallback triggered.")

    # Fallback 1: Use reference coordinates (e.g. search center/user coords) if valid
    try:
        if reference_lat is not None and reference_lon is not None:
            ref_lat, ref_lon = float(reference_lat), float(reference_lon)
            if abs(ref_lat) > 0.01 and abs(ref_lon) > 0.01 and 34.0 <= ref_lat <= 43.0 and 24.0 <= ref_lon <= 46.0:
                import random
                # Slight random displacement (roughly 100-500 meters) to prevent stacked markers
                return ref_lat + random.uniform(-0.004, 0.004), ref_lon + random.uniform(-0.004, 0.004)
    except (ValueError, TypeError):
        pass

    # Fallback 2: Center on Turkish cities
    TURKEY_CITY_COORDS = {
        "istanbul": (41.0082, 28.9784),
        "ankara": (39.9334, 32.8597),
        "izmir": (38.4192, 27.1287),
        "bursa": (40.1826, 29.0660),
        "antalya": (36.8969, 30.7133),
        "adana": (36.9914, 35.3308),
        "konya": (37.8714, 32.4847),
        "gaziantep": (37.0662, 37.3833),
        "sanliurfa": (37.1591, 38.7969),
        "kocaeli": (40.7654, 29.9408),
        "mersin": (36.8121, 34.6415),
        "diyarbakir": (37.9144, 40.2106),
        "hatay": (36.2023, 36.1606),
        "manisa": (38.6120, 27.4265),
        "kayseri": (38.7312, 35.4787),
        "samsun": (41.2867, 36.3300),
        "balikesir": (39.6484, 27.8826),
        "kahramanmaras": (37.5753, 36.9228),
        "van": (38.4891, 43.4019),
        "aydin": (37.8450, 27.8396),
    }
    
    city_slug = slugify_turkish(city_name)
    if city_slug in TURKEY_CITY_COORDS:
        c_lat, c_lon = TURKEY_CITY_COORDS[city_slug]
        import random
        return c_lat + random.uniform(-0.01, 0.01), c_lon + random.uniform(-0.01, 0.01)

    # Fallback 3: Istanbul Center
    import random
    return 41.0082 + random.uniform(-0.02, 0.02), 28.9784 + random.uniform(-0.02, 0.02)


async def _fetch_nosy_api_raw(url: str, params: dict) -> list:
    """Helper to query NosyAPI with timeout, rate limit handling, logging, and error handling."""
    if not NOSYAPI_KEY:
        logger.warning("NosyAPI key is not configured.")
        return []

    params["apiKey"] = NOSYAPI_KEY
    logger.info(f"Initiating call to NosyAPI: {url} with params {params}")
    try:
        async with httpx.AsyncClient(timeout=8.0) as cx:
            r = await cx.get(url, params=params)
            
            # Print/Log raw response for analysis as requested
            logger.info(f"NosyAPI raw response status: {r.status_code}")
            logger.info(f"NosyAPI raw response content (truncated): {r.text[:800]}")
            print(f"[NOSYAPI RAW] URL: {url} | Status: {r.status_code} | Body: {r.text[:1500]}")
            
            if r.status_code == 429:
                logger.error("NosyAPI Rate limit hit (HTTP 429).")
                return []
            if r.status_code != 200:
                logger.warning(f"NosyAPI failed with HTTP {r.status_code}.")
                return []
                
            data = r.json()
            if data.get("status") == "failure":
                logger.warning(f"NosyAPI returned failure code: {data.get('message') or data.get('messageTR')}")
                return []
                
            return data.get("data") or data.get("result") or []
    except httpx.TimeoutException:
        logger.error(f"NosyAPI connection timed out: {url}")
        return []
    except Exception as e:
        logger.exception(f"Error querying NosyAPI: {e}")
        return []


async def _fetch_nominatim_locations(lat: float, lon: float) -> list:
    """OSM Nominatim search for nearby pharmacies (Location fallback)."""
    radius_m = 5000
    dlat = radius_m / 111000.0
    dlon = radius_m / (111000.0 * 0.75)
    viewbox = f"{lon-dlon},{lat+dlat},{lon+dlon},{lat-dlat}"
    
    url = "https://nominatim.openstreetmap.org/search.php"
    params = {"q": "pharmacy", "format": "jsonv2", "viewbox": viewbox, "bounded": 1, "limit": 40, "extratags": 1, "addressdetails": 1}
    logger.info(f"Fetching backup OSM pharmacies near lat={lat}, lon={lon}")
    try:
        async with httpx.AsyncClient(timeout=8.0) as cx:
            r = await cx.get(url, params=params, headers={"User-Agent": "MediAssistApp/1.0 (serhat@example.com)"})
            if r.status_code != 200:
                logger.warning(f"OSM Nominatim error {r.status_code}")
                return []
            data = r.json()
            out = []
            for d in data:
                addr = d.get("address", {})
                out.append({
                    "name": d.get("name") or "Eczane",
                    "address": d.get("display_name", ""),
                    "phone": d.get("extratags", {}).get("phone") or d.get("extratags", {}).get("contact:phone") or "",
                    "latitude": d.get("lat"),
                    "longitude": d.get("lon"),
                    "city": addr.get("province") or addr.get("city") or "",
                    "district": addr.get("suburb") or addr.get("town") or addr.get("district") or "",
                })
            return out
    except Exception as e:
        logger.exception(f"OSM Nominatim search failed: {e}")
        return []


async def _fetch_nominatim_by_city(city: str, district: Optional[str] = None) -> list:
    """OSM Nominatim search for pharmacies by city/district name."""
    url = "https://nominatim.openstreetmap.org/search.php"
    q_str = f"pharmacy in {district}, {city}, Turkey" if district else f"pharmacy in {city}, Turkey"
    params = {"q": q_str, "format": "jsonv2", "limit": 40, "extratags": 1, "addressdetails": 1}
    logger.info(f"Fetching backup OSM pharmacies in city query: '{q_str}'")
    try:
        async with httpx.AsyncClient(timeout=8.0) as cx:
            r = await cx.get(url, params=params, headers={"User-Agent": "MediAssistApp/1.0 (serhat@example.com)"})
            if r.status_code != 200:
                logger.warning(f"OSM Nominatim error {r.status_code}")
                return []
            data = r.json()
            out = []
            for d in data:
                addr = d.get("address", {})
                out.append({
                    "name": d.get("name") or "Eczane",
                    "address": d.get("display_name", ""),
                    "phone": d.get("extratags", {}).get("phone") or d.get("extratags", {}).get("contact:phone") or "",
                    "latitude": d.get("lat"),
                    "longitude": d.get("lon"),
                    "city": addr.get("province") or addr.get("city") or city,
                    "district": addr.get("suburb") or addr.get("town") or addr.get("district") or district or "",
                })
            return out
    except Exception as e:
        logger.exception(f"OSM Nominatim search failed: {e}")
        return []


def _is_pharmacy_duty_deterministic(pharmacy_name: str) -> bool:
    """Helper to deterministically tag ~15% of fallback pharmacies as duty based on the daily hash."""
    import hashlib
    today_str = datetime.now().strftime("%Y-%m-%d")
    hash_input = f"{pharmacy_name}-{today_str}".encode("utf-8")
    hash_val = int(hashlib.md5(hash_input).hexdigest(), 16)
    return (hash_val % 100) < 15


def _generate_mock_pharmacies(lat: float, lon: float, is_duty_context=False, city_name="", district_name="") -> list:
    """Disable mock generation and raise 503 Service Unavailable error instead."""
    raise HTTPException(
        status_code=503,
        detail="Gerçek eczane verisi alınamadı."
    )


async def _get_pharmacies_nearby_helper(lat: float, lon: float, radius_m: int = 5000, on_call_only: bool = False) -> tuple:
    """Unified logic fetching and merging pharmacies with all source fallbacks."""
    raw_items = []
    source = "nosyapi"
    
    # 1. NosyAPI Call
    if on_call_only:
        raw_items = await _fetch_nosy_api_raw(
            f"{NOSYAPI_BASE}/pharmacies-on-duty/locations", {"latitude": lat, "longitude": lon}
        )
        if not raw_items:
            # Fallback: key has no credit for premium locations on-duty, pull all locations & filter
            logger.info("Duty locations unavailable. Fetching all and filtering locally.")
            all_raw = await _fetch_nosy_api_raw(
                f"{NOSYAPI_BASE}/pharmacies/locations", {"latitude": lat, "longitude": lon}
            )
            raw_items = [p for p in all_raw if p.get("dutyPharmacy") or p.get("isOnDuty")]
    else:
        raw_items = await _fetch_nosy_api_raw(
            f"{NOSYAPI_BASE}/pharmacies/locations", {"latitude": lat, "longitude": lon}
        )

    # 2. Nominatim Fallback
    if not raw_items:
        logger.info("NosyAPI locations returned no results. Trying Nominatim.")
        source = "nominatim"
        osm_items = await _fetch_nominatim_locations(lat, lon)
        if on_call_only:
            raw_items = [p for p in osm_items if _is_pharmacy_duty_deterministic(p["name"])]
            for p in raw_items:
                p["isOnDuty"] = True
        else:
            raw_items = osm_items

    # 3. Mock Fallback
    if not raw_items:
        logger.info("Nominatim locations returned no results. Generating mock fallback.")
        source = "fallback"
        raw_items = _generate_mock_pharmacies(lat, lon, is_duty_context=on_call_only)

    # 4. Normalize & Validate coords
    out = []
    for it in raw_items:
        normalized = normalize_pharmacy(it, is_duty_context=on_call_only)
        
        # Handle fallback for wrong coordinates
        val_lat, val_lon = validate_and_fallback_coords(
            normalized["latitude"], normalized["longitude"],
            city_name=normalized["city"], district_name=normalized["district"],
            reference_lat=lat, reference_lon=lon
        )
        normalized["latitude"] = val_lat
        normalized["longitude"] = val_lon
        normalized["lat"] = val_lat
        normalized["lon"] = val_lon
        
        # Calculate distance
        dist = int(haversine(lat, lon, val_lat, val_lon))
        if dist > radius_m:
            continue
        normalized["distance_m"] = dist
        out.append(normalized)

    out.sort(key=lambda x: x.get("distance_m") or 999999)
    return out, source


async def _get_pharmacies_by_city_helper(city: str, district: Optional[str] = None, on_call_only: bool = False) -> tuple:
    """Unified logic fetching and merging pharmacies in city/district with fallbacks."""
    # Normalize inputs (Turkish char slugify)
    city_slug = slugify_turkish(city)
    district_slug = slugify_turkish(district) if district else None
    
    logger.info(f"Normalizing city query: City='{city}' -> '{city_slug}', District='{district}' -> '{district_slug}'")
    
    raw_items = []
    source = "nosyapi"

    # 1. NosyAPI Call
    params = {"city": city_slug}
    if district_slug:
        params["district"] = district_slug
        
    if on_call_only:
        raw_items = await _fetch_nosy_api_raw(f"{NOSYAPI_BASE}/pharmacies-on-duty", params)
        if not raw_items:
            logger.info("NosyAPI city-duty failed. Trying all city pharmacies with local filter.")
            all_raw = await _fetch_nosy_api_raw(f"{NOSYAPI_BASE}/pharmacies", params)
            raw_items = [p for p in all_raw if p.get("dutyPharmacy") or p.get("isOnDuty")]
    else:
        raw_items = await _fetch_nosy_api_raw(f"{NOSYAPI_BASE}/pharmacies", params)

    # 2. Nominatim Fallback
    if not raw_items:
        logger.info("NosyAPI city search returned no results. Trying Nominatim.")
        source = "nominatim"
        osm_items = await _fetch_nominatim_by_city(city_slug, district_slug)
        if on_call_only:
            raw_items = [p for p in osm_items if _is_pharmacy_duty_deterministic(p["name"])]
            for p in raw_items:
                p["isOnDuty"] = True
        else:
            raw_items = osm_items

    # 3. Mock Fallback
    if not raw_items:
        logger.info("Nominatim city search returned no results. Generating mock fallback.")
        source = "fallback"
        ref_lat, ref_lon = 41.0082, 28.9784
        TURKEY_CITY_COORDS = {
            "istanbul": (41.0082, 28.9784), "ankara": (39.9334, 32.8597), "izmir": (38.4192, 27.1287),
            "bursa": (40.1826, 29.0660), "antalya": (36.8969, 30.7133), "adana": (36.9914, 35.3308),
            "konya": (37.8714, 32.4847), "gaziantep": (37.0662, 37.3833), "sanliurfa": (37.1591, 38.7969),
            "kocaeli": (40.7654, 29.9408), "mersin": (36.8121, 34.6415), "diyarbakir": (37.9144, 40.2106),
            "hatay": (36.2023, 36.1606), "manisa": (38.6120, 27.4265), "kayseri": (38.7312, 35.4787),
            "samsun": (41.2867, 36.3300), "balikesir": (39.6484, 27.8826), "kahramanmaras": (37.5753, 36.9228),
            "van": (38.4891, 43.4019), "aydin": (37.8450, 27.8396)
        }
        if city_slug in TURKEY_CITY_COORDS:
            ref_lat, ref_lon = TURKEY_CITY_COORDS[city_slug]
        raw_items = _generate_mock_pharmacies(ref_lat, ref_lon, is_duty_context=on_call_only, city_name=city, district_name=district)

    # 4. Normalize & Validate Coords
    out = []
    for it in raw_items:
        normalized = normalize_pharmacy(it, is_duty_context=on_call_only)
        
        # Coordinates fallback
        val_lat, val_lon = validate_and_fallback_coords(
            normalized["latitude"], normalized["longitude"],
            city_name=normalized["city"] or city, district_name=normalized["district"] or district,
            reference_lat=None, reference_lon=None
        )
        normalized["latitude"] = val_lat
        normalized["longitude"] = val_lon
        normalized["lat"] = val_lat
        normalized["lon"] = val_lon
        normalized["distance_m"] = 0
        out.append(normalized)

    return out, source


# =========================
# ENDPOINTS
# =========================

@api.get("/pharmacies/duty/nearby")
async def pharmacies_duty_nearby(
    lat: float, lon: float, radius_m: int = 5000,
    user: dict = Depends(get_current_user),
):
    """Fetch nearby duty pharmacies (Separated)."""
    pharmacies, source = await _get_pharmacies_nearby_helper(lat, lon, radius_m, on_call_only=True)
    return {"pharmacies": pharmacies, "source": source, "on_call_only": True}


@api.get("/pharmacies/all/nearby")
async def pharmacies_all_nearby(
    lat: float, lon: float, radius_m: int = 5000,
    user: dict = Depends(get_current_user),
):
    """Fetch nearby general pharmacies (Separated)."""
    pharmacies, source = await _get_pharmacies_nearby_helper(lat, lon, radius_m, on_call_only=False)
    return {"pharmacies": pharmacies, "source": source, "on_call_only": False}


@api.get("/pharmacies/duty/by-city")
async def pharmacies_duty_by_city(
    city: str, district: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Fetch duty pharmacies by city/district (Separated)."""
    pharmacies, source = await _get_pharmacies_by_city_helper(city, district, on_call_only=True)
    return {"pharmacies": pharmacies, "source": source, "city": city, "district": district, "on_call_only": True}


@api.get("/pharmacies/all/by-city")
async def pharmacies_all_by_city(
    city: str, district: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Fetch all pharmacies by city/district (Separated)."""
    pharmacies, source = await _get_pharmacies_by_city_helper(city, district, on_call_only=False)
    return {"pharmacies": pharmacies, "source": source, "city": city, "district": district, "on_call_only": False}


@api.get("/pharmacies/cities")
async def get_cities(user: dict = Depends(get_current_user)):
    """Fetch major cities for dropdown search."""
    return {"cities": FALLBACK_CITIES}


@api.get("/pharmacies/districts")
async def get_districts(city: str, user: dict = Depends(get_current_user)):
    """Fetch districts for city dropdown search."""
    city_slug = slugify_turkish(city)
    districts = FALLBACK_DISTRICTS.get(city_slug, [])
    if not districts:
        districts = [{"name": "Merkez", "slug": "merkez"}]
    return {"districts": districts, "city": city_slug}


# Legacy compatibility endpoints
@api.get("/pharmacies/nearby")
async def pharmacies_nearby(
    lat: float, lon: float, radius_m: int = 5000, on_call_only: bool = False,
    user: dict = Depends(get_current_user),
):
    """Fallback compatibility nearby pharmacies."""
    pharmacies, source = await _get_pharmacies_nearby_helper(lat, lon, radius_m, on_call_only=on_call_only)
    return {"pharmacies": pharmacies, "source": source}


@api.get("/pharmacies/by-city")
async def pharmacies_by_city(
    city: str, district: Optional[str] = None, on_call_only: bool = False,
    user: dict = Depends(get_current_user),
):
    """Fallback compatibility city pharmacies."""
    pharmacies, source = await _get_pharmacies_by_city_helper(city, district, on_call_only=on_call_only)
    return {"pharmacies": pharmacies, "city": city, "district": district}


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
    await db.chat_messages.create_index([("conversation_id", 1), ("timestamp", 1)])
    await db.conversations.create_index([("user_id", 1), ("updated_at", -1)])
    await db.notification_logs.create_index([("user_id", 1), ("scheduled_date", -1)])
    await db.notification_logs.create_index([("notification_id", 1)])


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
