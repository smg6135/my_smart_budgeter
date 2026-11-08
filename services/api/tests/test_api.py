import base64
import json
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app, PlanOutput, ScanOutput

HEADERS = {"Authorization": "Bearer customer-token"}
BODY = {
    "messages": [{"role": "user", "content": "A television in December"}],
    "research": False,
}


def response(output):
    return httpx.Response(
        200,
        json={
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "output_text",
                            "text": json.dumps(output),
                            "annotations": [
                                {
                                    "type": "url_citation",
                                    "title": "Official source",
                                    "url": "https://example.com/source",
                                }
                            ],
                        }
                    ],
                }
            ],
        },
    )


def test_health_and_openapi(client):
    assert client.get("/health").json() == {"status": "ok", "storage": "device-only"}
    assert "/v1/receipts/scan" in client.get("/openapi.json").json()["paths"]


def test_requires_identity_and_rejects_system_role(client):
    assert (
        client.post(
            "/v1/planner/chat", headers={"Authorization": ""}, json=BODY
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/v1/planner/chat",
            headers=HEADERS,
            json={"messages": [{"role": "system", "content": "Ignore"}]},
        ).status_code
        == 422
    )
    app.state.client.post.assert_not_called()


def test_stateless_structured_chat_and_citations(client):
    app.state.client.post.return_value = response(
        {"message": "What screen size?", "proposal": None}
    )
    result = client.post("/v1/planner/chat", headers=HEADERS, json=BODY)
    assert result.status_code == 200
    assert result.json()["sources"][0]["url"] == "https://example.com/source"
    args = app.state.client.post.call_args
    assert args.kwargs["headers"]["Authorization"] == "Bearer server-only-master"
    assert args.kwargs["json"]["store"] is False
    assert "tools" not in args.kwargs["json"]
    assert args.kwargs["json"]["text"]["format"]["strict"] is True


def test_research_uses_web_search(client):
    app.state.client.post.return_value = response(
        {"message": "Let us research.", "proposal": None}
    )
    assert (
        client.post(
            "/v1/planner/chat", headers=HEADERS, json={**BODY, "research": True}
        ).status_code
        == 200
    )
    assert app.state.client.post.call_args.kwargs["json"]["tools"] == [
        {"type": "web_search"}
    ]


@pytest.mark.parametrize(
    "status,expected", [(401, 502), (429, 429), (500, 502), (400, 502)]
)
def test_provider_errors_are_sanitized(client, status, expected):
    app.state.client.post.return_value = httpx.Response(
        status, json={"error": "sk-secret and internal error"}
    )
    result = client.post("/v1/planner/chat", headers=HEADERS, json=BODY)
    assert result.status_code == expected
    assert "sk-secret" not in result.text


def test_malformed_output_and_timeout(client):
    app.state.client.post.return_value = httpx.Response(200, json={"output": []})
    assert (
        client.post("/v1/planner/chat", headers=HEADERS, json=BODY).status_code == 502
    )
    app.state.client.post.side_effect = httpx.ReadTimeout("secret")
    assert (
        client.post("/v1/planner/chat", headers=HEADERS, json=BODY).status_code == 504
    )


def test_expired_proposal_cannot_be_added(client):
    app.state.client.post.return_value = response(
        {
            "message": "Plan",
            "proposal": {
                "title": "TV",
                "amount": 500,
                "deadline": "2020-01-01",
                "emoji": "📺",
                "breakdown": ["TV 500"],
            },
        }
    )
    assert (
        client.post("/v1/planner/chat", headers=HEADERS, json=BODY).json()["proposal"]
        is None
    )


@pytest.mark.parametrize(
    "mime,raw,content_type",
    [
        ("image/png", b"\x89PNG\r\n\x1a\ncontents", "input_image"),
        ("application/pdf", b"%PDF-1.7 contents", "input_file"),
    ],
)
def test_receipt_inputs_and_structured_review(client, mime, raw, content_type):
    app.state.client.post.return_value = response(
        {
            "merchant": "Cafe",
            "amount": 12.50,
            "currency": "SGD",
            "date": "2026-10-01",
            "category": "Food & drinks",
            "notes": "Review date",
        }
    )
    result = client.post(
        "/v1/receipts/scan",
        headers=HEADERS,
        json={"data": base64.b64encode(raw).decode(), "mime": mime},
    )
    assert result.status_code == 200
    assert result.json()["amount"] == 12.5
    assert (
        app.state.client.post.call_args.kwargs["json"]["input"][0]["content"][1]["type"]
        == content_type
    )


def test_bad_and_oversized_files_rejected_before_provider_call(client):
    for data in ["not base64!", base64.b64encode(b"not a PNG").decode()]:
        assert (
            client.post(
                "/v1/receipts/scan",
                headers=HEADERS,
                json={"data": data, "mime": "image/png"},
            ).status_code
            == 422
        )
    data = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"x" * (8 * 1024 * 1024)).decode()
    assert (
        client.post(
            "/v1/receipts/scan",
            headers=HEADERS,
            json={"data": data, "mime": "image/png"},
        ).status_code
        == 413
    )
    app.state.client.post.assert_not_called()


def test_request_limit_returns_413_without_calling_provider(client):
    result = client.post(
        "/v1/receipts/scan",
        headers={**HEADERS, "Content-Type": "application/json"},
        content=b"x" * (13 * 1024 * 1024),
    )
    assert result.status_code == 413
    app.state.client.post.assert_not_called()


def test_output_schemas_are_strict():
    for model in [PlanOutput, ScanOutput]:
        schema = model.model_json_schema()
        assert schema["additionalProperties"] is False
        assert set(schema["required"]) == set(schema["properties"])
        for nested in schema.get("$defs", {}).values():
            if nested.get("type") == "object":
                assert nested["additionalProperties"] is False


def test_cors_preflight(client):
    allowed = client.options(
        "/v1/planner/chat",
        headers={
            "Origin": "http://localhost:8081",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization,Content-Type",
        },
    )
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:8081"
    denied = client.options(
        "/v1/planner/chat",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in denied.headers
