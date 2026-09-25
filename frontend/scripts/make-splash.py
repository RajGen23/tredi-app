"""Regenerates the splash art from the brand logo (assets/images/tredi-logo-source.png).

Run: python3 scripts/make-splash.py

Three outputs, because each surface crops differently:
  tredi-logo-green.png  full logo, tight crop — the in-app splash screen
  splash-green.png      tall 9:19.5 canvas, logo at 58% width — Expo Go scales
                        the manifest splash with *cover*, so a square canvas cut
                        the "i" off the wordmark
  splash-mark.png       mark only, 40% of a square — Android 12+ masks the
                        native splash icon into a circle, where no wordmark fits
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "assets" / "images"
GREEN = (0, 201, 141)


def bbox(a, x0, x1):
    mask = np.abs(a[:, x0:x1].astype(int) - np.array(GREEN)).sum(2) > 120
    ys, xs = np.nonzero(mask)
    return x0 + xs.min(), ys.min(), x0 + xs.max() + 1, ys.max() + 1


def place(logo, canvas_size, ratio):
    canvas = Image.new("RGB", canvas_size, GREEN)
    w = int(canvas_size[0] * ratio)
    h = max(1, round(logo.height * w / logo.width))
    canvas.paste(logo.resize((w, h), Image.LANCZOS), ((canvas_size[0] - w) // 2, (canvas_size[1] - h) // 2))
    return canvas


src = Image.open(ROOT / "tredi-logo-source.png").convert("RGB")
a = np.array(src)
full = src.crop(bbox(a, 0, src.width))
mark = src.crop(bbox(a, 0, 800))  # the wordmark starts past x=860

full.resize((1200, round(1200 * full.height / full.width)), Image.LANCZOS).save(ROOT / "tredi-logo-green.png")
place(full, (1284, 2778), 0.58).save(ROOT / "splash-green.png")
place(mark, (1024, 1024), 0.40).save(ROOT / "splash-mark.png")
print("wrote tredi-logo-green.png, splash-green.png, splash-mark.png")
