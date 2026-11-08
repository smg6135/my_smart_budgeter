"""Public fiat market quotes. Cache contains rates only, never user financial data."""

import asyncio
import math
import time
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Query, Request, Depends
from typing import Literal
import httpx

CURRENCIES = (
    "SGD",
    "USD",
    "CAD",
    "EUR",
    "GBP",
    "AUD",
    "HKD",
    "JPY",
    "KRW",
    "CNY",
    "INR",
    "MYR",
    "THB",
    "IDR",
    "PHP",
    "VND",
    "NZD",
    "CHF",
)
Currency = Literal[
    "SGD",
    "USD",
    "CAD",
    "EUR",
    "GBP",
    "AUD",
    "HKD",
    "JPY",
    "KRW",
    "CNY",
    "INR",
    "MYR",
    "THB",
    "IDR",
    "PHP",
    "VND",
    "NZD",
    "CHF",
]
from .security import current_user

router = APIRouter()


@router.get("/v1/fx/rates")
async def rates(
    request: Request,
    base: Currency = Query(default="SGD"),
    uid: str = Depends(current_user),
):
    cache = request.app.state.fx_cache
    cached = cache.get(base)
    if cached and time.monotonic() < cached[0]:
        return cached[1]
    lock = request.app.state.fx_locks.setdefault(base, asyncio.Lock())
    async with lock:
        cached = cache.get(base)
        if cached and time.monotonic() < cached[0]:
            return cached[1]
        try:
            response = await request.app.state.client.get(
                "https://api.coinbase.com/v2/exchange-rates",
                params={"currency": base},
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()["data"]
            if data["currency"] != base:
                raise ValueError("Base mismatch")
            quotes = {code: float(data["rates"][code]) for code in CURRENCIES}
            if (
                any(not math.isfinite(rate) or rate <= 0 for rate in quotes.values())
                or abs(quotes[base] - 1) > 1e-9
            ):
                raise ValueError("Invalid rates")
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise HTTPException(
                503,
                "Live exchange rates are temporarily unavailable. Previously saved rates remain on your device; you can also enter an exchange rate manually.",
            ) from None
        now = datetime.now(timezone.utc)
        result = {
            "base": base,
            "rates": quotes,
            "fetchedAt": now.isoformat(),
            "expiresAt": (now + timedelta(seconds=60)).isoformat(),
            "source": "Coinbase",
        }
        cache[base] = (time.monotonic() + 60, result)
        return result
