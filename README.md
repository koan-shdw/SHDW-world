# KOAN.hang

Hang real artworks, at real size, on the walls of a LiDAR-scanned gallery. Walk it in the browser.

Live: https://koan-shdw.github.io/SHDW-world/

Spec: `docs/SPEC.md`. Scan facts: `docs/SCAN-REPORT.md`.

Status 2026-09-02: P0 scan pipeline + P1 walk built. Hang, level fix, exports follow (spec s10).

Dev: `cd web && npm install && npm run dev` (port 5374). Data folders `level/`, `art/`, `layouts/` are served at `/data/`.

Scan rebuild: `python scan/pipeline.py` then `scan/compress.ps1`, then `python level/make_level.py`.
