#!/usr/bin/env python3
"""Exercise real emulator tokens and global quota enforcement, without paid AI calls."""
import hashlib, os, secrets
from datetime import datetime, timezone
import httpx
from google.cloud import firestore

assert (
    os.getenv("FIRESTORE_EMULATOR_HOST") == "127.0.0.1:8080"
), "Only run against the local emulator"
auth = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/"
api = "http://127.0.0.1:8000"
with httpx.Client(timeout=20) as c:
    assert c.get(api + "/health").status_code == 200
    assert c.get(api + "/v1/me").status_code == 401
    email = "smoke-" + secrets.token_hex(6) + "@example.com"
    password = secrets.token_urlsafe(16)
    created = c.post(
        auth + "accounts:signUp?key=fake",
        json={"email": email, "password": password, "returnSecureToken": True},
    )
    created.raise_for_status()
    user = created.json()
    token = user["idToken"]
    uid = user["localId"]
    header = {"Authorization": "Bearer " + token}
    assert c.get(api + "/v1/me", headers=header).json()["uid"] == uid
    body = {"messages": [{"role": "user", "content": "Plan a trip"}], "research": False}
    assert (
        c.post(api + "/v1/planner/chat", headers=header, json=body).status_code == 403
    )
    c.post(
        auth + "accounts:sendOobCode?key=fake",
        json={"requestType": "VERIFY_EMAIL", "idToken": token},
    ).raise_for_status()
    codes = c.get(
        "http://127.0.0.1:9099/emulator/v1/projects/demo-pocket/oobCodes"
    ).json()["oobCodes"]
    code = next(
        v["oobCode"]
        for v in codes
        if v["email"] == email and v["requestType"] == "VERIFY_EMAIL"
    )
    c.post(auth + "accounts:update?key=fake", json={"oobCode": code}).raise_for_status()
    signed = c.post(
        auth + "accounts:signInWithPassword?key=fake",
        json={"email": email, "password": password, "returnSecureToken": True},
    )
    signed.raise_for_status()
    token = signed.json()["idToken"]
    header = {"Authorization": "Bearer " + token}
    db = firestore.Client(project="demo-pocket")
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ref = db.collection("ai_daily_usage").document(
        day + "-" + hashlib.sha256(uid.encode()).hexdigest()
    )
    ref.set({"day": day, "units": 300})
    assert (
        c.post(api + "/v1/planner/chat", headers=header, json=body).status_code == 429
    )
    assert ref.get().to_dict()["units"] == 300
    # Prove a forged token does not authenticate.
    assert (
        c.get(
            api + "/v1/me", headers={"Authorization": "Bearer forged-token"}
        ).status_code
        == 401
    )
    c.post(
        auth + "accounts:delete?key=fake", json={"idToken": token}
    ).raise_for_status()
    assert c.get(api + "/v1/me", headers=header).status_code == 401
    ref.delete()
print(
    "Local signup, verification, identity, quota and deletion checks passed; no provider calls."
)
