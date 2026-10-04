# KOAN.hang

Hang real artworks, at real size, on the walls of a LiDAR-scanned gallery. Walk it in the browser.

Live: https://koan-shdw.github.io/SHDW-world/

Spec: `docs/SPEC.md`. Scan facts: `docs/SCAN-REPORT.md`.

Status 2026-09-02: P0 scan pipeline + P1 walk built. Hang, level fix, exports follow (spec s10).

Dev: `cd web && npm install && npm run dev` (port 5374). Data folders `level/`, `art/`, `layouts/` are served at `/data/`.

Scan rebuild: `python scan/pipeline.py` then `scan/compress.ps1`, then `python level/make_level.py`.

## Verification and recovery (2026-10-04)

From `web/`, run `npm test`, `npm run check:worker`, and `npm run build`. The regression checks use the actual client and Worker modules with an in-memory SQLite/R2 adapter; they never write to the live exhibition. Node 22.13+ is required. From the repository root, run `python level/audit.py` and `python textures/check.py` (the texture check needs Pillow and NumPy).

Set `SHDW_STORE` to the intended Worker origin and `SHDW_DOOR` to its existing editor word, then run `node worker/backup.mjs backup PATH` from the repository root. The directory contains the current show, private notes, library metadata, referenced artwork/texture files, and checksums. It contains no password. It is private exhibition data; keep it outside the public repository. Backup fails if the show changes during capture.

For a recovery drill, point those environment variables at an empty local Worker and run `node worker/backup.mjs restore PATH`. The script verifies every checksum before writing and refuses a destination containing artwork or placements. The regression suite verifies a complete snapshot round trip and file bytes. This snapshot restores the current show; it does not recreate historical log entries, built-in repository assets, or Cloudflare account configuration. Keep the repository revision and the account's D1 backup with it. Remote restores require the explicit `--allow-remote` flag. Normal library removal now retains immutable R2 files for recovery.

Deploy the Worker before publishing the frontend: editor reads now authenticate to receive private notes, and history pagination uses the new cursor. No schema migration is required. Deploying this repository through Pages does not deploy the Worker. To rotate the shared word, set the Worker secret `DOOR` through Cloudflare; each editor then enters the new word. GitHub publishing tokens are no longer saved in browser storage. The application's login-attempt brake is per Worker isolate; use Cloudflare edge rate limits if broader abuse protection is required.

Before the exhibition, test mouse capture, both staircases, doors, all artwork actions, and controller entry on the actual hardware. Record startup time, sustained frame rate and memory during a long editing session. Touch controls default on for coarse-pointer devices and can be toggled in settings: drag the left pad to walk and the right area to look. Release, pointer cancellation, settings, map, tab hiding and window blur stop movement. Door and map buttons use the existing game actions. Verify simultaneous two-finger use on the target phones. The normal exhibition geometry and visual effects are preserved; reduce motion suppresses camera/hand animation, moving scenery and lightning.

Rejected placement saves remain in browser storage while independent edits continue saving. Correcting the affected item replaces its rejected operation; “retry saves” retries retained operations. A rejected clear remains an ordering barrier. Artwork existence, kind, removal and original-placement checks run inside the same D1 write batch, so concurrent removal and placement cannot leave an orphaned reference.
