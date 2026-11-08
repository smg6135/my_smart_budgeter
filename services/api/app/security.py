"""Verified customer identity, shared rate limits and global weighted AI quotas."""

import hashlib
import time
from datetime import datetime, timezone, timedelta
import anyio
from fastapi import HTTPException, Request
from firebase_admin import auth
from google.cloud import firestore

COSTS = {"ocr-bulk": 1, "ocr-single": 3, "planning": 5, "conversation": 10}
WINDOW_SCRIPT = """local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n"""


async def current_user(request: Request):
    if getattr(request.state, "uid", None):
        return request.state.uid
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer ") or len(header) > 16384:
        raise HTTPException(
            401, "Sign in required.", headers={"WWW-Authenticate": "Bearer"}
        )
    try:
        claims = await anyio.to_thread.run_sync(
            lambda: auth.verify_id_token(
                header[7:], app=request.app.state.firebase, check_revoked=True
            )
        )
        uid = claims.get("uid") or claims.get("sub")
        if not uid:
            raise ValueError("Missing identity")
    except (
        auth.InvalidIdTokenError,
        auth.ExpiredIdTokenError,
        auth.RevokedIdTokenError,
        auth.UserDisabledError,
        auth.UserNotFoundError,
        ValueError,
    ):
        raise HTTPException(
            401,
            "Session expired. Sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except Exception:
        raise HTTPException(503, "Authentication service unavailable.") from None
    request.state.claims = claims
    request.state.uid = uid
    return uid


async def rate_limit(request: Request, uid: str, bucket="api", limit=60):
    digest = hashlib.sha256(uid.encode()).hexdigest()
    window = int(time.time() // 60)
    try:
        count = await request.app.state.redis.eval(
            WINDOW_SCRIPT, 1, f"rl:{bucket}:{digest}:{window}", 60
        )
    except Exception:
        raise HTTPException(503, "Request limiter unavailable.") from None
    if count > limit:
        raise HTTPException(429, "Too many requests.", headers={"Retry-After": "60"})


async def ai_quota(request: Request, uid: str, task: str):
    if task not in request.app.state.settings.enabled_tasks:
        raise HTTPException(503, "This AI service is temporarily unavailable.")
    if not request.state.claims.get("email_verified"):
        raise HTTPException(403, "Verify your email before using AI.")
    await rate_limit(request, uid, "ai", 30)
    cost = COSTS[task]
    digest = hashlib.sha256(uid.encode()).hexdigest()
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ref = request.app.state.usage.collection("ai_daily_usage").document(
        f"{day}-{digest}"
    )
    maximum = request.app.state.settings.daily_units

    def reserve():
        @firestore.transactional
        def transaction(tx):
            doc = ref.get(transaction=tx)
            used = (doc.to_dict() or {}).get("units", 0)
            if used + cost > maximum:
                return False
            tx.set(
                ref,
                {
                    "units": used + cost,
                    "day": day,
                    "updated_at": firestore.SERVER_TIMESTAMP,
                    "expire_at": datetime.now(timezone.utc) + timedelta(days=7),
                },
            )
            return True

        return transaction(request.app.state.usage.transaction())

    try:
        allowed = await anyio.to_thread.run_sync(reserve)
    except Exception:
        raise HTTPException(503, "Usage service unavailable.") from None
    if not allowed:
        raise HTTPException(
            429, "Daily AI allowance reached.", headers={"Retry-After": "3600"}
        )
