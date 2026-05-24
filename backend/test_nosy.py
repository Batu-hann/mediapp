import os
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

NOSYAPI_KEY = os.environ.get("NOSYAPI_KEY")
NOSYAPI_BASE = "https://www.nosyapi.com/apiv2/service"

async def run_test():
    # Test with latitude/longitude
    url = f"{NOSYAPI_BASE}/pharmacies-on-duty/locations"
    params = {"apiKey": NOSYAPI_KEY, "latitude": 41.0082, "longitude": 28.9784}
    async with httpx.AsyncClient() as cx:
        r = await cx.get(url, params=params)
        print("Params latitude/longitude:")
        print(r.json())
        
    url = f"{NOSYAPI_BASE}/pharmacies-on-duty/locations"
    params = {"apiKey": NOSYAPI_KEY, "lat": 41.0082, "lng": 28.9784}
    async with httpx.AsyncClient() as cx:
        r = await cx.get(url, params=params)
        print("Params lat/lng:")
        print(r.json())
        
    url2 = f"{NOSYAPI_BASE}/pharmacies/locations"
    params2 = {"apiKey": NOSYAPI_KEY, "latitude": 41.0082, "longitude": 28.9784}
    async with httpx.AsyncClient() as cx:
        r2 = await cx.get(url2, params=params2)
        print("All pharmacies latitude/longitude:")
        print(r2.json())

if __name__ == "__main__":
    asyncio.run(run_test())
