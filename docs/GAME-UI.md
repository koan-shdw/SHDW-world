# SHDW.world — the game shell (spec, 2026-09-05)

**Owner, 2026-09-05:** "the UI looks too much like a tech demo, I want it to look like a game. The list of artwork should be
on a bar like hotkeys, the current one being placed should be in the corner like the selected weapon, the level stuff
should be hidden in an options menu. Go over the entire experience and make it more like a game. Refer to Messenger if
in doubt. Fun, clean, modern." "When we get close to a painting there should be an option to interact with it, remove it,
move it, etc." "First person for now, third later." "Change the name to SHDW.world."

Reference for doubts: Messenger (abeto.co): almost nothing on screen; side icons appear when needed; a prompt sits on the
thing you can touch; menus are full-screen and quiet; the world is the UI.

Every line: **PLAN** (what we build) or **OPEN** (his call). Nothing here changes a hang rule from gate 1 or a look from R2.

---

## 0. Name

**SHDW.world** everywhere the app shows a name: the tab title, the mark top left, the help, the layout file name default
(`shdw-world-layout`), the embed API (`window.__shdwWorld.start`, the old name kept as an alias for one release).
**OPEN: the repo.** Renaming `koan-hang` → `shdw-world` moves the link to koan-shdw.github.io/shdw-world (GitHub redirects
the old one). App name now; repo when he says the word.

## 1. The screen, at rest (walking, hands empty)

- **Top left**: the mark `SHDW.world`, 11 px mono, dim. Nothing else on the top edge. The top strip, the mode chips, the
  readout, the theme chips are gone from the screen (they live in options, §6).
- **Centre**: the crosshair, one 6 px dot in the accent.
- **Under the crosshair**: the prompt line, one line, only when there is something to say (§4).
- **Bottom centre**: the hotbar (§2).
- **Bottom right**: the hands slot (§3).
- **Bottom left**: the minimap, 160 × 130, rounded 8, 60 % dim until M.
- **Mouse free** (not pointer-locked): a centred "click to play" card, one line: `w a s d walk · mouse look · e touch · esc menu`.
  Everything else stays where it is, dimmed 40 %.

## 2. The hotbar

- Ten slots, bottom centre, 48 px square each, 4 px gap, one row. The slot number sits in the slot's top-left corner, 9 px.
  Slots hold the library in order; a slot with nothing is an empty outline. More than ten works: the bar scrolls, the
  selected slot stays in view; `,` `.` and the wheel move the selection, `[ ]` too. `1..9 0` pick by slot as today.
- A slot shows the work's thumbnail (painting image, sculpture render) and a corner chip for copies on the wall / floor
  (`×2`) in the accent. Hover: the title and cm size in a small tooltip above the slot.
- Click a slot = hold it (hands slot fills, §3). Click the held slot again = hands empty. `Q` = hands empty.
- The selected slot has the accent ring. The held one is the selected one.
- Dropping images or `.glb` on the screen still adds works: the add row opens as a small panel above the hotbar (title,
  h w d, edge / probed size), Enter commits, the new work lands in the next slot. Right-click a slot: `remove from
  library` (confirm), local works only.
- Empty library: the bar shows one dim slot with `drop images here`.

## 3. The hands slot (the weapon corner)

- Bottom right, 200 × 120. Shows the held work: thumbnail 96 px, title, `120 × 90 × 4 cm`, and for a sculpture the
  plinth line (`plinth 40 × 40 × 100` or `no plinth`). Empty hands: the slot is not drawn.
- The hands view in the world (the work in your hands, H) stays as it is.
- Modes collapse: **you are always walking**. Holding a work is what hang mode was. Every hang key works while holding;
  E on a hung work works with empty hands. `Esc` = the menu, never a mode switch. The `mode` chip row is gone.

## 4. Prompts and the touch menu

- The prompt line under the crosshair says one thing, lowercase, key first:
  - empty hands, nothing near: nothing.
  - empty hands, a hung work within reach under the crosshair: **the prompt sits on the work** (anchored, R3) and reads
    `e · interact`. The work glows faintly (edges only, as now).
  - holding a painting, wall hit, ok: `click · hang here`; refused: `can't hang here · over the door`.
  - holding a sculpture, floor hit: `click · place here · r turns`; refused: `can't place here · over another work`.
  - holding, nothing hit: `look at a wall` / `look at the floor`.
  - door in reach: `e · open door` / `e · close door` as today.
- **E on a hung work opens the touch menu on it**: a small panel anchored to the work (R3 anchors), pointer stays locked,
  the menu is keyboard-driven with the mouse free to click too:
  - `move` (1): the work comes into your hands; walk, look, click puts it back. Same as pick-up today, named.
  - `take down` (2): off the wall, toast `taken down · ctrl z brings it back`.
  - `swap` (3): the next library work replaces it in the same spot, same snap; `,` `.` cycle while the menu is open.
  - `turn` (4, sculptures only): 15°, shift back.
  - `done` (Esc or E again): closes.
  - Arrow keys nudge while the menu is open (1 cm, shift 10).
  - Sculpture menu also carries the look rows: colour, texture chips, tile cm, plinth on/off + w d h + colour (the
    HANG card rows from R4 move here; they are about *this* work).
- Only one touch menu at a time; walking more than 3 m away closes it. Tab-select (glow, delete, arrows) stays as is.

## 5. The wall widget (HANG card, slimmed)

- Shown only while holding a painting and a wall is under the crosshair; it rides beside the ghost (R3). Otherwise not
  drawn. It holds: snap line chips (top · centre · bottom · free), height cm + slider, gap cm, show guide. `snap all on
  this wall` and `snap all` move to the touch menu of any work on that wall (`align wall`, `align all`).
- Width 220, no head, no fold, no drag: a widget, not a card.

## 6. Options (Esc)

- Full-screen dim (60 %), a centred panel 560 wide, the mark on top, tabs on the left, content on the right. Esc, or the
  `back` button, closes. Pointer unlocks while open; clicking `back` relocks.
- Tabs:
  - **level**: look chips (clean · wire · textured), eye height cm, the room line (`8 hang walls · 2 stairs · 5 doors`).
  - **looks**: the eight dials as a switch list, quality chips.
  - **file**: layout name, save file, load file, clear, the autosave line.
  - **theme**: the theme chips (DECK · WINTERMUTE · FUCKUP).
  - **keys**: the help table (today's help).
  - **about**: SHDW.world, version, the commit, the Messenger credit line.
- The debug panel (backtick) stays separate.

## 7. Big map

- M as today: full-screen, click = go there. Esc closes it (before the menu).

## 8. What goes away from the screen

Top strip, mode chips, theme chips, readout, help button, the three floating cards, card drag / fold / stored positions.
The card code (`Card.svelte`) stays for the widget and panels but nothing is draggable any more.

## 9. Untouched

Every hang rule and key from gate 1 through R4 (1-9 0 , . [ ] scroll, Tab, 3 m reach, hands view H, Delete, arrows,
undo, Q), the looks and dials, the loader, the file format, the draft, Yozo's path.

**BUILT 2026-09-06**, live on main, one pass: mark, crosshair + prompt line, hotbar (ten slots, window keeps the held one in view), hands slot, `e · interact` on the work, the touch menu (move · take down · swap · turn · align this wall · align all · sculpture look rows), the wall widget riding the ghost, options on Esc (level · looks · file · theme · keys · about, `back` relocks the mouse), name SHDW.world (title, mark, embed `window.__shdwWorld`, layout default name). Old cards, top strip, modes: gone. PROVEN on localhost by script and screenshot: hold from the bar, hang, touch → swap / move / take down, undo, widget, options. OPEN: his play; repo rename.

## 10. Order

1. Spec read, corrected, GO.
2. Build in one pass on main: hotbar, hands slot, prompts + touch menu, wall widget, options, name. Script-tested.
3. He plays. His notes, one at a time, then the repo rename when he says `repo`.

## OPEN

- Repo rename (§0).
- Third person: later, his word.
- Hotbar with more than ten works: scrolls (my pick) or pages.
