# SHDW.world — the game, from first principles (spec, 2026-09-06)

**Owner, 2026-09-06:** "still junky, the right click, the mouse move, it's all a bit janky; review how it works and how we
interact with the scene and remake it from the ground up; the UI is still a tech demo, needs to be fun and look like a
game, look at the example. When I put art down it goes down once, it's not repeatable, we only have one of each, they're
original. I don't like how I put the sculpture down and it's still in my hands. Give the entire project a first-principles
complete remake so it actually feels like a genuine game. DokeV by Pearl Abyss for the feel."

Facts behind every choice: `docs/RESEARCH.md`. Every line is **PLAN** unless marked **OPEN** (his call).
The engine stays (room, loader, looks, bus). What gets remade: input, feel, the collection rules, the whole skin.

---

## 0. The two laws he gave

1. **Originals.** One of each. A work is in the bar, or in your hands, or on the wall. Never two places. Hung = it leaves
   the bar (its slot stays, dimmed, tagged `on wall`, click = your crosshair swings toward it... no: click = nothing but a
   hint `walk up to it`). Taken down = it comes back to the bar. The `×2` chips are gone. The file format keeps `items`
   but never two items for one work; loading a file with duplicates keeps the first.
2. **Down means down.** Place a painting or a sculpture: your hands are empty. The bar's ring moves to nothing.

## 1. Feel (Swink: input → response → polish)

**Input**
- Pointer lock with raw movement: `requestPointerLock({ unadjustedMovement: true })`, fallback to plain lock. No
  smoothing, no acceleration. One sensitivity dial (options › play), default 0.0022 rad per count as today.
- Fixed-step simulation: the walker and physics step at 120 Hz with an accumulator; the render frame interpolates. A
  hitch never becomes a lurch. Look (yaw, pitch) applies instantly on the mouse event, not on the next frame.
- FOV dial (options › play), default 75, 60 to 100. The camera never moves on its own: no auto-recentre, no overshoot
  (Messenger's one flaw, HN).
- Keys are verbs: **click** = do (hang, place, talk to the thing), **E** = touch (open the work's menu, open a door),
  **right click** = put back (held work → bar; touch menu → close; nothing held → nothing), **Q** = same as right click,
  **R** = turn, **1-0** = pick, **wheel** = slide the bar, **Tab** = cycle hung works, **M** = map, **Esc** = options.
  The browser's context menu is suppressed everywhere in the game (canvas, bar, cards).
- Forgiving aim: the touch target is the nearest touchable inside a 10° cone around the crosshair within 3 m, not the
  exact pixel. Input buffer 120 ms: a click 100 ms before the ghost turns green still hangs.

**Response (the envelope of every action)**
- *Pick from the bar*: the slot lifts 6 px and scales 1.08 in 120 ms `power2.out`; the work rises into the hands view
  from below in 220 ms `power2.out`; sound `pick`.
- *Carry*: the hands view lags the camera by a 90 ms spring and sways 1.5° with walking; it is alive in the hand.
- *Ghost meets a wall*: the work leaves the hands (hands view fades 120 ms) and snaps to the wall in 150 ms
  `power2.out` with a 1.04 → 1.0 settle; the snap line lights; sound `snap` (a soft tick). Refused: the ghost goes
  red, shakes ±6 px twice in 160 ms, sound `nope` (a dull clack); the prompt says why.
- *Hang / place* (click): the ghost lands with `elastic.out(1, 0.75)` 350 ms (Messenger's pop), a ring of dust at the
  contact edge for sculptures, sound `land` (painting: a felt thud; sculpture: stone). Hands empty. The bar slot dims
  with a 200 ms fade and gets its `on wall` tag.
- *Touch* (E in the cone): the work brightens (edges), the menu pops on it: scale 0.9 → 1 `backOut` 180 ms, items
  stagger in 30 ms each; sound `open`. Leaving the cone or E again: fades 100 ms, sound `close`.
- *Move* (menu 1): the work flies into the hands view 220 ms; the slot un-dims. *Take down* (menu 2): it shrinks into
  the bar slot along a curve 300 ms `power2.in`, sound `whoosh`; slot un-dims with a bounce.
- *Swap* (menu 3): the two works cross-fade on the wall 200 ms; the bar shows the change with two slot bounces.
- *Turn* (R): 15° in 180 ms `power2.out`, sound `turn`.
- *Door* (E): the leaf swings 600 ms `power2.inOut`, sound `door` (open/close differ).
- *Nudge* (arrows): 1 cm with a 90 ms ease, shift 10 cm; tenth press in a row: sound pitch rises a step (feedback that
  you are travelling).
- *Menu / options*: dim rises 200 ms, panel scales 0.96 → 1 `power2.out` 220 ms, tabs slide 60 ms stagger; `back`
  reverses at 150 ms. Every button: hover lifts 2 px + sound `hover`, press dips 1 px + sound `click`.
- *Footsteps*: material-aware (concrete, checker plate, plywood stair, gravel yard), 2 variations each, walk / run
  cadence; a soft landing sound when the stairs level out.
- *Hover in world*: a touchable work under the cone gets a 2 px accent rim that pulses once, not forever.

**Polish rules**
- Nothing cuts. Every state change has a duration from the table: 70 (micro), 120 (snap), 180 (pop), 220 (move),
  350 (land), 600 (door), 2000 (ambience). Eases: `power2.out` default, `power2.inOut` for doors and panels,
  `elastic.out(1, 0.75)` for landings, `sine.inOut` for idle sway.
- Every touch has a sound. One sprite file (WebAudio), positional for world sounds, UI sounds flat. Volume and mute in
  options › sound. Music: OPEN (he names a track or none).
- Juice never hides a bug: the rule stays true with sound off and motion off (options › play › reduce motion).

## 2. The look (DokeV meets Messenger, on the KOAN var contract)

- **A new theme, `PLAY`**, default: sky `#66BDE6`, cream `#F8F8F8`, ink `#0f0f0f`, slate `#647A87`, yellow `#f3c258`,
  coral `#c25959`, green `#8cc48c`, orange `#de794e` (Messenger's palette, PROVEN in its bundle), pushed brighter for
  DokeV's sun. DECK, WINTERMUTE, FUCKUP stay in options › theme for him.
- **Type**: a rounded sans for the game (Nunito 700/800, self-hosted woff2, no CDN), sizes 14 body, 16 buttons, 22
  titles, 40 the mark. The mono stays for numbers (cm) only. Everything lowercase except the mark.
- **Shape**: radius 14 on cards, 10 on slots, 999 on pills; 2 px ink outlines on everything that can be pressed; flat
  fills, one soft shadow (0 6 0 rgba(0,0,0,.18)) that collapses on press. Chunky, toy-like, DokeV's hammers and balls.
- **Icons**: drawn, 2 px stroke, rounded caps: hand (hold), hook (hang), arrow-down (take down), swap, turn, door,
  map, cog, cross, check. One SVG sprite in the repo.
- **The mark**: `SHDW.world` in the rounded sans, 40 px on the title card, 14 px top left in play, ink on a cream pill.
- **Motion tokens** live in `ui/motion.ts` (durations, eases) and `world/feel.ts` (the same numbers for 3D), one source.
- The world keeps the R2 looks (outline, dither, LUT, sky). The ink outline is the bridge between world and UI.

## 3. Screens

**Title card** (before the first click): the mark, `press anywhere to enter`, the room slowly turning behind a soft
dim, ambience playing quietly. First click: dim lifts 400 ms, the mark flies to its corner 500 ms, pointer locks.

**Play** (hands empty): crosshair (a 6 px dot that grows to a 14 px ring over a touchable, 120 ms), the mark top left,
the bar bottom centre (dimmed 40 % until you hold something, so the room owns the screen), minimap bottom left (dim,
rounded, M for full).

**The bar**: ten chunky slots, thumbnails with a 2 px ink border, the number on a small cream pill top-left, the held
slot lifted with a sky ring, hung slots dimmed with an `on wall` pill. Wheel slides the selection with a 120 ms ease;
1-0 jumps. Right click on a slot: put back / remove (local works, confirm). Drop images or `.glb` anywhere: the add
card pops above the bar (title, h w d, edge), Enter adds with a slot bounce.

**Hands card** (bottom right, while holding): thumbnail, title, size, for a sculpture the plinth line, three key pills:
`click hang` `r turn` `right click put back`. Pops 180 ms when the hands fill, drops when they empty.

**Prompt pill** (on the target, anchored): `e · touch`, `e · open`, `click · hang here`, `can't hang here · over the
door`, `look at the floor`. One pill, one line, ink on cream, 14 px, pops 120 ms.

**Touch menu** (on the work): a cream card with a 2 px ink outline: title + size, then rows `1 move` `2 take down`
`3 swap` (`4 turn` for sculptures) `align this wall` `align all`, sculptures add colour, texture chips, tile cm,
plinth on/off + w d h + colour. Keys and mouse. Closes on E, Esc, right click, or leaving the cone.

**Wall widget** (only while a held painting meets a wall): rides beside the ghost: `top centre bottom free` pills,
height cm with a slider drawn as a rail on the card, gap cm, `show line`. The dashed line on the wall glows sky.

**Options** (Esc): tabs `play` (sensitivity, FOV, reduce motion, hands view), `looks` (the eight dials, quality),
`sound` (master, ui, world, music, mute), `file` (name, save, load, clear), `theme`, `keys`, `about`. `back` relocks.

**Map** (M): as today, restyled: cream card, ink lines, a sky dot for you.

## 4. Camera and walk

- First person. Eye 160 cm (dial). Walk 2.2 m/s, run 4.2 (shift), head bob 1.2 cm at walk cadence (dial, off in
  reduce motion), FOV 75 (dial). The walker stays on the level's nav data (walls, doors, stairs as ramps): it never
  catches, never falls, the stairs feel as today. **OPEN:** the capsule-on-BVH walker, if he ever wants to feel steps.
- Doors: E within 1.6 m, the leaf swings; a door you cannot open says `locked` in the pill.
- The yard step (+10 cm): a real step with a small camera dip and a `step` sound.

## 5. The collection (the two laws, in the data)

- `art/index.json` and the local library: unchanged shape.
- `layout.items`: at most one item per `art` id. `place()` refuses (`already on the wall`) if the work is placed;
  the bar never lets you hold a placed work (its slot says `on wall`, click = pill `walk up to it and press e`).
- `swapInPlace` swaps with a work that is **not** placed (it takes the spot; the old one goes back to the bar).
- Import: duplicates collapse to the first, a toast says how many were dropped.

## 6. Architecture (what changes in the code)

- `world/input.ts`: raw pointer lock, key map (verbs above), cone targeting, input buffer, contextmenu suppression.
- `world/step.ts`: fixed-step loop (120 Hz accumulator), interpolation for the camera.
- `world/feel.ts`: GSAP tweens for 3D (hands spring, ghost snap, land pop, refuse shake, door swing, take-down flight).
  GSAP joins the stack (Messenger's animation library, PROVEN).
- `audio/`: WebAudio sprite (`audio/sprite.json` + one `.webm`/`.mp3`), positional world sounds, UI bus sounds; the
  sounds are made in-repo with a small synth script (`audio/make.py`, sine/noise envelopes) until he brings real ones.
- `ui/`: `motion.ts`, `theme PLAY`, components restyled: Title, Crosshair, Prompt, Bar, Hands, Touch, Widget, Options,
  Map, Toasts; Svelte transitions with the motion tokens; the icon sprite.
- `art.ts`: originals (`isPlaced`, refuse, swap rule), place empties hands, no `placedCount`.
- Nothing else moves. Level, loader, looks, bus, files stay.

## 7. Order and gates

| gate | builds | done when |
|---|---|---|
| **F1 feel** | input.ts, step.ts, feel.ts, audio, the two laws, every response in §1 on the *current* skin | he walks and hangs and it does not feel janky; script proves raw lock, fixed step, originals, hands empty |
| **F2 skin** | theme PLAY, type, shapes, icons, every screen in §3, motion tokens | he says it looks like a game |
| **F3 polish** | his notes, one at a time; footsteps by material; the title card ambience | his word |

Each gate live on main, tested by script and screenshot, then his play.

**F1 BUILT 2026-09-06**, live on main: `world/input.ts` (raw pointer lock with fallback, verbs, click buffer 120 ms, context menu suppressed), fixed 120 Hz step with camera interpolation, `world/feel.ts` on GSAP (snap, refuse shake, land pop, take-down flight, turn, nudge, hands rise, FOV glide, step dip), `audio/sounds.ts` (23 synthesised cues, positional, volumes, mute), the two laws in `art.ts` (`isPlaced`, hold refused, place empties the hands, swap only with free works, import dedupe), forgiving cone aim, hands view lagging the camera with a walking sway, head bob, footsteps by footing, options › play (mouse, fov, head bob, reduce motion) and › sound. PROVEN by script on localhost: place → hands empty; a placed work cannot be held; right click puts back; remove flies then frees the slot; duplicates dropped on import; audio context live. UNTESTED: his hands; raw-movement support on his Chrome (reported in the debug handle as `input.rawSupported`).

## OPEN

- Music: a track or none.
- Third person: later, his word.
- Repo rename to `shdw-world`: his word.
- Capsule walker: his word (nav data stays until then).
- Real sounds: his files, or the synth set stays.
