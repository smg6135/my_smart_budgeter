#!/usr/bin/env python3
"""Exercise a throwaway cloud account. --ai makes small paid provider calls."""
import argparse
import base64
import hashlib
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
import firebase_admin
from firebase_admin import auth
from google.cloud import firestore
import httpx

parser = argparse.ArgumentParser()
parser.add_argument("--url", required=True)
parser.add_argument("--ai", action="store_true")
parser.add_argument("--research", action="store_true")
parser.add_argument(
    "--receipt", default=str(Path(__file__).parent / "fixtures/receipt-usd.png")
)
args = parser.parse_args()
if args.research and not args.ai:
    parser.error("--research requires --ai")
assert args.url in (
    "http://127.0.0.1:18000",
    "http://127.0.0.1:18001",
    "https://backend.normiesai.com",
    "https://sg.backend.normiesai.com",
)
assert not os.getenv("FIREBASE_AUTH_EMULATOR_HOST") and not os.getenv(
    "FIRESTORE_EMULATOR_HOST"
)
settings = dict(
    line.split("=", 1)
    for line in Path("apps/mobile/.env.production").read_text().splitlines()
    if "=" in line
)
app = firebase_admin.initialize_app(options={"projectId": "normies-main"})
password = secrets.token_urlsafe(24)
user = auth.create_user(
    email="pocket-smoke-" + secrets.token_hex(6) + "@example.com",
    password=password,
    email_verified=True,
    app=app,
)
# Use a real password sign-in to obtain a customer Firebase ID token.
db = firestore.Client(project="normies-main", database="pocket-usage")
day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
ref = db.collection("ai_daily_usage").document(
    day + "-" + hashlib.sha256(user.uid.encode()).hexdigest()
)
try:
    with httpx.Client(timeout=100) as c:
        sign = c.post(
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword",
            params={"key": settings["EXPO_PUBLIC_FIREBASE_API_KEY"]},
            json={"email": user.email, "password": password, "returnSecureToken": True},
        )
        assert sign.is_success, "Firebase password sign-in failed: " + str(
            sign.status_code
        )
        headers = {"Authorization": "Bearer " + sign.json()["idToken"]}
        assert c.get(args.url + "/health").status_code == 200
        assert c.get(args.url + "/v1/me").status_code == 401
        r = c.get(args.url + "/v1/me", headers=headers)
        assert r.status_code == 200 and r.json()["uid"] == user.uid
        r = c.get(args.url + "/v1/fx/rates?base=SGD", headers=headers)
        assert r.status_code == 200
        print(args.url, "auth + FX passed", flush=True)
        if args.ai:
            data = base64.b64encode(Path(args.receipt).read_bytes()).decode()
            for mode in ("bulk", "single"):
                r = c.post(
                    args.url + "/v1/receipts/scan",
                    headers=headers,
                    json={"data": data, "mime": "image/png", "mode": mode},
                )
                print("OCR", mode, "HTTP", r.status_code, flush=True)
                assert r.status_code == 200, r.text[:300]
                assert r.json()["amount"] == 5 and r.json()["currency"] == "USD"
            for mode in ("planning", "conversation"):
                r = c.post(
                    args.url + "/v1/planner/chat",
                    headers=headers,
                    json={
                        "messages": [
                            {
                                "role": "user",
                                "content": (
                                    "Plan a December 2027 New York weekend for two adults, no flights, midrange hotel, USD 2000 budget. Look up the official current MoMA adult admission price using web search and cite its official page."
                                    if args.research and mode == "planning"
                                    else "Help me save for a holiday. Ask one short question."
                                ),
                            }
                        ],
                        "research": bool(args.research and mode == "planning"),
                        "currency": "USD",
                        "mode": mode,
                    },
                )
                print(mode, "HTTP", r.status_code, flush=True)
                assert r.status_code == 200 and r.json()["message"], r.text[:300]
        ref.set({"units": 300, "day": day})
        r = c.post(
            args.url + "/v1/planner/chat",
            headers=headers,
            json={
                "messages": [{"role": "user", "content": "Plan a trip"}],
                "research": False,
            },
        )
        assert r.status_code == 429, "Global daily quota not enforced"
        auth.update_user(user.uid, disabled=True, app=app)
        assert c.get(args.url + "/v1/me", headers=headers).status_code == 401
        print("Global quota + disabled-token rejection passed", flush=True)
finally:
    try:
        ref.delete()
    finally:
        try:
            auth.delete_user(user.uid, app=app)
        finally:
            firebase_admin.delete_app(app)
