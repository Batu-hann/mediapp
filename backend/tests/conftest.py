import os
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if "EXPO_PUBLIC_BACKEND_URL" in os.environ else None
if not BASE_URL:
    # Read from frontend .env
    fe_env = Path("/app/frontend/.env").read_text()
    for line in fe_env.splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(api_client):
    """Login with seeded test user, register if missing."""
    creds = {"email": "test@example.com", "password": "test123"}
    r = api_client.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    if r.status_code != 200:
        # Register
        reg = {
            "name": "Test", "surname": "User",
            "email": "test@example.com", "password": "test123",
            "date_of_birth": "1990-01-01", "phone_number": "+905551112233",
        }
        api_client.post(f"{BASE_URL}/api/auth/register", json=reg, timeout=15)
        r = api_client.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
