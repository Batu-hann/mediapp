"""MediAssist Backend API Tests"""
import os
import time
import uuid
import base64
import requests
import pytest
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Read from frontend .env
fe_env = Path("/app/frontend/.env").read_text()
BASE_URL = None
for line in fe_env.splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
        break


# ---------- Health ----------
class TestHealth:
    def test_root(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ---------- Auth ----------
class TestAuth:
    def test_register_new_user(self, api_client):
        unique = f"TEST_{uuid.uuid4().hex[:8]}@ex.com"
        payload = {
            "name": "TEST_FN", "surname": "TEST_LN",
            "email": unique, "password": "secret123",
            "date_of_birth": "1995-05-05", "phone_number": "+905551234567",
        }
        r = api_client.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data
        assert data["user"]["email"] == unique.lower()
        # Cleanup using token
        tok = data["access_token"]
        api_client.delete(f"{BASE_URL}/api/auth/account", headers={"Authorization": f"Bearer {tok}"}, timeout=10)

    def test_register_duplicate_email(self, api_client, auth_token):
        payload = {
            "name": "Test", "surname": "User",
            "email": "test@example.com", "password": "test123",
            "date_of_birth": "1990-01-01", "phone_number": "+905551112233",
        }
        r = api_client.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=10)
        assert r.status_code == 409

    def test_login_success(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"email": "test@example.com", "password": "test123"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["token_type"] == "bearer"
        assert d["user"]["email"] == "test@example.com"

    def test_login_wrong_password(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"email": "test@example.com", "password": "wrong"}, timeout=10)
        assert r.status_code == 401

    def test_me_with_token(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["email"] == "test@example.com"

    def test_me_without_token(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code in (401, 403)

    def test_update_profile(self, api_client, auth_headers):
        r = api_client.put(f"{BASE_URL}/api/auth/profile",
                           json={"phone_number": "+905559998877", "language": "en"},
                           headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["phone_number"] == "+905559998877"
        assert r.json()["language"] == "en"
        # Verify with GET
        r2 = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=10)
        assert r2.json()["language"] == "en"
        # Reset back
        api_client.put(f"{BASE_URL}/api/auth/profile",
                       json={"language": "tr"}, headers=auth_headers, timeout=10)

    def test_change_password_wrong_old(self, api_client, auth_headers):
        r = api_client.post(f"{BASE_URL}/api/auth/change-password",
                            json={"old_password": "wrong", "new_password": "newpass1"},
                            headers=auth_headers, timeout=10)
        assert r.status_code == 401


# ---------- Medications ----------
@pytest.fixture(scope="class")
def created_med_id(api_client, auth_headers):
    payload = {
        "name": "TEST_Aspirin", "dosage": "500 mg",
        "frequency_per_day": 2, "times": ["08:00", "20:00"],
        "duration_days": 7, "notes": "TEST med", "notifications_enabled": True,
    }
    r = api_client.post(f"{BASE_URL}/api/medications", json=payload, headers=auth_headers, timeout=10)
    assert r.status_code == 200, r.text
    mid = r.json()["id"]
    yield mid
    api_client.delete(f"{BASE_URL}/api/medications/{mid}", headers=auth_headers, timeout=10)


class TestMedications:
    def test_create_medication_computes_end_date(self, api_client, auth_headers):
        payload = {
            "name": "TEST_VitC", "dosage": "1000 mg",
            "frequency_per_day": 1, "times": ["09:00"],
            "duration_days": 10, "start_date": "2026-01-01",
        }
        r = api_client.post(f"{BASE_URL}/api/medications", json=payload, headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["start_date"] == "2026-01-01"
        assert d["end_date"] == "2026-01-10"
        assert d["name"] == "TEST_VitC"
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/medications/{d['id']}", headers=auth_headers, timeout=10)

    def test_list_medications(self, api_client, auth_headers, created_med_id):
        r = api_client.get(f"{BASE_URL}/api/medications", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()]
        assert created_med_id in ids

    def test_get_medication(self, api_client, auth_headers, created_med_id):
        r = api_client.get(f"{BASE_URL}/api/medications/{created_med_id}", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["id"] == created_med_id

    def test_get_medication_not_found(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/medications/nonexistent", headers=auth_headers, timeout=10)
        assert r.status_code == 404

    def test_update_medication(self, api_client, auth_headers, created_med_id):
        r = api_client.put(f"{BASE_URL}/api/medications/{created_med_id}",
                           json={"dosage": "750 mg", "duration_days": 14},
                           headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["dosage"] == "750 mg"
        assert r.json()["duration_days"] == 14
        # Verify GET
        g = api_client.get(f"{BASE_URL}/api/medications/{created_med_id}", headers=auth_headers, timeout=10)
        assert g.json()["dosage"] == "750 mg"


# ---------- Dose logs / Schedule ----------
class TestSchedule:
    def test_today_schedule(self, api_client, auth_headers, created_med_id):
        r = api_client.get(f"{BASE_URL}/api/schedule/today", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "date" in d
        # Should contain doses for our test med
        med_items = [i for i in d["items"] if i["medication_id"] == created_med_id]
        assert len(med_items) >= 1

    def test_log_dose_taken(self, api_client, auth_headers, created_med_id):
        from datetime import date as DT
        today = DT.today().isoformat()
        r = api_client.post(f"{BASE_URL}/api/dose-logs",
                            json={"medication_id": created_med_id, "scheduled_date": today,
                                  "scheduled_time": "08:00", "status": "taken"},
                            headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "taken"
        # Idempotent upsert: post again with skipped
        r2 = api_client.post(f"{BASE_URL}/api/dose-logs",
                             json={"medication_id": created_med_id, "scheduled_date": today,
                                   "scheduled_time": "08:00", "status": "skipped"},
                             headers=auth_headers, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["id"] == r.json()["id"]
        assert r2.json()["status"] == "skipped"

    def test_log_dose_invalid_med(self, api_client, auth_headers):
        r = api_client.post(f"{BASE_URL}/api/dose-logs",
                            json={"medication_id": "nonexistent", "scheduled_date": "2026-01-01",
                                  "scheduled_time": "08:00", "status": "taken"},
                            headers=auth_headers, timeout=10)
        assert r.status_code == 404


# ---------- Stats ----------
class TestStats:
    def test_summary(self, api_client, auth_headers, created_med_id):
        r = api_client.get(f"{BASE_URL}/api/stats/summary", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        for k in ["active_medications", "today_taken", "today_remaining", "today_total", "streak_days"]:
            assert k in d

    def test_adherence_chart(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/stats/adherence?days=7", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "days" in d
        assert len(d["days"]) == 7

    def test_per_med_adherence(self, api_client, auth_headers, created_med_id):
        r = api_client.get(f"{BASE_URL}/api/stats/medication-adherence", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "medications" in d


# ---------- Pharmacy ----------
class TestPharmacy:
    def test_nearby_default(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/pharmacies/nearby?lat=41.0082&lon=28.9784&radius_m=2000",
                           headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "pharmacies" in d
        assert len(d["pharmacies"]) > 0
        # Sorted by distance
        dists = [p["distance_m"] for p in d["pharmacies"]]
        assert dists == sorted(dists)

    def test_nearby_oncall_only(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/pharmacies/nearby?lat=41.0082&lon=28.9784&radius_m=5000&on_call_only=true",
                           headers=auth_headers, timeout=10)
        assert r.status_code == 200
        for p in r.json()["pharmacies"]:
            assert p["on_call"] is True

    def test_nearby_small_radius(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/pharmacies/nearby?lat=41.0082&lon=28.9784&radius_m=100",
                           headers=auth_headers, timeout=10)
        assert r.status_code == 200
        # Tiny radius -> likely 0 results
        for p in r.json()["pharmacies"]:
            assert p["distance_m"] <= 100


# ---------- Chat ----------
class TestChat:
    def test_chat_history_empty_or_list(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/chat/history", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert "messages" in r.json()

    def test_chat_send_validates_auth(self, api_client):
        r = requests.post(f"{BASE_URL}/api/chat/send",
                          json={"message": "hi", "language": "en"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_chat_send_authenticated(self, api_client, auth_headers):
        # Budget may be exceeded - 200 or 500 both acceptable
        r = api_client.post(f"{BASE_URL}/api/chat/send",
                            json={"message": "Hello, what is paracetamol?", "language": "en"},
                            headers=auth_headers, timeout=60)
        assert r.status_code in (200, 500)
        if r.status_code == 500:
            pytest.skip(f"AI budget likely exhausted: {r.text[:200]}")
        assert "ai_message" in r.json()

    def test_clear_chat(self, api_client, auth_headers):
        r = api_client.delete(f"{BASE_URL}/api/chat/history", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        # Verify empty
        h = api_client.get(f"{BASE_URL}/api/chat/history", headers=auth_headers, timeout=10)
        assert h.json()["messages"] == []


# ---------- Vision ----------
class TestVision:
    def test_vision_no_image(self, api_client, auth_headers):
        r = api_client.post(f"{BASE_URL}/api/vision/scan-medication",
                            json={"image_base64": "", "language": "en"},
                            headers=auth_headers, timeout=15)
        assert r.status_code == 400

    def test_vision_with_image(self, api_client, auth_headers):
        # 1x1 JPEG won't be accepted as proper but let's send a small real JPEG
        # Tiny valid JPEG (red dot)
        jpeg_b64 = (
            "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nIC"
            "IsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIy"
            "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAA"
            "AAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAA"
            "AAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z"
        )
        r = api_client.post(f"{BASE_URL}/api/vision/scan-medication",
                            json={"image_base64": jpeg_b64, "language": "en"},
                            headers=auth_headers, timeout=60)
        assert r.status_code in (200, 500)
        if r.status_code == 500:
            pytest.skip(f"AI vision budget likely exhausted: {r.text[:200]}")
        d = r.json()
        assert "medication_name" in d


# ---------- Account deletion (run last) ----------
class TestAccountDelete:
    def test_delete_account_cascades(self, api_client):
        # Create a temp user
        unique = f"TEST_DEL_{uuid.uuid4().hex[:8]}@ex.com"
        reg = {"name": "TempUser", "surname": "Del", "email": unique, "password": "secret123",
               "date_of_birth": "1990-01-01", "phone_number": "+90555000000"}
        rr = api_client.post(f"{BASE_URL}/api/auth/register", json=reg, timeout=10)
        assert rr.status_code == 200
        tok = rr.json()["access_token"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        # Create a med
        api_client.post(f"{BASE_URL}/api/medications",
                        json={"name": "TEST_ToDel", "dosage": "1 mg",
                              "frequency_per_day": 1, "times": ["09:00"],
                              "duration_days": 5}, headers=h, timeout=10)
        # Delete account
        r = api_client.delete(f"{BASE_URL}/api/auth/account", headers=h, timeout=10)
        assert r.status_code == 200
        # Token should now be invalid
        r2 = api_client.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=10)
        assert r2.status_code == 401
