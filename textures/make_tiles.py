"""P3 step 2 (plain Python, no ComfyUI; owner: 'we don't need to overthink these textures'):
from each bake (scan/bake/<m>.png + mask) cut the cleanest patch, fill its holes, flatten the baked-in lighting,
make it tile, write textures/<m>.jpg at 2048. Prints what it did per material. docs/TEXTURES.md B, simplified."""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
sys.stdout.reconfigure(encoding="utf-8")
try:
    import cv2
except ImportError:
    cv2 = None
OUT = 2048
# material -> (patch size in metres, flatten lighting?)  the patch is cut at the bake's 2 px/cm
# (patch metres, mode): 'colour' keeps the scan's colour (flattened); 'grain' keeps only the scan's fine grain and paints it
# in the palette colour the owner already approved, for surfaces the scan lit unevenly or caught only in fragments
PATCH = {
    "concrete-path": (2.0, "colour"), "corten": (1.5, "colour"), "slate": (0.6, "colour"), "red-tile": (0.6, "colour"), "concrete": (1.0, "colour"),
    "concrete-polished": (2.0, "grain"), "concrete-bare": (2.0, "grain"), "concrete-grey": (1.0, "grain"), "wall-white": (2.0, "grain"),
    "corrugated-ceiling": (1.0, "colour"), "plywood": (0.8, "colour"), "checker": (0.5, "colour"), "dirt": (1.0, "colour"),
    "door-metal": (0.8, "grain"), "door-slide": (0.8, "grain"), "stringer-blue": (0.8, "grain"), "steel-black": (0.5, "grain"),
    "render": (0.8, "grain"),
}
import re
_pal = open("web/src/world/room/level.ts", encoding="utf-8").read()
PALETTE = {m.group(1): tuple(int(m.group(2)[i:i + 2], 16) for i in (0, 2, 4)) for m in re.finditer(r"'([a-z\-]+)': \{ color: 0x([0-9a-fA-F]{6})", _pal)}
idx = json.load(open("scan/bake/index.json"))
os.makedirs("textures", exist_ok=True)
report = {}

def best_patch(img, msk, size_px):
    """slide a window over the bake, pick the one with the most scan hits and the least black inside it"""
    H, W = msk.shape
    s = min(size_px, H, W)
    step = max(8, s // 8)
    best, bs = None, -1
    m = msk.astype(np.float32) / 255
    # integral image for fast window sums
    I = np.pad(m, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    for y in range(0, H - s + 1, step):
        for x in range(0, W - s + 1, step):
            cov = (I[y + s, x + s] - I[y, x + s] - I[y + s, x] + I[y, x]) / (s * s)
            if cov > bs: bs, best = cov, (x, y, s)
    return best, bs

def fill_holes(rgb, msk):
    if cv2 is not None:
        return cv2.inpaint(rgb, (255 - msk).astype(np.uint8), 5, cv2.INPAINT_TELEA)
    # fallback: push valid colours outward a few times
    out = rgb.copy(); valid = msk > 0
    for _ in range(64):
        if valid.all(): break
        blur = np.asarray(Image.fromarray(out).filter(ImageFilter.BoxBlur(3)))
        grown = np.asarray(Image.fromarray(valid.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))) > 0
        new = grown & ~valid; out[new] = blur[new]; valid = grown
    return out

def flatten(rgb):
    """remove the scan's baked-in light: divide by a big blur of the luminance, keep the mean"""
    f = rgb.astype(np.float32)
    lum = f.mean(axis=2)
    big = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(rgb.shape[0] / 6))).astype(np.float32) + 1
    gain = lum.mean() / big
    return np.clip(f * gain[:, :, None], 0, 255).astype(np.uint8)

def grain(rgb, base, r):
    """the scan's fine grain only, painted in the palette colour: lum / blur(lum), clipped, times the base colour"""
    lum = rgb.astype(np.float32).mean(axis=2) + 1
    big = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32) + 1
    d = np.clip(lum / big, 0.75, 1.25)
    return np.clip(np.array(base, np.float32)[None, None, :] * d[:, :, None], 0, 255).astype(np.uint8)

def make_tileable(rgb, zone=4):
    """offset by half, cross-fade the seams: the classic seamless tile"""
    H, W = rgb.shape[:2]
    off = np.roll(np.roll(rgb, H // 2, axis=0), W // 2, axis=1).astype(np.float32)
    f = rgb.astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    # weight 1 at the image centre, 0 at the edges (a soft square)
    wy = np.clip(1 - np.abs(yy - H / 2) / (H / 2), 0, 1); wx = np.clip(1 - np.abs(xx - W / 2) / (W / 2), 0, 1)
    w = np.minimum(wy, wx)[:, :, None]
    w = (w * zone).clip(0, 1)  # keep the middle untouched, blend only the outer 1/zone
    return np.clip(f * w + off * (1 - w), 0, 255).astype(np.uint8)

STOCK = {"concrete-polished", "concrete-bare", "concrete-grey", "wall-white", "checker", "plywood", "door-metal", "door-slide"}   # stock files (textures/STOCK.md), never overwritten here
for m, e in idx.items():
    if m in STOCK: print(f"{m:18s} stock (textures/STOCK.md)"); continue
    if m not in PATCH: print(f"{m:18s} skipped (flat colour)"); continue
    size_m, mode = PATCH[m]
    img = np.asarray(Image.open(f"scan/bake/{m}.png").convert("RGB")); msk = np.asarray(Image.open(f"scan/bake/{m}.mask.png").convert("L"))
    s_px = int(size_m * 100 * e["ppc"])
    (x, y, s), cov = best_patch(img, msk, s_px)
    patch = img[y:y + s, x:x + s].copy(); pm = msk[y:y + s, x:x + s].copy()
    if cov < 0.15:
        print(f"{m:18s} patch cover {cov*100:4.0f}%  too thin, flat colour"); report[m] = dict(cover=round(float(cov) * 100, 1), used=False); continue
    patch = fill_holes(patch, pm)
    patch = grain(patch, PALETTE.get(m, (200, 200, 200)), max(4, s / 16)) if mode == "grain" else flatten(patch)
    patch = make_tileable(patch, zone=2 if mode == "grain" else 4)   # smooth surfaces need the wider blend
    tile = Image.fromarray(patch).resize((OUT, OUT), Image.LANCZOS)
    tile.save(f"textures/{m}.jpg", quality=90)
    report[m] = dict(cover=round(float(cov) * 100, 1), used=True, patch_px=int(s), metres=round(s / (100 * e["ppc"]), 2), at=[int(x), int(y)])
    print(f"{m:18s} patch {s}px = {s/(100*e['ppc']):.2f} m  cover {cov*100:4.0f}%  -> textures/{m}.jpg")
json.dump(report, open("textures/tiles.json", "w"), indent=1)
