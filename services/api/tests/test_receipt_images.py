import base64
from io import BytesIO
from pathlib import Path

import pytest
from fastapi import HTTPException
from PIL import Image

from app.main import app
from app.receipt_images import heif_to_jpeg
from test_api import response

FIXTURE = Path(__file__).parent / "fixtures/receipt.heic"
RECEIPT = {
    "merchant": "Pocket Cafe",
    "amount": 5,
    "currency": "USD",
    "date": "2026-11-08",
    "category": "Food & drinks",
    "notes": "",
}


@pytest.mark.parametrize("mime", ["image/heic", "image/heif"])
def test_heif_upload_is_decoded_to_jpeg_before_provider(client, mime):
    app.state.client.post.return_value = response(RECEIPT)
    raw = FIXTURE.read_bytes()
    with Image.open(BytesIO(raw)) as original:
        assert original.getexif()  # Exercise metadata removal, not an empty input.
    result = client.post(
        "/v1/receipts/scan",
        json={"data": base64.b64encode(raw).decode(), "mime": mime, "mode": "bulk"},
    )
    assert result.status_code == 200 and result.json() == RECEIPT
    payload = app.state.client.post.call_args.kwargs["json"]
    assert payload["model"] == "ocr-bulk"
    url = payload["input"][0]["content"][1]["image_url"]
    assert url.startswith("data:image/jpeg;base64,")
    with Image.open(BytesIO(base64.b64decode(url.split(",")[1]))) as converted:
        assert converted.format == "JPEG" and converted.size == (420, 500)
        assert not converted.getexif() and "xmp" not in converted.info


@pytest.mark.parametrize(
    "raw",
    [
        b"not an image",
        b"\x89PNG\r\n\x1a\nnot HEIF",
        b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00heicmif1",  # Header only.
        FIXTURE.read_bytes()[:100],  # A real but truncated container.
    ],
)
def test_corrupt_or_mislabeled_heif_does_not_spend_quota(client, raw):
    result = client.post(
        "/v1/receipts/scan",
        json={"data": base64.b64encode(raw).decode(), "mime": "image/heic"},
    )
    assert result.status_code == 422
    app.state.client.post.assert_not_called()
    app.state.usage.transaction.assert_not_called()


def test_heif_dimensions_are_checked_before_decoding(client, monkeypatch):
    monkeypatch.setattr("app.receipt_images.MAX_PIXELS", 100)
    result = client.post(
        "/v1/receipts/scan",
        json={"data": base64.b64encode(FIXTURE.read_bytes()).decode(), "mime": "image/heif"},
    )
    assert result.status_code == 413
    app.state.client.post.assert_not_called()
    app.state.usage.transaction.assert_not_called()


def test_heif_rotation_and_output_size_limit(monkeypatch):
    # The encoder writes the HEIF rotation from EXIF; decoding must rotate once.
    with Image.new("RGB", (40, 20), "white") as image:
        image.paste("black", (0, 0, 20, 20))
        exif = Image.Exif()
        exif[274] = 6
        source = BytesIO()
        image.save(source, format="HEIF", quality=90, exif=exif.tobytes())
    jpeg = heif_to_jpeg(source.getvalue())
    with Image.open(BytesIO(jpeg)) as image:
        assert image.size == (20, 40)
        assert image.getpixel((10, 5))[0] < 20
        assert image.getpixel((10, 35))[0] > 235
    monkeypatch.setattr("app.receipt_images.MAX_BYTES", 100)
    with pytest.raises(HTTPException) as error:
        heif_to_jpeg(FIXTURE.read_bytes())
    assert error.value.status_code == 413
