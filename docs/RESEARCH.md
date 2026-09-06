# SHDW.world — research for the ground-up game (2026-09-06)

Owner's brief: "still janky (right click, mouse move), the UI is still a tech demo, remake it from first principles so it
actually feels like a genuine game; deep research all the elements; look at the example (Messenger) deeply; DokeV by
Pearl Abyss for the feel." Every fact below names its source. **PROVEN** = read from a file or a page. **READ** = a
reviewer's or the developer's words. Nothing here is my taste; the taste goes in `docs/GAME.md`.

---

## 1. Messenger (abeto.co) — the example, taken apart

Source A: its shipped bundle (`App3D-DwM1eiaC.js`, 1.9 MB, read 2026-09-05/06). Source B: the Hacker News thread
https://news.ycombinator.com/item?id=45396441. Source C: https://80.lv/articles/deliver-mail-on-tiny-colorful-planet-in-this-relaxing-web-game.

**How it moves (PROVEN, bundle):**
- GSAP drives every tween. Eases used, by count: `none` 69, `inOut1` 11, `power2.out` 9, `power2.inOut` 6,
  `elastic.out(1, 0.75)` 4, `inOut3` 3, `sine.inOut` 2, `elastic.out(1, 0.9)` 2, `elastic.out(1, 0.6)` 2.
  Durations, by count: 0.2 s ×12, 0.35 s ×9, 0.15 s ×9, 0.07 s ×9, 0.05 s ×9, 2 s ×7, 0.5 s ×6, 0.1 s ×6.
  So: UI moves in 50 to 350 ms, elastic only for "pop" moments, long 2 s for ambience.
- Character: velocity + friction physics (`velocity` 72 refs, `friction` 19, `accelerationPhysics`), `sprintSpeed`,
  curve-following (`curveSpeed .52`), `lerp` 77 and `smoothstep` 79 in shaders and motion.
- Input: pointer events + wheel + keyboard + **gamepad** (`getGamepads`, `gamepad_update` event). **No pointer lock**
  (0 refs): third person, drag to orbit. Right click is not used (`contextmenu` only suppressed).
- Sound cues, named (PROVEN): `hover2`, `whoosh`, `click2/click3`, `zoom-in`, `zoom-off`, `open-box1/2`,
  `customize`, `button-turn`, `button-out`, `buttons`, `quest-complete`, `open-box-emote`, `open-box-checklist`,
  `land`, `jump`, `intro-letters`, `clothes`, `title`, random `emoji-starts/ends N`, random `rune N`.
  Every UI touch has a sound; hover has a sound; opening a box has a sound.
- Palette (PROVEN, hex counts in the bundle): `#66BDE6` sky blue ×21 (the accent), `#F8F8F8` off-white ×11,
  `#647A87` slate ×8, `#afe7eb` pale aqua ×6, `#f3c258` yellow ×5, `#c25959` red ×5, `#0f0f0f` ink ×5,
  `#de794e` orange ×4, `#8cc48c` green ×4, `#75bdc3` teal.
- The UI is drawn **inside the canvas**: MSDF text (glyph + msdf workers), bitmaps (bitmap worker); the DOM holds only
  invisible hit areas (`side-button`, `dialog-button`, `emoji-bg` divs with `pointer-events: none`) placed each frame
  at 3D anchors. Its stylesheet is 1.5 kB (a spinner). "The world is the UI" is literal.
- Events name the moments: `npc_bubble_show/hide`, `npc_dialog_open/finished`, `ui_zone_title_show`,
  `ui_sideicons_shown/hidden`, `quest_step_completed`, `character_physics_jump/land`, `end_screen_show`.
- Cel shading + ink outlines + dither + LUT (`outline` 104, `dither` 55, `lut` 280), SMAA.

**What people said (READ, HN):**
- The camera is the weak spot: "overshoot view then correct" (ComputerGuru), "rotates randomly... on par with a bad PC
  port" (gettingoverit), "needs an FOV slider and maybe the ability to dampen camera movement" (snerbles), "gets too
  close to the character" (geuis).
- Onboarding: "you can't click on things, there are no 'you can't do this yet' signs... utterly inscrutable"
  (Noumenon72). Quest givers carry an arrow over the head (red_trumpet).
- Sizes: 5.7 MB first load, 17.5 MB total, world model 333 kB Draco, "lower res levels of detail per model"
  (kettlecorn). Never too much on screen because the planet curves away (TeMPOraL).
- Emoji hotkeys 1-0 (araes). Mobile handles folding screens without a stutter (TeMPOraL); iOS narrow FOV nauseates
  (sheepscreek); touch mixes move and zoom (pjmlp).
- Stack (modernerd, from the studio's case study): three.js + three-mesh-bvh, Houdini + Blender, Substance, Figma +
  Affinity for UI, **GSAP and vanilla JS for animation**, DaVinci Resolve for sound, WebSocket/Node multiplayer.
- 80.lv: "soothing soundtrack", relaxation is the design goal, spherical walking "might be a bit disorienting".

**Lessons for us:** every touch makes a sound and a small move; UI colour is friendly not mono; menus pop with
`elastic.out(1, 0.75)`; the camera must never move on its own; put an FOV dial in; tell the player what they can touch.

## 2. DokeV (Pearl Abyss) — the feel he named

Sources: https://gameinformer.com/gamescom-2021/2021/08/25/dokevs-new-trailer-shows-off-explosively-colorful-gameplay,
https://en.wikipedia.org/wiki/DokeV, https://gamerant.com/dokev-mmo-pokemon-monster-hunter-kingdom-hearts/.

- "Explosively colorful", "eye-popping", "a hectic kaleidoscope of imagination", "a shot of energy" (Game Informer).
- Photoreal city + cartoon chibi characters; toys as weapons (hammers, inflatable balls); skateboards, rollerblades,
  a llama; K-pop soundtrack; "sunny streets" (Game Informer, Wikipedia, GameRant).
- Opens low-key, shifts "into high gear": pacing, not constant noise.
- Not released (2028); no HUD documentation exists. What can be taken: colour, bounce, toys, sun, music, everything
  squashes and pops, the world reacts to you.

## 3. Games that hang things

- **Occupy White Walls** (the gallery-building MMO): "click and drag assets and a hot bar menu system to place, twist,
  and deploy everything"; objects "fully manipulated in open space, rotated, and contorted"; players "control for
  lighting, viewing angles, the appropriate frame"; 1,762 building components; "surprisingly easy" to learn.
  https://gamespace.com/all-articles/previews/occupy-white-walls-in-a-hands-on-preview/ ,
  https://www.archpaper.com/2018/12/gallery-building-video-game-aspiring-architects-play-art-connoisseur/ .
- **House Flipper** (first person decorating): "controls are mostly tight and responsive, with a smooth first person
  camera"; but placement "does not lock to the parameters of the room and can ghost into walls where it turns red and
  refuses to be placed... a lot of slight tapping of controls to try and move objects a millimetre at a time".
  https://www.cubed3.com/games/reviews/pc/house-flipper , https://bigbossbattle.com/house-flipper-review/ .
  **Lesson:** a red ghost is not enough; snapping, guides and coarse-then-fine nudging are what stop the tapping.

## 4. Game feel, the rules

Sources: Steve Swink, *Game Feel* (2009) via https://www.gamedeveloper.com/game-platforms/feature-game-feel---the-secret-ingredient-
and https://en.wikipedia.org/wiki/Game_feel ; Jonasson & Purho "Juice it or lose it" (2012); Nijman "The art of screenshake".

- Game feel = real-time control + simulated space + polish. Six parts: input, response, context, polish, metaphor, rules.
- Response has an envelope (ADSR): how fast a press attacks, decays, sustains, releases. A held painting should
  attack fast (it is in your hand at once) and release with a small overshoot (it lands).
- Juice: the same action, with squash and stretch, anticipation, follow-through, sound, particles, shake. Add juice to
  a working thing, never to hide a broken one.
- Input buffering and coyote time exist to forgive the player; windows under 150 ms.

## 5. The mouse, on the web

Source: https://web.dev/articles/disable-mouse-acceleration and https://www.pcgamingwiki.com/wiki/Glossary:Mouse_acceleration .

- `element.requestPointerLock({ unadjustedMovement: true })` gives raw mouse deltas (no OS acceleration) on Chromium,
  Windows and macOS. It returns a promise; `NotSupportedError` → fall back to plain pointer lock. Needs a user gesture.
  Chrome 131+ may ask permission.
- Raw input + no smoothing + one sensitivity number is what makes a mouse feel "direct". Smoothing "adds a tiny delay
  and softens micro-corrections". Acceleration breaks muscle memory.
- **Our jank, named:** today the look uses accelerated deltas, the walker runs on the render frame (variable dt), the
  right button does nothing in the world and opens the browser menu on the bar, and every UI change is a hard cut with
  no sound. That is the "janky" he feels.

## 6. What we already have that stays

Room, KTX2 loader, workers, mesh-bvh, composer looks, Svelte shell, event bus, layouts, Yozo's file, the stand-in
sculpture pipeline. The remake below is the interaction layer, the feel layer and the skin, not the engine.
