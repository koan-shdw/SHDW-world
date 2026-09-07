# The show: two doors, one permanent layout, post-its (spec, 2026-09-07)

Owner's words, 2026-09-07: "I will be loading the artwork for the show into the app, the artwork I load will be the
artwork, in theory the user will not need to add new artwork once I've added it, I will be the one who does it, we can
bury new artwork in settings but the UI/UX should show what I've loaded for the public version." "I want to give this
to YOZO so he can work on the layout, when he lays things out as he's using it the changes he makes must be permanent
and I can access them too." "Essentially this is an app Yozo can use for layout, and we both access it and can make
changes, even leave notes." "It's only me and YOZO using it, any changes are perm for us, no one else uses it." "Then we
have a public version which we can give to others." "Public is look only." Notes: "a cute looking post-it note, a colour
for each of us, with the text written on it, these function like little artworks, we put them down and leave a note."
Cloudflare: "we'll need a Cloudflare account, we'll be using it for a lot of projects going forward" (made 09-07, his
email, `wrangler login` done).

Everything below is his sentence built through the app's existing grammar (docs/GAME-UI.md, docs/ART.md): the bar, the
hands, the wall snap, the touch ring, settings. No new grammar. Where the app already does it, the spec says so.

## 1. What exists today (read from the code, 09-07)

- The library: `art/index.json` in the repo (`koan-hang-art/2`, one item: YOZO vol 2) plus whatever this browser
  dropped, kept in IndexedDB (`koan-hang`). Nobody else sees a dropped work.
- The layout: `koan-hang-layout/2` (`web/src/world/art/art.ts`), items = placed works (painting: wall, u, topY, snap;
  sculpture: pos, yaw, colour, texture, plinth, parts). Autosaved to this browser's localStorage `koan-hang-draft`.
- Sharing by hand only: settings › file › save file / load file; save to repo with a GitHub token in the browser
  (`layouts/<name>.json`, `?layout=name` opens it).
- No identity, no notes, no history, one door for everyone (the bar and settings show for anyone who opens the site).

## 2. The two doors (walked from his seat)

**Public door** (the site, `https://koan-shdw.github.io/SHDW-world/`, no password): the visitor opens the site, the
title card says click to enter, they walk the yard and the room, the show is hung as SHDW and YOZO left it. Look only:
no bar, no hands, no wall widget, no touch ring, no add. Walking up to a work still shows its name (the label that is
there today). The settings button top right opens **controls** (mouse, view, eye height, head bob, reduce motion) and
**the door** (§3). Nothing else. The mountain, the CULT letters, the void: as today.

**Our door** (the same site, after the password): the bar comes back, the hands, the wall snap, the touch ring, the
look ring, add art (§5), the post-its (§6), file, keys, history (§7). Every change saves itself (§4). The site
remembers the door in this browser: open it once, it stays open on this machine until "leave" in settings › the door.

## 3. The door (settings › the door)

- A password field (one shared word, set on the store by the owner, §8) and two name tiles: **SHDW** and **YOZO**.
  Type the word, pick your name, `enter`. Wrong word: the field shakes (the refuse feel, `feel.ts`), nothing opens.
- After entering: the bar, the hands and the tools appear without a reload; the show reloads from the store (§4) over
  whatever this browser had.
- The name is who you are on every save and every post-it. It never shows in the public door.
- `leave` closes the door on this machine (forgets the word and the name).
- Stored in localStorage: `shdw-world-door` = `{ key, who }`. The key rides every write as the header `x-door`.

## 4. The permanent show (the store)

- One show. Its truth is the store, not the browser. The public door and our door read the same show.
- **Reads**: on open, `GET /show` → `{ version, items, notes }`. The room is built from it. Every 10 s while the tab is
  open: `GET /show?since=<version>` → new or changed items come in, removed items go out, live, no reload. A work that
  YOZO hangs while SHDW walks the room appears in SHDW's room within 10 s (the land feel, `feel.ts`).
- **Writes**, from our door only, per item, never the whole layout, so two people editing never wipe each other:
  - hang / move / swap / align / turn / look change → `PUT /show/items/<id>` with the placed item (the `Placed` record
    as today, plus `note` for a post-it, §6).
  - take down → `DELETE /show/items/<id>`.
  - Sent 1.5 s after the last change to that item (a nudge of 20 arrow taps is one write). Undo / redo write like any
    change. `clear` (settings › file) = one `DELETE /show/items` (all), with the confirm that is there today.
- **Guides** (snap line, heights, gap) stay per browser as today: they are your hand, not the show.
- **When the store is down**: the change stays in the room and in this browser, a toast `not saved · the store is
  away` (the errors-only toast rule), and it retries every 10 s until it lands. Nothing is lost on a closed tab: the
  unsent writes are in localStorage `shdw-world-pending` and go out on the next open.
- **Same item, two people at once**: last write wins, and the 10 s read brings the other person the result. Different
  items never conflict.
- **The local draft** (`koan-hang-draft`) becomes a cache of the store, not a second truth. `?layout=name` (the repo
  share link) keeps working as a read-only view of a saved file; it never writes to the store.
- **save file / load file** stay (settings › file). Load file = every item in the file is written to the store
  (the items are what the file carries; the art it carries must already be in the library, §5, or it is skipped with a
  toast naming it).

## 5. The artwork: in the repo, add art in settings

- The show's works ship in the repo: `art/index.json` grows from one item to the whole show; images in
  `art/paintings/<id>.jpg` (web size, longest side 2048, quality 88) with `art/paintings/<id>.thumb.jpg` (240 px);
  sculptures in `art/sculpt/` as today. Every visitor loads the same library; nothing lives in IndexedDB any more for
  the show. (A dropped local work still goes to IndexedDB for this browser only, as today, until it is committed.)
- **The owner loads the show**: `python art/prep_library.py <folder>` reads a folder of originals plus a `sizes.csv`
  (`file, title, h, w, d` in cm, his order h w d) → writes the web images, the thumbs and the index entries, prints what
  it added. Commit, push, live. A sculpture goes through `art/sculpt/prep.py` as today.
- **Add art moves into settings** (our door only): settings › **art**: the drop box (the AddPanel that is on the bar
  today, unchanged inside) and the library list (thumb, title, h × w × d, `on wall` chip, remove). The `+` leaves the
  bar. The bar shows the show's works, ten per page as today (1–9 0), `,` `.` page.
- Public door: nothing here. A visitor never sees the library, only the works on the walls.

## 6. Post-its

- A post-it is a small square work, **7.6 × 7.6 cm**, one colour per person (SHDW: `#ffe45c` yellow, YOZO: `#ff8fb1`
  pink; OPEN, his call), the text written on it in the WORLD theme's hand (Nunito, ink, 5 lines of ~16 characters,
  smaller if longer, up to 140 characters), a tiny turned corner at the bottom right, a soft shadow on the wall. Cute.
- **Leaving one** (our door): the last slot of the bar is the post-it (its icon: a blank square in your colour). Pick it
  (0, or click the slot): a small field opens under the crosshair, the mouse free as in the ring: type, `enter`. The
  note is in your hands, drawn with your text and your colour. Walk to a wall, it snaps like a painting, click sticks
  it. `esc` in the field = no note.
- **On the wall**: the touch ring for a post-it is `move · take down · done` (no swap, no turn). Anyone with the door can
  move or take down anyone's note. Walking up to it shows the name pill as for a work: `SHDW` or `YOZO`, and the text
  is readable on the note itself (its image is drawn at 512 px, crisp at 1 m).
- **Saved** as an item with `art: 'note'`, `kind: 'painting'`, plus `note: { text, who }`. The image is drawn in the
  browser from those two fields; nothing is uploaded. `who` is the name from the door, never typed.
- **Public door**: post-its are hidden (they are the two of you talking about the layout). OPEN, his call: shown or
  hidden.

## 7. History (settings › history, our door)

- Every write is a row: time, who, what (`hung Tengu on the south wall`, `moved YOZO vol 2`, `took down a note`,
  `SHDW: a note`), newest first, 200 rows a page, `more`. Read from `GET /show/history?before=<ts>`.
- Restore is not in this spec: he decides after he sees the list ("history kept, every save" is the promise; putting the
  show back to a moment is the next word).

## 8. The store (Cloudflare, his account)

- Account: `alexanderhughmitchell@gmail.com`, id `59b19b9d…0500f`, free plan; `wrangler login` done 09-07 on this PC.
- One Worker `shdw-world-show` at `https://shdw-world-show.<subdomain>.workers.dev`, one D1 database `shdw-world`.
  Code in the repo: `worker/wrangler.toml`, `worker/src/index.ts`, `worker/schema.sql`. Deploy: `npx.cmd wrangler deploy`
  from `worker/`. Free tier: 100k requests a day, D1 100k writes a day, both far above two people laying out a show.
- Tables: `items (id TEXT PRIMARY KEY, json TEXT, who TEXT, ts INTEGER)` and `log (ts INTEGER, who TEXT, op TEXT, id
  TEXT, json TEXT)`. `version` = the newest `ts` in `items`. `GET /show` = every row of `items` (+ `notes` = the rows
  whose json has `note`, split out so the public door can drop them); `GET /show?since=` = rows with `ts > since` plus
  the ids deleted since (a `deleted` row in `log` with `op = 'delete'`).
- **The password**: the Worker secret `DOOR`. The owner sets it himself, once, from `worker/`:
  `npx.cmd wrangler secret put DOOR` (it asks, he types, nothing in chat, nothing in the repo). Every write must carry
  `x-door` equal to it, else `401`. Reads are open (the public door reads them).
- CORS: `https://koan-shdw.github.io` and `http://localhost:5374` only.
- The site's `web/src/world/store.ts` is the one file that talks to the Worker: `load()`, `since()`, `put(item)`,
  `del(id)`, `history()`, the 1.5 s per-item debounce, the pending queue, the 10 s tick. `art.ts` calls it where it
  autosaves today; nothing else changes shape.

## 9. Gates (each its own GO, each walked in the pane and in his Chrome before the next)

- **S1 the store**: the Worker + D1 live on his account, `store.ts`, the show reads from and writes to it from our
  door; the door itself (§3); the public door look-only (§2). Proof: SHDW hangs a work in one browser, it stands in
  another browser within 10 s; the public door shows it and cannot touch it.
- **S2 the artwork in the repo**: `art/prep_library.py`, his show loaded (he gives the originals and sizes), add art
  moved into settings, the `+` off the bar.
- **S3 post-its**: the note slot, the field, the drawn note, the ring, hidden in public.
- **S4 history**: the list.

## 10. Open questions (his word before the gate that needs it)

1. Post-it colours: SHDW yellow `#ffe45c`, YOZO pink `#ff8fb1`? (S3)
2. Post-its in the public door: hidden (spec) or shown? (S3)
3. The artwork: originals + sizes in a folder, or the saved file from your browser? (S2)
4. The Worker's public address: `shdw-world-show.<his subdomain>.workers.dev` as Cloudflare gives it, or a name on a
   domain of his? (S1; the workers.dev one is free and enough)
