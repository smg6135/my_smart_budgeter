"""Decode only HEIF inputs; keep unsupported containers away from providers."""

from io import BytesIO

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener(thumbnails=False)

HEIF_TYPES = frozenset({"image/heic", "image/heif"})
MAX_PIXELS = 50_000_000
MAX_BYTES = 8 * 1024 * 1024


def heif_to_jpeg(raw: bytes) -> bytes:
    """Convert the primary still image, applying orientation and stripping metadata."""
    try:
        with Image.open(BytesIO(raw), formats=["HEIF"]) as image:
            if image.width * image.height > MAX_PIXELS:
                raise HTTPException(
                    413, "Photo exceeds 50 megapixels. Use a smaller photo."
                )
            # libheif applies container rotation/mirroring; the plugin resets EXIF
            # orientation to prevent a second rotation. It opens the primary image.
            image.thumbnail((4096, 4096))
            with image.convert("RGB") as rgb:
                rgb.info.clear()
                output = BytesIO()
                rgb.save(output, format="JPEG", quality=90)
                data = output.getvalue()
    except Image.DecompressionBombError:
        raise HTTPException(413, "Photo is too large. Use a smaller photo.") from None
    except (UnidentifiedImageError, OSError, ValueError, RuntimeError, EOFError):
        raise HTTPException(
            422, "Cannot read HEIC/HEIF. Export the photo as JPG and retry."
        ) from None
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Converted photo exceeds 8 MB. Use a smaller photo.")
    return data
