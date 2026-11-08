from unittest.mock import AsyncMock
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.fx import CURRENCIES


def response(base="SGD", **overrides):
    rates = {code: "1.25" for code in CURRENCIES}
    rates.update({base: "1.0", **overrides})
    return httpx.Response(
        200,
        json={"data": {"currency": base, "rates": rates}},
        request=httpx.Request("GET", "https://api.coinbase.com/v2/exchange-rates"),
    )


def test_rates_need_no_ai_key_and_cache_public_quotes(client):
    app.state.client.get.return_value = response(USD="0.75")
    result = client.get("/v1/fx/rates?base=SGD")
    assert result.status_code == 200
    assert result.json()["rates"]["USD"] == 0.75
    assert result.json()["source"] == "Coinbase"
    assert result.json()["fetchedAt"] != result.json()["expiresAt"]
    assert client.get("/v1/fx/rates?base=SGD").json() == result.json()
    assert app.state.client.get.call_count == 1
    assert app.state.client.get.call_args.kwargs["params"] == {"currency": "SGD"}
    assert "headers" not in app.state.client.get.call_args.kwargs


def test_cache_expiry_refreshes_and_bases_do_not_share_quotes(client):
    app.state.client.get.return_value = response()
    client.get("/v1/fx/rates?base=SGD")
    expiry, data = app.state.fx_cache["SGD"]
    app.state.fx_cache["SGD"] = (0, data)
    client.get("/v1/fx/rates?base=SGD")
    app.state.client.get.return_value = response("CAD")
    result = client.get("/v1/fx/rates?base=CAD")
    assert result.status_code == 200
    assert result.json()["base"] == "CAD"
    assert app.state.client.get.call_count == 3


@pytest.mark.parametrize("bad", ["NaN", "Infinity", "0", "-2"])
def test_invalid_quotes_are_rejected_not_cached(client, bad):
    app.state.client.get.return_value = response(USD=bad)
    assert client.get("/v1/fx/rates?base=SGD").status_code == 503
    assert not app.state.fx_cache


def test_unsupported_currency_and_provider_failure(client):
    assert client.get("/v1/fx/rates?base=NOPE").status_code == 422
    app.state.client.get.assert_not_called()
    app.state.client.get.side_effect = httpx.ReadTimeout("private upstream details")
    result = client.get("/v1/fx/rates?base=SGD")
    assert result.status_code == 503
    assert "private upstream" not in result.text


def test_mismatched_base_is_rejected(client):
    app.state.client.get.return_value = response("USD")
    assert client.get("/v1/fx/rates?base=SGD").status_code == 503
