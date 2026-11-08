from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "demo-pocket")
    monkeypatch.setenv("LITELLM_MASTER_KEY", "server-only-master")
    monkeypatch.setattr(
        "app.main.firebase_admin.initialize_app", lambda **kwargs: Mock()
    )
    monkeypatch.setattr("app.main.firebase_admin.delete_app", lambda value: None)
    usage = Mock()
    ref = usage.collection.return_value.document.return_value
    ref.get.return_value.to_dict.return_value = {"units": 0}
    tx = usage.transaction.return_value
    monkeypatch.setattr("app.security.firestore.transactional", lambda fn: fn)
    monkeypatch.setattr("app.main.firestore.Client", lambda **kwargs: usage)
    monkeypatch.setattr(
        "app.security.auth.verify_id_token",
        Mock(return_value={"uid": "customer-1", "email_verified": True}),
    )
    with TestClient(app, headers={"Authorization": "Bearer customer-token"}) as c:
        app.state.client = AsyncMock()
        app.state.redis = AsyncMock()
        app.state.redis.eval.return_value = 1
        app.state.usage = usage
        yield c
