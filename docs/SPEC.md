# KOAN.hang — SPEC v2 (2026-09-02)

**KOAN.hang**. Repo `C:\Claude\gallery-hang` → github.com/koan-shdw/SHDW-world → live at
https://koan-shdw.github.io/SHDW-world/. v1 kept as `docs/SPEC-v1.md`.

The brief (user, 2026-09-02): a 3D game-style walk through his gallery. An inventory of his
artworks at true size. Place a work on a wall, walk round, look at it. An in-game widget sets
the top-height snap. Browser app. GitHub hosts the site and the data. Save, load, exports,
flythrough.

**v2 change (user, 2026-09-02, after walking P1):** the scan mesh is NOT the level. The level
is rebuilt as our own clean geometry. The scan is an offline reference: measurements for the
geometry, photos for the textures. Every object in the scan (stairs, window frames, doors,
ceiling, lights, the courtyard's tiles, red wall, plants, neighbour walls) gets looked at and
recreated. Textures are baked from the scan and completed by generative fill on his ComfyUI.
Reason: the scan has holes, floating junk, patches of missing texture. Patching it is the
wrong fight. This is the cleanest approach.

Every claim below is **PROVEN** (I ran it), **BUILT** (code exists, his run pending),
or **OPEN** (untested, or his call).

**2026-09-02 late: level v3.** After the owner walked P2 and corrected it line by line, every wall was measured on the raw
scan (`scan/check.py`, `scan/check_raw.py`, results in `docs/CHECK-SHEET.md`) and the level was rewritten from that sheet
plus his answers: the whole back (west) wall is one window grid on every floor; the ground floor south end of it holds the
steel street door (metal panel above) and a corrugated panel with the gas meter; two identical 85 x 200 doorways in the
gallery back wall, slider leaves on the stair side in the 15 cm gap between wall and stringer; front glass 4 panes | steel
door 85 hinged north, open, full height | fixed pane | 2 panes, X in pane 2; second floor east X-window | wall | steel door
+ panel | wall | 2-pane window; side walls plain; third floor = copy of the second, no stairs up; stairs with checker
treads, plywood risers, blue stringers. Sky: `textures/sky-tokyo.jpg` when it exists (P3, ComfyUI), flat colour until then.
RULE learned the hard way: mid-turn corrections are discussion; spec, GO, build.

---

## 1. What it is

| layer | what | made by |
|---|---|---|
| **level** | clean geometry: walls, floors, ceilings, stairs with steps, openings, and every ticked object. Textured. The only thing the app renders. | `level/build_level.py` from `level/level.json` + `level/objects.json`; textures from `textures/` |
| **art** | canvases at true cm size, hung on the level's hang walls | him, in the app |
| **scan** | Polycam LiDAR mesh, cleaned. Offline reference only. Never shipped to the browser. | `scan/pipeline.py` (P0, PROVEN) |

Files that drive it: `level/level.json` (shell: walls, floors, stairs, openings, hang zones),
`level/objects.json` (the object catalogue with sizes and positions), `textures/*` (baked +
filled), `level/level.glb` (the built level the app loads), `art/index.json`,
`layouts/<name>.json`.

---

## 2. Stack and hosting

- **Vite + TypeScript + three.js**, one page. GitHub Pages on `koan-shdw/koan-hang` (PROVEN live).
- **Themes** DECK / WINTERMUTE / FUCKUP on the KOAN var contract (BUILT).
- **@koan/shared**: vendor `koan.css`, `tokens.ts`, `Dropdown.tsx`, `ContextMenu.tsx`,
  `confirm.tsx` into `web/vendor/koan/` with `drift.mjs` watching. OPEN (his call, unchanged).
- **Offline tools** (his PC, outputs committed): Python 3.12 `trimesh`/`numpy`/`scipy`/`pillow`
  (PROVEN), `@gltf-transform/cli` (PROVEN), **ComfyUI on his 4090** through the comfyui MCP
  (connected; the fill workflow itself OPEN until run).
- Data folders (`level/`, `art/`, `layouts/`, `textures/`) are served at `/data/` in dev and
  copied into `dist/data/` at build (PROVEN, `web/vite.config.ts`).

Repo layout:

```
gallery-hang/
  docs/SPEC.md  docs/SPEC-v1.md  docs/SCAN-REPORT.md  docs/OBJECT-SHEET.md  docs/sheet/*.jpg
  scan/raw/9_2_2026.glb        the Polycam export, untouched
  scan/pipeline.py             raw → level/scan.clean.glb (reference), planes report
  scan/*.py                    measure scripts (report, planes, measure, plan views)
  level/level.json             the shell (from measurements, make_level.py)
  level/objects.json           the object catalogue (from the ticked sheet)
  level/build_level.py         level.json + objects.json + textures → level/level.glb
  level/level.glb              what the app loads
  textures/<surface>.jpg       baked + filled textures, one per surface
  textures/bake/               raw bakes before fill (kept for redo)
  art/  layouts/  web/  .github/workflows/pages.yml
```

---

## 3. The object sheet (`docs/OBJECT-SHEET.md`)

Made from the scan, before any geometry. One row per object: a picture shot inside the scan,
where it is, its size from the scan where measured, and a tick box. He ticks what gets
rebuilt and writes what I got wrong. Rows cover:

- **shell**: each wall, floor, ceiling, the stair, every opening
- **inside**: doors (leaf, frame, handle), window frames, the ceiling ribs and lights, the
  aircon, sockets and switches, the sign, anything else on the walls
- **outside**: the glass front and its frames, courtyard tiles, the red wall, plants, the
  low walls, the neighbour walls, the gate

Shots come from the P1 app itself: a `shot()` hook renders the scan from a set camera and the
dev server writes `docs/sheet/<name>.jpg` (BUILT, dev only).

---

## 4. Geometry

### 4.1 Shell — `level/level.json` (format `koan-hang-level/3`, written by `level/make_level.py` from `docs/CHECK-SHEET.md`)

Metres, y up, the de-rotated scan frame. `levels` (floorY, ceilY), `floors` (polys), `walls`
(`a→b` left→right as seen from the room, `facing`, `openings` door/window, `noHang`, `hang`),
`stairs`, `blockers`, `patches`, `spawn`. Current values: PROVEN against the scan and the
Polycam floorplan within 7 cm (SCAN-REPORT). Format v2 (`koan-hang-level/2`): openings carry `door` {type slide|swing|metal, open, toggle, leaf} or `grid`
{cols, bars, cross}; `ceilings` are explicit polys; stairs carry `to` (null = unused upper floor), `topBlocked`,
`sideWall`; `objects` (ribs, light, aircon, slab) live in the same file. The doors slide open and closed (pin
delivered): E toggles the nearest door, leaves animate, closed leaves block the walker.

### 4.2 Objects — `level/objects.json`

```json
{ "format": "koan-hang-objects/1",
  "objects": [
    { "id": "stair-1", "kind": "stair", "level": "ground", "from": [-6.475, -1.9], "dir": "+z",
      "width": 1.17, "treads": 16, "riser": 0.198, "tread": 0.225, "nosing": 0.02,
      "rail": { "side": "east", "height": 0.9, "posts": 0.9 }, "material": "stair-wood" },
    { "id": "door-stair-south", "kind": "door", "wall": "g-stair-room", "u": 4.32, "w": 0.80, "h": 2.00,
      "leaf": true, "swing": "in", "frame": 0.05, "material": "door-white" },
    { "id": "win-first-west", "kind": "window", "wall": "f-west", "u": 0, "w": 3.32, "bottom": 0, "h": 2.98,
      "mullions": [1.1, 2.2], "transom": 2.1, "frame": 0.06, "material": "frame-alu" },
    { "id": "ceiling-ribs-ground", "kind": "ribs", "level": "ground", "pitch": 0.15, "depth": 0.08, "dir": "+x" },
    { "id": "light-1", "kind": "light", "level": "ground", "at": [-3.0, 0.5], "size": [0.6, 0.1], "warm": true },
    { "id": "aircon-1", "kind": "box", "level": "ground", "at": [-2.5, 0.8], "size": [0.95, 0.25, 0.95], "y": "ceiling", "material": "aircon" },
    { "id": "tiles-courtyard", "kind": "floor-material", "floor": "courtyard", "material": "stone-tiles" }
  ] }
```

Kinds and what `build_level.py` makes of them:

| kind | geometry |
|---|---|
| `stair` | treads as boxes with nosing, risers, stringers, optional rail (posts + handrail) |
| `door` | frame (jambs + head) in the opening, leaf as a box, handle as a cylinder, swing angle |
| `window` | frame + mullions + transom as bars, glass as a thin transparent plane |
| `ribs` | repeated bars under a ceiling (the corrugated ceiling) |
| `light` | emissive box under the ceiling + a point light |
| `box` | any box object (aircon, socket, sign) at a position on a wall, floor or ceiling |
| `wall-material` / `floor-material` | binds a surface to a texture |
| `mesh` | a hand-made GLB in `level/parts/` for anything the kinds above cannot say (plants, gate) |

Sizes come from the scan (measure scripts on the cleaned mesh), positions from the shell.
Every object in the sheet becomes one row here after his ticks. OPEN: the kind list grows with
what he ticks.

### 4.3 Build — `level/build_level.py`

Reads the shell + objects, writes `level/level.glb`: one mesh per surface with its own UV
set (planar, 1 unit = 1 m, so textures at 512 px/m), materials referencing `textures/`,
Draco. Also writes `level/level.nav.json`: the collision set the app uses (walls, floors,
stairs, blockers), so the app never touches the render mesh for physics. PROVEN pattern
(trimesh + gltf-transform); the builder itself OPEN.

---

## 5. Textures

Per surface (each wall face, each floor, each ceiling, the stair, the courtyard tiles, the red wall):

1. **Bake.** Project the cleaned scan onto the surface's plane: for each texel, the nearest
   scan face within 12 cm of the plane, sample its texture. Output `textures/bake/<surface>.png`
   at 512 px/m plus a mask of texels the scan did not cover (holes, black patches, glass). OPEN.
2. **Fill.** ComfyUI on his 4090: an inpaint pass over the mask with a prompt per material
   ("white painted gallery wall, matte, even light", "polished concrete floor", "grey stone
   tiles with red brick inserts"), reference = the bake itself. Where a surface is mostly
   missing (glass sides, under the stair), generate from the reference of a sibling surface.
   Output `textures/<surface>.jpg`. Everything keeps its real marks (the sign, the sockets,
   the light pools) where the scan had them. OPEN: workflow to be built and shown to him on
   one wall first.
3. **Tileables.** Materials that repeat (ribs, tiles, wood) get one tileable texture each,
   generated once, reused by UV repeat.

Highest quality is the default: 512 px/m, no half-res tier unless a phone proves it needs one.

---

## 6. The app

Everything from v1 stays, with the scan removed:

- **Shell** (BUILT): full-screen viewport, floating cards INVENTORY / HANG / LEVEL / FILE,
  top strip with mode chips `walk` · `hang` · `level`, themes, `?`.
- **Walk** (BUILT, script-tested, his walk pending): pointer lock, WASD, Shift run, eye
  height 160 cm, collision on the nav set only, stairs walkable up and down, doors passable,
  `M` plan + click teleport, minimap always on.
- **Render**: `level.glb` lit by the level's own lights (§4.2 `light`) + hemisphere fill.
  Art gets a soft contact shadow. LEVEL card look chip becomes `textured` · `white box` · `wire`.
- **Inventory, hang, HANG widget, level fix, layouts, save paths, exports, flythrough**: as
  v1 §5.4–5.7, §6, §7, §8 (text kept in `docs/SPEC-v1.md`). Level fix mode now edits
  `level.json` and `objects.json` and triggers a rebuild request (the build runs offline;
  the app shows "rebuild pending" until the new glb lands, law 1).

---

## 7. Build plan

| phase | delivers | proof |
|---|---|---|
| P0 pipeline | scan cleaned, planes, compress | PROVEN 2026-09-02 |
| P1 walk | shell, walk, stairs, minimap, themes, Pages | BUILT 2026-09-02; live; his walk found the missing south stair door |
| **P1.5 object sheet** | `docs/OBJECT-SHEET.md` with shots and sizes | he ticks it |
| **P2 geometry** | BUILT 2026-09-02: the level is built at runtime by `web/src/level.ts` from `level/level.json` v2 (walls + openings, window grids, doors with slide/swing/metal leaves and E-key toggle, floors, ceilings, stairs with treads/nosings/side wall, ribs, lights, aircon, courtyard slabs). No `build_level.py`, no `level.glb`: runtime build, one file, instant edits. Scan gone from the app. Owner corrections folded in same day (two back-wall doors, hallway windows + street door, second flight over the first in front of the west window, plinth/desk removed). | he walks it; corrections still coming |
| **P3 textures** | bake + ComfyUI fill, one wall shown first, then all | he judges the wall, then the room |
| P4 hang | inventory, hang mode, HANG widget, autosave, file save/load, undo | he hangs a show |
| P5 fix + share | level mode, GitHub token save, exports, flythrough | he saves to the repo, prints the hang list, renders a flythrough |

Each phase = one GO. Each ends with his run in his browser.

---

## 8. Decisions of record (user, 2026-09-02)

1. Name KOAN.hang. 2. Courtyard kept, and now rebuilt too (v2). 3. Public repo. 4. Floating
cards. 5. Canvas edge = image wrapped. 6. Trust the scan for measurements. 7. All exports +
flythrough. 8. **v2: rebuild the level as our own geometry, scan = reference only.**
9. **Textures baked from the scan, completed by generative fill.** 10. **Generation on his
ComfyUI.** 11. **Walls plus every object, inside and out, recreated from the scan's details.**

Still OPEN: koan-shared vendor vs publish; the exact fill workflow; which objects (his ticks).
