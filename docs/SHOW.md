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

## 5. The artwork: uploaded on the site, in the store, for everyone

- His 09-07 words: "I want to be able to upload artwork for both of us on the online version and it to stay there."
  So the app is the loader. Settings › **art** (our door only): the drop box (the AddPanel that is on the bar today,
  unchanged inside: drop, title, h w d in cm) and the library list (thumb, title, h × w × d, `on wall` chip, remove).
  The `+` leaves the bar. The bar shows the show's works, ten per page as today (1–9 0), `,` `.` page.
- **Where it lives**: the store. The image goes up as it is dropped: resized in the browser to 2048 px on the long side
  (JPEG 88, PNG kept if it has alpha), plus a 240 px thumb, `PUT /art/<id>` (the file, R2 bucket `shdw-world-art`) and
  `PUT /art/<id>/meta` (title, kind, h w d, edge, D1 table `art`). Every visitor's library = the repo's `art/index.json`
  (the built-ins: YOZO vol 2) + `GET /art` from the store. Images are served by the Worker from R2 at `/art/<id>.jpg`
  and `/art/<id>.thumb.jpg`, cached a year (the id changes when the file changes). A sculpture (GLB, prepared as today)
  goes up the same way, its thumb drawn in the browser as today.
- **Remove** (settings › art › remove): refused while the work is on a wall (as today); otherwise `DELETE /art/<id>`, a
  history row, gone for everyone within the 10 s tick (`GET /show` carries the library's version too).
- IndexedDB is no longer part of the show: a drop goes to the store, or, when the store is away, waits in the pending
  queue with the image kept in IndexedDB until it lands.
- Public door: nothing here. A visitor never sees the library, only the works on the walls.

## 6. Post-its

- A post-it is a small square work, **7.6 × 7.6 cm**, one colour per person (his 09-07: SHDW red `#e5484d`, YOZO blue
  `#4d7cff`), the text written on it in the WORLD theme's hand (Nunito, ink, 5 lines of ~16 characters,
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
- **S2 the artwork in the store**: R2 bucket + the `art` table, upload from settings › art, the library for every
  visitor from the store, add art off the bar.
- **S3 post-its**: the note slot, the field, the drawn note, the ring, hidden in public.
- **S4 history**: the list.

## 10. Open questions (his word before the gate that needs it)

1. Post-its in the public door: hidden (spec) or shown? (S3)
2. The Worker's address: `https://shdw-world-show.shdwart.workers.dev` (S1 built on it; a domain of his later if he says).

## 11. S1 as built (09-07)

- Worker `shdw-world-show` + D1 `shdw-world` live on his account (`worker/`), schema applied, the store URL in
  `web/src/world/store.ts`. The door: settings › the door, the word + SHDW / YOZO; wrong word shakes and says so.
  Public: controls + the door only, no bar, no hands, no rings, E only opens the room's doors, a work shows its name.
- Proven: the pane (SHDW, the door) put a sculpture in the store; his Chrome (public) showed it on open; the pane took it
  down; his Chrome dropped it within the tick, untouched. The word on the store is a placeholder until he sets his own
  (`npx.cmd wrangler secret put DOOR` from `worker/`).
- Not yet: dropped art is still per browser until S2, so a painting SHDW drops does not show for YOZO yet.

## 12. S2 as built (09-07)

- The Worker grew the art routes (`worker/src/index.ts`): `PUT /art/<id>/file` (jpg, png, webp, glb, 25 MB, into R2
  `shdw-world-art`), `PUT /art/<id>/thumb`, `PUT /art/<id>` (meta into D1 `art`, a history row `art`), `DELETE /art/<id>`
  (meta + files, a row `art-delete`), `GET /art/<id>.<ext>` and `.thumb.jpg` (from R2, cached a year, CORS open).
  `GET /show` carries `art` (the whole library) and `?since=` carries `art` + `artDeleted`.
- The site: `web/src/world/art/upload.ts` resizes in the browser (2048 long side, JPEG 88, PNG kept with alpha, 240 px
  thumb); `store.ts` `uploadArt` / `deleteArt`; `art.ts` library = repo + the store + this browser (`setArt`, `applyArt`,
  `addStore`, `pushLocal`); settings › **art** (`Options.svelte`) = choose files / drop anywhere → the AddPanel → the
  store, the library list with `on wall`, `built in`, `this browser only`, `to the store`, `all to the store`, `remove`.
  The bar's `+` is gone; an empty bar says add art in settings.
- Proven against `wrangler dev` (local D1 + R2): a drop from the pane (the door, SHDW) went up as jpg + thumb + meta,
  hung on the south wall, and his Chrome (public) showed the painting on the wall from the store on open; a work that
  lived only in the pane went up with `to the store` under the same id.
- Live 09-07: he enabled R2 in the dashboard, the bucket `shdw-world-art` was created, the Worker deployed with the
  ART binding, the site pushed.
- Dev: `web/.env.local` with `VITE_STORE=http://localhost:8787` points a dev build at `npx.cmd wrangler dev --port 8787
  --local` (schema first: `wrangler d1 execute shdw-world --local --file schema.sql`; the word in `worker/.dev.vars`,
  ignored by git).

## 13. S3 as built (09-07)

- `web/src/world/art/note.ts`: the post-it drawn in the browser (512 px, the paper in your colour, a glue band, the
  turned corner bottom right with the wall showing through, the words in Nunito 700 sized to fit, 140 characters max);
  `NOTE_ITEM` = the work behind every note (7.6 × 7.6 × 0.2 cm), never in the library list.
- The bar: nine works and the post-it as the tenth slot, key 0, a square in your colour. Click or 0: the field
  (`NoteField.svelte`) opens under the crosshair with the mouse free; enter = the note in your hands (the hands show it,
  `heldItem` on the art snapshot); esc = no note. It hangs like a painting (`place()` copies `note` onto the item).
- Placed as `art: 'note'` + `note: { text, who }`; drawn per item in `rebuild()` (`noteItem`); the originals law skips
  notes (`isPlaced`); nothing swaps for a note; the touch ring for a note is move · take down · done; on approach the
  pill says `SHDW · touch` / `YOZO · touch`.
- Public door: the note items come in with the show and are never built (`rebuild` skips `note` when the door is
  closed). Open question 1 kept its default: hidden.
- Proven on the live store: the pane (SHDW) wrote a note, held it, stuck it on the south wall, the store held it; his
  Chrome (public) received the item and drew nothing; the test note was taken down, store clean.

## 14. S4 as built (09-07)

- Settings › **history** (our door): every save, newest first, `time · who · what`, 200 a page, `more`. The words are
  made in the browser from the row (`hung Tengu`, `placed YOZO vol 2`, `moved …`, `took down …`, `hung a note “…”`,
  `added … to the library`, `removed … from the library`). Asked once, on the tab click (an effect that asked on the tab
  looped: the bus handler's write counted as a read; gone).
- Restore stays his word (§7).
