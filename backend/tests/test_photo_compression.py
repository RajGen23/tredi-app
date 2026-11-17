"""Photos are stored small and lists get thumbnails, so Stock and Quick sale
stay smooth however many photos a shop adds."""
import io
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
# importing the storage module loads the app settings; these only fill gaps
for k, v in {"MONGO_URL": "mongodb://localhost:27017", "DB_NAME": "test", "JWT_SECRET": "test-secret-" + "x" * 32}.items():
    os.environ.setdefault(k, v)
from routes.storage import compress_photo, THUMB_WIDTHS  # noqa: E402


def _camera_photo(w=4032, h=3024, rotate=False) -> bytes:
    img = Image.effect_noise((w, h), 60).convert("RGB")
    buf = io.BytesIO()
    if rotate:
        exif = Image.Exif(); exif[0x0112] = 6
        img.save(buf, "JPEG", quality=92, exif=exif)
    else:
        img.save(buf, "JPEG", quality=92)
    return buf.getvalue()


def test_camera_photo_is_stored_small():
    raw = _camera_photo()
    out = compress_photo(raw)
    img = Image.open(io.BytesIO(out))
    assert max(img.size) <= 1280
    assert len(out) < len(raw) / 4


def test_rotation_is_applied():
    out = compress_photo(_camera_photo(rotate=True))
    w, h = Image.open(io.BytesIO(out)).size
    assert h > w


def test_thumbnails_fit_their_width():
    raw = _camera_photo()
    for width in THUMB_WIDTHS:
        thumb = Image.open(io.BytesIO(compress_photo(raw, width, 70)))
        assert max(thumb.size) <= width


def test_small_photo_is_left_alone():
    buf = io.BytesIO(); Image.new("RGB", (200, 200), (0, 120, 90)).save(buf, "JPEG", quality=70)
    assert compress_photo(buf.getvalue()) is None


def test_non_image_is_left_alone():
    assert compress_photo(b"%PDF-1.4 not a photo") is None
