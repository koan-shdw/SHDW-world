# Helvetica Bold -> three.js typeface JSON (web/public/brand/helvetica-bold.typeface.json), for the mountain (owner 09-07).
# Reads the TrueType font installed on this PC. Solids must be clockwise for three's ShapePath (TrueType already is; checked per glyph).
import json, sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.reverseContourPen import ReverseContourPen

SRC = Path(r"C:\Users\1\AppData\Local\Microsoft\Windows\Fonts\Helvetica-Bold.ttf")
OUT = Path(__file__).resolve().parents[1] / "public" / "brand" / "helvetica-bold.typeface.json"
CHARS = [chr(c) for c in range(32, 127)] + list("“”‘’—–…")

class OPen(BasePen):
    """typeface.js outline string: m x y | l x y | q endx endy cx cy | b endx endy c1x c1y c2x c2y.
    A contour with fewer than two segments (TrueType anchor points) is dropped: three's earcut crashes on an empty hole."""
    def __init__(self, glyphSet):
        super().__init__(glyphSet); self.cmds = []; self.contours = []; self.cur = []; self.curCmds = []
    def _moveTo(self, p): self.curCmds = ["m", *map(r, p)]; self.cur = [p]
    def _lineTo(self, p): self.curCmds += ["l", *map(r, p)]; self.cur.append(p)
    def _qCurveToOne(self, c, p): self.curCmds += ["q", *map(r, p), *map(r, c)]; self.cur += [c, p]
    def _curveToOne(self, c1, c2, p): self.curCmds += ["b", *map(r, p), *map(r, c1), *map(r, c2)]; self.cur += [c1, c2, p]
    def _closePath(self):
        if len(self.cur) >= 3: self.contours.append(self.cur); self.cmds += self.curCmds
        else: self.dropped = getattr(self, "dropped", 0) + 1
        self.cur = []; self.curCmds = []
    def _endPath(self): self._closePath()

def r(v): return str(int(round(v)))
def area(pts):
    a = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % len(pts)]
        a += x0 * y1 - x1 * y0
    return a / 2

def main():
    f = TTFont(SRC); cmap = f.getBestCmap(); gs = f.getGlyphSet(); hmtx = f["hmtx"]
    glyphs, flipped, dropped = {}, 0, 0
    for ch in CHARS:
        name = cmap.get(ord(ch))
        if not name: continue
        pen = OPen(gs); gs[name].draw(pen)
        if pen.contours:
            outer = max(pen.contours, key=lambda c: abs(area(c)))
            if area(outer) > 0:                                  # counter-clockwise outer: reverse the glyph so three reads it as solid
                pen = OPen(gs); gs[name].draw(ReverseContourPen(pen)); flipped += 1
        dropped += getattr(pen, "dropped", 0)
        adv = hmtx[name][0]
        glyphs[ch] = {"ha": adv, "x_min": 0, "x_max": adv, "o": " ".join(pen.cmds)}
    head, hhea = f["head"], f["hhea"]
    out = {
        "glyphs": glyphs, "familyName": "Helvetica", "ascender": hhea.ascent, "descender": hhea.descent,
        "underlinePosition": f["post"].underlinePosition, "underlineThickness": f["post"].underlineThickness,
        "boundingBox": {"yMin": head.yMin, "xMin": head.xMin, "yMax": head.yMax, "xMax": head.xMax},
        "resolution": head.unitsPerEm, "original_font_information": {"font_family_name": "Helvetica", "font_sub_family_name": "Bold"},
        "cssFontWeight": "bold", "cssFontStyle": "normal",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.name}: {len(glyphs)} glyphs, {flipped} reversed, {dropped} point contours dropped, {OUT.stat().st_size // 1024} kB")

if __name__ == "__main__": main()
