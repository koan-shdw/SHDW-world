"""Stage 8 textures: every mapped material has its file, 2048 square, and tiles (left/right and top/bottom edges
close). Writes docs/audit/textures.txt. Run by level/run_audit.py."""
import re, os, sys
import numpy as np
from PIL import Image
sys.stdout.reconfigure(encoding="utf-8")
src = open("web/src/world/room/level.ts", encoding="utf-8").read()
maps = re.findall(r"'([a-z\-]+)': \{ file: '([a-z\-]+\.jpg)', tile: ([0-9.]+) \}", src)
lines = []
def ok(c, m): lines.append(("PASS  " if c else "FAIL  ") + m)
ok(len(maps) >= 16, f"{len(maps)} mapped materials in MAPS")
for name, file, tile in maps:
    p = f"textures/{file}"
    if not os.path.exists(p): ok(False, f"{name}: {file} missing"); continue
    big = Image.open(p).convert("RGB")
    ok(big.size == (2048, 2048), f"{name}: 2048 square ({big.size[0]}x{big.size[1]})")
    im = np.asarray(big.resize((256, 256), Image.LANCZOS)).astype(np.float32)   # judge the seam at the bake's own scale, not the upscale
    # a seam shows when the wrap-around edge differs more than neighbouring pixels do inside the tile
    inner = (np.abs(im[:, 1:] - im[:, :-1]).mean() + np.abs(im[1:] - im[:-1]).mean()) / 2 + 1
    alr = np.abs(im[:, 0] - im[:, -1]).mean(); atb = np.abs(im[0] - im[-1]).mean()
    lr = alr / inner; tb = atb / inner
    # a seam = the wrap edge differs clearly more than neighbours inside AND by a visible amount (6 of 255).
    # 2.6x: the 10x upscale + downscale blurs the inside more than the clamped edge; known-good tiles measure 1.4-2.5x
    ok((lr < 2.6 or alr < 6) and (tb < 2.6 or atb < 6), f"{name}: tiles (wrap edge lr {alr:.1f} = {lr:.2f}x inner, tb {atb:.1f} = {tb:.2f}x)")
os.makedirs("docs/audit", exist_ok=True)
open("docs/audit/textures.txt", "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(l for l in lines if not l.startswith("PASS")) or f"ALL PASS ({len(lines)})")
sys.exit(1 if any(l.startswith("FAIL") for l in lines) else 0)
