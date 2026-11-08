import base64
from unittest.mock import Mock
import pytest
from firebase_admin import auth
from app.main import app
from app.settings import Settings

BODY = {"messages": [{"role": "user", "content": "Plan a trip"}], "research": False}


def test_rejects_unauthenticated_before_large_body(client):
    response = client.post(
        "/v1/receipts/scan",
        headers={"Authorization": ""},
        content=b"x" * (13 * 1024 * 1024),
    )
    assert response.status_code == 401
    app.state.client.post.assert_not_called()


@pytest.mark.parametrize(
    "error",
    [
        auth.InvalidIdTokenError("bad"),
        auth.RevokedIdTokenError("revoked"),
        auth.UserDisabledError("disabled"),
        auth.UserNotFoundError("deleted"),
    ],
)
def test_invalid_revoked_and_disabled_tokens(client, monkeypatch, error):
    verify = Mock(side_effect=error)
    monkeypatch.setattr("app.security.auth.verify_id_token", verify)
    assert client.get("/v1/me").status_code == 401
    assert verify.call_args.kwargs["check_revoked"] is True


def test_auth_outage_fails_closed(client, monkeypatch):
    monkeypatch.setattr(
        "app.security.auth.verify_id_token",
        Mock(side_effect=RuntimeError("private details")),
    )
    r = client.get("/v1/me")
    assert r.status_code == 503 and "private details" not in r.text


def test_unverified_email_cannot_spend(client, monkeypatch):
    monkeypatch.setattr(
        "app.security.auth.verify_id_token",
        Mock(return_value={"uid": "unverified", "email_verified": False}),
    )
    assert client.post("/v1/planner/chat", json=BODY).status_code == 403
    app.state.client.post.assert_not_called()


def test_rate_limiter_and_outage_fail_closed(client):
    app.state.redis.eval.return_value = 61
    r = client.get("/v1/me")
    assert r.status_code == 429 and r.headers["retry-after"] == "60"
    app.state.redis.eval.side_effect = RuntimeError("redis secret")
    r = client.post("/v1/planner/chat", json=BODY)
    assert r.status_code == 503 and "redis secret" not in r.text
    app.state.client.post.assert_not_called()


def test_global_daily_cap_prevents_provider_call(client):
    ref = app.state.usage.collection.return_value.document.return_value
    ref.get.return_value.to_dict.return_value = {"units": 299}
    assert client.post("/v1/planner/chat", json=BODY).status_code == 429
    app.state.client.post.assert_not_called()


def test_no_arbitrary_model_or_customer_provider_keys(client):
    assert (
        client.post(
            "/v1/planner/chat", json={**BODY, "model": "expensive-model"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/v1/planner/chat",
            headers={"Authorization": "", "X-OpenAI-Key": "customer-secret"},
            json=BODY,
        ).status_code
        == 401
    )
    app.state.client.post.assert_not_called()


def test_bulk_alias_and_cost(client, monkeypatch):
    from test_api import response

    app.state.client.post.return_value = response(
        {
            "merchant": "Cafe",
            "amount": 5,
            "currency": "USD",
            "date": "2026-10-01",
            "category": "Other",
            "notes": "",
        }
    )
    r = client.post(
        "/v1/receipts/scan",
        json={
            "data": base64.b64encode(b"%PDF-1.7 receipt").decode(),
            "mime": "application/pdf",
            "mode": "bulk",
        },
    )
    assert r.status_code == 200
    assert app.state.client.post.call_args.kwargs["json"]["model"] == "ocr-bulk"
    record = app.state.usage.transaction.return_value.set.call_args.args[1]
    assert record["units"] == 1 and "expire_at" in record


def test_production_forbids_emulator(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "pocket")
    monkeypatch.setenv("LITELLM_MASTER_KEY", "server-key")
    monkeypatch.setenv("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099")
    with pytest.raises(RuntimeError, match="emulator"):
        Settings.load()


def test_readiness_requires_redis(client):
    app.state.redis.ping.side_effect = RuntimeError()
    assert client.get("/ready").status_code == 503


def test_unconfigured_task_does_not_charge_usage(client):
    app.state.settings.enabled_tasks = frozenset({"ocr-bulk", "ocr-single"})
    assert client.post("/v1/planner/chat", json=BODY).status_code == 503
    app.state.usage.transaction.assert_not_called()
    app.state.client.post.assert_not_called()
