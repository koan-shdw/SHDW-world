"""Assemble docs/audit/REPORT.md from the file audit (run here), the browser audits (docs/audit/mesh.txt, sky.txt posted by
koanHang.meshAudit / skyLeakAudit through /__audit), the notes ledger and the shot sheets. Exit 1 on any FAIL.
See docs/AUDIT.md. Stages not yet built are listed as NOT AUDITED, never as pass."""
import subprocess, sys, os, re, datetime, glob
sys.stdout.reconfigure(encoding="utf-8")
os.makedirs("docs/audit", exist_ok=True)
fails, lines = [], []
def stage(name, text, note=None):
    n_pass = len(re.findall(r"^PASS", text, re.M)); n_fail = re.findall(r"^FAIL.*$", text, re.M)
    fails.extend(f"{name}: {f}" for f in n_fail)
    lines.append(f"## {name}\n\n{'FAIL' if n_fail else 'PASS'}: {n_pass} pass, {len(n_fail)} fail" + (f". {note}" if note else "") + "\n")
    for f in n_fail: lines.append(f"- {f}")
    lines.append("")
# stage 1: file audit
r = subprocess.run([sys.executable, "level/audit.py"], capture_output=True, text=True, encoding="utf-8")
if r.returncode: sys.exit(r.stderr or r.stdout or "file audit failed")
open("docs/audit/file.txt", "w", encoding="utf-8").write(r.stdout)
stage("Stage 1 file audit (level/audit.py)", r.stdout)
# stage 2: fit (only the yard plan overlay exists)
lines.append("## Stage 2 fit to the scan\n\nNOT AUDITED except the yard plan overlay (docs/sheet/yard-blend.jpg, checked by eye). Elevations, sections, objects: not built yet.\n")
# stage 3 + 4: browser audits, must be fresh (newer than level.json)
for name, label in (("mesh", "Stage 3 mesh audit (koanHang.meshAudit)"), ("sky", "Stage 4 sky audit (koanHang.skyLeakAudit)")):
    p = f"docs/audit/{name}.txt"
    if not os.path.exists(p): lines.append(f"## {label}\n\nNOT AUDITED: {p} missing (run it in the browser).\n"); fails.append(f"{label}: not run"); continue
    stale = os.path.getmtime(p) < max(os.path.getmtime("level/level.json"), os.path.getmtime("web/src/world/room/level.ts"))
    stage(label, open(p, encoding="utf-8").read(), note="STALE: older than level.json" if stale else None)
    if stale: fails.append(f"{label}: stale")
r8 = subprocess.run([sys.executable, "textures/check.py"], capture_output=True, text=True, encoding="utf-8")
if r8.returncode: sys.exit(r8.stderr or r8.stdout or "texture audit failed")
stage("Stage 8 textures (textures/check.py)", open("docs/audit/textures.txt", encoding="utf-8").read() if os.path.exists("docs/audit/textures.txt") else "")
lines.append("## Stage 4 walk audit\n\nNOT AUDITED: flood walk not built yet.\n")
# stage 5: shot sheets
sheets = sorted(glob.glob("docs/sheet/*views*.jpg") + glob.glob("docs/sheet/*-blend.jpg") + glob.glob("docs/sheet/*plan-small.jpg"))
lines.append("## Stage 5 visual pass\n\nSheets to look at by hand (one line each goes in the commit message):\n")
lines += [f"- {s}" for s in sheets]; lines.append("")
# stage 6: ledger
led = open("docs/NOTES.md", encoding="utf-8").read()
rows = [l for l in led.splitlines() if l.startswith("| 0")]
opens = [l for l in rows if "OPEN" in l.upper() and "dropped" not in l]
lines.append(f"## Stage 6 notes ledger\n\n{len(rows)} notes, {len(opens)} open:\n")
lines += [f"- {l.split('|')[2].strip()} -> {l.split('|')[4].strip()}" for l in opens]; lines.append("")
head = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
rep = f"# Audit report\n\n{datetime.datetime.now():%Y-%m-%d %H:%M}, commit {head}\n\n**{'FAIL' if fails else 'PASS'}** ({len(fails)} fails)\n\n" + "\n".join(lines)
rep += "\n## Not audited\n\n- fit: elevations, sections, objects vs the scan\n- mesh: generic floating, overlap, coplanar faces, opening frames, door clearance, lights on tracks, minimap\n- walk: flood walk, eye inside mesh\n- visual: fixed shot list, photo pairing\n"
open("docs/audit/REPORT.md", "w", encoding="utf-8").write(rep)
print(rep)
sys.exit(1 if fails else 0)
