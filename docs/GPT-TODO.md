# Engine2 — To-do list for GPT (parallel work)

## ▶ YOUR JOB NOW — Task 9: every ground Ember's maps use, as real 3D-rendered materials (round 5, from the user via Claude)

Tasks 6–8 are done (see your report). This one is **art + engine, ground only**.

### The problem
Ember's 147 maps paint their ground with **84 different ground arts** (terrain + tile variant). Engine2's ground
knows only **7** procedural textures (grass, forest, pavers, snow, rock, gravel, ash — `src/render/textures.ts`,
256 px canvas noise), so dungeon floors, temples, caves, tundra, farm soil, wooden floors… all fall back to one of
those 7. Make every one of them exist, as **real 3D-rendered materials**, and make the engine draw them.

### Art direction (read `PLAN.md` → "Art direction")
Photorealistic with a Bloodborne edge: worn, wet, grimy, mossy, cracked; muted palette. The bar is Ember's photoreal
sprites. Ground must stay **readable for tactics** (no busy high-contrast noise) and **seamless** (tileable, no
visible repeat at the default camera: turned 30°, tilted 20°, zoomed to a whole 20×16 map).

### What each one is
Ember's old tile art shows *what* each surface is: `C:\emberashes03D-main\public\game\tiles\<name>.png`
(READ-ONLY, reference only — never copy, trace or reuse its pixels; the user rejected that art).

### How to make them (Blender 5.2 headless, already installed)
- One procedural PBR material per family below (real geometry/displacement for slabs, bricks, planks, cracks,
  pebbles, roots, needles, crystals — then baked flat), **baked to seamless square maps**: base colour (sRGB, AO
  multiplied in), normal (OpenGL, +Y), roughness. 2048×2048 each (higher where detail still shows).
- Scale: 1 world unit = 1 hex radius; slabs/bricks/planks must read at real size next to Ember's humans (a human
  is ~1.53 hex widths tall). Texture repeats every 4 world units (the current shader's `vWP.xz / 4.0`) unless
  you change that consistently.
- Scripts in `tools/blender/ground/`, outputs in `public/game/ground/<family>/{color,normal,rough}.png`
  (or `.ktx2` — see budget). **One Blender job at a time, `--threads 2`** (the PC cuts power under all-core load).

### Families (30) and every Ember ground art that maps to each
| # | family | Ember ground arts (tileVariantName) | example maps |
|---|---|---|---|
| 1 | grass plains | plains016, plains001, plains003–006, plains015, plains019–030, plains037, hex-ground-001-planicie | aldeia, vau |
| 2 | photographic meadow | hex-ground-009-meadow-photographic, -plains-photographic, -prairie-photographic | farmlands, random-photographic-prairie |
| 3 | high grass | hex-ground-001-high-grass | random-amanita-glade |
| 4 | dark plains | hex-ground-001-dark-plains | random-blightwood-verge |
| 5 | hill grass | hill004, hill006, hill007, hex-ground-001-colina | aldeia, random-backward-hunt |
| 6 | forest floor (leaf litter) | woods005, woods009, hex-ground-001-bosque, highwood001 | misty-deep-mycelium, colina |
| 7 | pine needles | hex-ground-011-forest-needles | random-forest011-hemlock-trail |
| 8 | dark forest floor | hex-ground-011-forest-dark, deadtree001 | random-forest011-cedar-glade |
| 9 | ruin pavers | ruins005, ruins001, ruins006, ruins007, hex-ground-001-ruinas, highruin001 | aldeia, cemiterio-esquecidos |
| 10 | nave hall slabs | nave001, nave002 | cemetery-ground-deep-crypt-1, cemiterio-esquecidos-cripta |
| 11 | temple limestone | hex-ground-001-temple-limestone | frozen-swamp-1-sunk-vault |
| 12 | temple basalt | hex-ground-001-temple-basalt | random-bell-beneath-ice |
| 13 | dungeon flagstone | hex-ground-001-dungeon-flagstone, door001, door007 | watchtower-gate-floor, watchtower-prison |
| 14 | dungeon brick | hex-ground-001-dungeon-brick | watchtower-barracks |
| 15 | wooden floor planks | hex-ground-001-madeira, hex-ground-013-farm-planks | watchtower-barracks, farmlands-general-store |
| 16 | tilled farm soil | hex-ground-013-farm-soil | farmlands |
| 17 | cave earth | hex-ground-006-cave-earth, hex-ground-001-cave | frozen-swamp-1-hidden-cellar |
| 18 | cave moss | hex-ground-006-cave-moss | grotto-6 |
| 19 | cracked cave rock | hex-ground-006-cave-cracked | grotto-5 |
| 20 | cave crystals | hex-ground-002-cave-crystals, hex-ground-001-cave-crystals | random-crystal-ossuary |
| 21 | fresh snow | snow001, snow005, snow010, snow013, snow014, hex-ground-001-neve, hex-ground-010-snow-powder | frozen-tundra-crossing, random-icelands-i3 |
| 22 | wind-swept snow | hex-ground-010-snow-wind | random-icelands-i1 |
| 23 | snow crust / ice | hex-ground-010-snow-crust | random-icelands-i11 |
| 24 | tundra | hex-ground-001-tundra | frozen-swamp-crossing-1 |
| 25 | tundra with snow | hex-ground-001-tundra-snow | frozen-swamp-crossing-2 |
| 26 | river / pool bed (under the water sheet) | water023, water004, water005, water016, water017, hex-ground-001-agua, hex-ground-006-cave-water | vau, grotto-5 |
| 27 | ash and embers | ember001, ember005, flame001, flame003 | aldeia, templo |
| 28 | column rock | column001, column002, hex-ground-001-coluna | cemiterio-esquecidos |
| 29 | barricade dirt and rubble | barricade001 | bosque, colina |
| 30 | cliff faces (steep sides) | — (replaces today's earth/cliff side textures; keep one rock-type and one earth-type) | any map with height |

Anything not in this table falls back to its terrain type, as today. The table is the complete list of what the
latest version of every map uses (counted from `maps/ember`).

### Engine changes (your files for this task — Claude will not touch them meanwhile)
`src/render/textures.ts`, `src/render/terrainMaterial.ts`, `src/render/terrainMesh.ts`, `src/map/board.ts`
(surface assignment only), new `src/render/groundCatalog.ts`, `public/game/ground/**`, `tools/blender/ground/**`,
`ground.html` + `qa/ground.mjs` (a test page: one strip per family, day and night).
- **Per-hex surface comes from terrain + variant**: `tileVariantName(tile, draft.tileVariants[i])` from
  `src/ember/tileVariants.ts` → family via your `groundCatalog.ts` table.
- **Any number of surfaces**: today two vec4 splat attributes cap it at 8. Use a texture array
  (`DataArrayTexture`/`CompressedArrayTexture`) + per-vertex the top surface indices and weights, keeping what
  exists now: one continuous ground, world-space UVs, soft blends between neighbours, **no per-hex seams or grid
  lines**, steep faces projected from the side, Smooth/Hard edge styles, void.
- Use the normal and roughness maps (today the material has neither).
- **Keep these APIs unchanged** (the new map editor `src/editor/ember/dioramaView.ts` and the diorama use them):
  `groundTextures(renderer)`, `makeTerrainMaterial(tex)`, `buildSmoothGround(board)`, `buildHardGround(board)`,
  `buildWater(board, style)`, `groundHeightAt(board, style, x, z)`, `Board`, `TERRAIN_INFO`.

### Quality first — no graphics budget (user decision)
**Do not limit quality to fit a GPU.** The user will upgrade hardware if needed. Use 2048×2048 maps (or more) wherever
detail shows; no downscaling or lossy compression to save memory. Still no waste: load only the families the open
map uses, and keep the ground one draw call per material. Report the real video memory and frame time for information.

### Check it
Open http://127.0.0.1:8080/editor.html (the dev server is already running — **never start another**), pick
"Carregar mapa da campanha…" and load the example maps above; the 3D preview is the real renderer. Screenshots of
every family (close + whole map, day + night) to `shots/ground/`. Report in `docs/GPT-REPORT.md`: what you made,
VRAM, frame times, anything that still falls back.

### Rules (as always)
Ember is read-only. Only your files above. Never rename or delete what you didn't create. No git commits. Ask
nothing of the user directly; report and wait between steps: **step 1** = 3 families end-to-end (grass plains,
dungeon flagstone, fresh snow) with the engine change, then wait for the user's OK; **step 2** = the other 27.

## ✓ DONE — Task 6: port Ember's battle rules into Engine2 (round 4, from the user via Claude)

We are still **importing the game**. No drawing, no 3D, no art. You wrote `docs/ember-battle-flow.md`; now
port what it describes into Engine2 as **pure game logic** (no rendering, no DOM, no Three.js).

- **Your files:** `src/rules/**` (new) and `tests/rules/**` (new). Nothing else. Read `src/ember/**` (Claude's
  read-only snapshot of Ember's `types.ts`/`data.ts` — import from it, never edit it) and Ember itself (read-only).
- **Build, in this order, each step tested before the next:**
  1. Battle state from an Ember map draft (`maps/ember/*.json`) + spawns: units with Ember's stats, levels, HP,
     footprints (body types), sides.
  2. Initiative / turn order exactly as Ember does it.
  3. Movement: reachable hexes and paths with Ember's move costs, footprints and the **target-zone rule**
     (nobody enters another unit's body-type zone), plus **elevation**: read the level per hex from
     `terrainElevations`/terrain height and enforce a climb limit (make it a named constant; Ember's value if it
     has one, otherwise 2 levels up / 3 down — report which).
  4. Attack resolution: hit chance, damage, crits, counters, rear/flank, high ground — Ember's numbers.
  5. Skills: one `SpellKind` at a time (targeting, area, effect, cost/charges), starting with the six heroes' skills.
  6. Status effects, enemy AI decisions, victory/defeat.
- **API shape:** a `Battle` class whose actions return **events** (`moved`, `attacked`, `damaged`, `died`,
  `castSpell`, …) carrying everything a renderer needs (who, from/to, pose, timing hints). Claude's renderer will
  play those events; the rules never wait on animations.
- **Tests:** for each step, tests that compare against Ember's behaviour (seeded RNG, same inputs → same results).
- **Report** in `docs/GPT-REPORT.md` after each step. Wait for the user's OK between steps 3, 4 and 5.

## ▶ Also yours, in parallel with Task 6 (you have the budget — keep going without waiting between these)

### Task 7 — Port Ember's 3D spell effects
- **Read (never edit):** `C:\emberashes03D-main\src\game\gfx\three\` — `FireballVFX.ts`, `CausticVenomVFX.ts`,
  `BlessVFX.ts`, `MagicMissileV2VFX.ts`, `WebOfDreamsVFX.ts`, `PhantasmalForceVFX.ts`, `BurningHandsV2VFX.ts`,
  `BurningHandsV3VFX.ts`, `VarreduraVFX.ts` (Cleave/Sweep), `ProceduralElementEmitter.ts`, `ThreeVfxSystem.ts`, and
  whatever they import. Effect art is already copied to `C:\Engine2\public\game\fx\`.
- **Your files:** `src/vfx/**`, `vfx.html` (test page), `qa/vfx.mjs`.
- Move them over **as unchanged as possible** — they are preserved work. Ember's 3D scene is Z-up and Y-down
  (`-worldY`); Engine2 is **Y-up**, hex radius 1, one level = 1 unit. Adapt only coordinates/scale (one adapter),
  not the look. Copy each effect's tuning values exactly.
- Uniform API: `playSpell(kind: SpellKind, from: Vector3, targets: Vector3[], scene): Promise<void>` resolving when
  the effect ends, plus an `onImpact` hook (Ember gates damage on impact timing).
- `vfx.html`: a plain ground, a caster and a target marker 4 hexes apart, a button per effect, day/night toggle.
  Screenshots of each effect mid-flight and at impact to `shots/vfx/`.
- Respect the 4 GB GPU: share geometries/materials/textures, dispose everything when an effect ends, no leaks
  (log `renderer.info.memory` before/after 20 casts in your report).

### Task 8 — Port Ember's campaign and save systems (pure logic)
- **Read:** `save.ts`, `mapstore.ts`, `overworld.ts`, `hunger.ts`, `enmity.ts`, the inventory/equipment/loot parts of
  `data.ts`, and the JSON configs in `src/game/` (`map-order.json`, `location-order.json`, `map-slots.json`,
  `location-submaps.json`, `random-encounters.json`).
- **Your files:** `src/campaign/**`, `tests/campaign/**`.
- Port: world locations and mission unlocking, party roster, levels/XP, equipment/inventory/loot, rations/hunger,
  the save format (read Ember's existing save files unchanged), random encounters. No UI.
- Tests against Ember's behaviour; report in `docs/GPT-REPORT.md`.

## ⛔ HOLD — Task 1 (props) stays on hold (round 3, from the user via Claude)

**Stop all 3D prop modelling, Blender work included.** The user's decision: props and decor will be **photoreal 2D
art** (the same pipeline as the character sprites), standing in the 3D world as upright cards — not 3D models.
3D modelling always comes out generic; 2D is where this game reaches unprecedented realism. Don't build, decimate,
bake or rescale any 3D props. Leave what you already made where it is (don't delete it). Wait for new instructions.

## ⚠ STOP — read this first (round 2, superseded by the hold above)

Tasks 2–5 are done and good. **Task 1 (props) is rejected and starts over.** What went wrong, and the new rules:

1. **One task at a time.** Don't batch everything at once. Finish one step, show it, wait for the user's OK.
2. **The current props are far too low-poly** (crate/chest/signpost 60 triangles, fence 48, bridge 336). That's
   placeholder level, not photorealistic. They were also made before the art direction below existed.
3. **Art direction: photorealistic, with a Bloodborne edge** — see `PLAN.md` → "Art direction". Gothic, weathered,
   wet, grimy, mossy; muted palette; cold moonlight vs warm lantern light. The realism bar is Ember's photoreal
   sprites (`shots/cast/`, `shots/lighting/`).
4. **Polygon budgets (in-game mesh, LOD0)** — these are minimums for real detail, not targets to undercut:
   - small props (barrel, crate, chest, lantern, signpost, gravestone): **2,000–8,000 triangles**
   - medium props (well, brazier, fence/gate section, bridge span, coffin, campfire): **5,000–20,000**
   - large props (cottage, ruined wall, stone wall segment, tent): **15,000–60,000**
   - trees: **20,000–80,000**, foliage as alpha-textured cards where it makes sense
   - Add **LOD1** (~35–40% of LOD0) for each prop; the engine will switch by distance.
5. **Workflow (Blender 5.2, headless, `--threads 2`, one job at a time):** model a detailed high-poly version
   (bevels, subdivision, sculpted/displaced damage, chipped edges, rot, moss), then **bake** to 2K PBR maps
   (base colour, normal, roughness, AO; metalness where there's iron) onto the in-game mesh, and export `.glb`
   (LOD0 + LOD1) + maps to `public/game/props/<prop>/`. Load them in `src/props` with `GLTFLoader`, sharing
   materials. Delete nothing of your previous work; the old code props can stay as placeholders.
6. **~~Step 0 — salvage Ember's existing 3D models~~ — CANCELLED by the user. Do not decimate, bake, rescale or
   otherwise work on Ember's old 3D models (trees, tavern props, rock). Leave them exactly as they are.**
   (Original instructions kept below for the record only — do not act on them.)
   ~~Step 0 details:~~
   - **Trees:** `dead-oak`, `dead-snag`, `twisted-stump`, `snowy-pine`, `broadleaf`. They're excellent but far too
     heavy (160k–444k triangles each, colours stored per vertex). For each: keep the original as the high-poly
     source, make an in-game mesh of **20,000–40,000 triangles** (LOD0) + LOD1, and **bake** the original's detail
     and vertex colours into 2K maps (base colour, normal, roughness, AO). Leaves/needles may use alpha-textured
     cards. It must look like the original from the game camera.
   - **Tavern props:** `tavern-barrel`, `tavern-table`, `tavern-chair`, `tavern-candlestick`, `tavern-mug` — keep
     their geometry and baked textures, **fix the scale** to a 2.65-unit human: barrel ≈ 1.3 tall (now 1.63),
     table ≈ 1.1 (now 1.22), chair back ≈ 1.45 (now 1.71), candlestick ≈ 0.4 (now 0.87), mug ≈ 0.15 (now 0.55).
     Add LOD1 only where triangles exceed 5,000.
   - **Rejected:** `grey-outcrop` (rock). Don't salvage it.
   - **Sources (read-only, never edit):** the models in `C:\emberashes03D-main\public\game\models\` (already
     copied to `C:\Engine2\public\game\models\` — leave those copies untouched too), and the Blender scenes/scripts
     that made them in `C:\emberashes03D-main\assets\blender\` (`dead-trees.blend`, `create_dead_trees.py`,
     `snowy-pine.blend`, `realistic-tree.blend`, `tavern-props.blend`, `export_*.py`, …). Work on copies in
     `tools/blender/` and write results to `public/game/props/<name>/`.
   - Show the user the salvaged set (renders + `props.html` shots next to the human pole, triangle counts, texture
     memory) and **wait for approval** before step 7.
7. **First batch — only these three:** **gothic cottage**, **gnarled dead tree**, **iron street lantern** (lantern
   with a light hook). For each: a Cycles render (`shots/props/<prop>-render.png`), and an in-engine shot in
   `props.html` under overcast day and moonlit night next to the 2.65-unit human reference pole. Report triangle
   counts and texture memory per prop. **Then stop and wait for the user's approval** before any other prop.

Read `C:\Engine2\PLAN.md` first: it is the project's source of truth. Engine2 is a new diorama engine for
**Ember Ashes**, a hex tactics RPG: Triangle Strategy-style 3D world, Ember's photoreal sprites, hex board.
Tech: TypeScript + Three.js 0.166 + Vite. Dev server: `npm run dev` on port **5300** (Claude may already
have it running — check first, never start a second one, never touch port 8080).

## Rules (non-negotiable)

1. **Ember (`C:\emberashes03D-main`) is read-only.** Never edit, move, rename or delete anything there.
2. **Stay inside your own files** (listed per task below). Claude is working in parallel on:
   `src/render/`, `src/units/`, `src/editor/`, `src/map/`, `src/core/`, `src/ember/`, `editor.html`,
   `tools/prepare-sprites.mjs`, `tools/decontaminate.py`, `tools/import-ember.mjs`, and spell/effect work.
   **Do not edit those.** If you need something changed there, write it down in your task's report instead.
3. **Never rename files.** Never delete anything you didn't create.
4. **Performance is a hard requirement:** the minimum spec is a **4 GB** GPU (AMD RX 6400). Share geometry
   and materials, use `InstancedMesh` for repeated things, no per-frame allocations, no canvas-to-texture
   copies every frame.
5. **Keep the CPU cool:** the user's PC has had power cuts under all-core load. Run heavy jobs
   single-threaded, one at a time.
6. **No git commits or pushes** unless the user explicitly says so.
7. Ask the user when something is ambiguous; don't guess on visual decisions.

## World conventions (match these exactly)

- **Y is up.** Hex board centred on the origin. Pointy-top hexes, odd rows shifted right (`src/core/hex.ts`).
- **Hex radius `R = 1`**, hex width `√3 ≈ 1.732`. **One elevation level = 1.0 world unit** (`STEP`).
- **Human height ≈ 2.65 units** (1.53 hex widths, Ember's locked sprite size). Props must be in scale with that:
  a door ≈ 2.4 high, a cottage wall ≈ 2.6–3, a pine 3–6, a barrel ≈ 0.9.
- **Art direction: photorealistic, with a Bloodborne edge** (see "Art direction" in `PLAN.md`):
  Victorian-gothic stone and wrought iron, old timber, grime, moss, wet and weathered surfaces, decay; muted,
  desaturated palette; cold moonlight against warm lantern/torch light; fog-friendly. Dark but readable.
  Physically based materials (colour + normal/bump + roughness), never flat painted colours.
  **Do not match the prototype's look** (`C:\Engine2\index.html` is bright and storybook — use it only to see the
  techniques: seamless ground, lighting, diorama finish). The reference for realism is Ember's photoreal sprites in
  `C:\Engine2\shots\cast\` and `C:\Engine2\shots\lighting\`.
- The ground is seamless — **never draw hex outlines or tile seams** into props or terrain.
- **Ways to get photoreal materials and models** (pick what gives the best result, tell the user which):
  - **Blender 5.2** is installed (`C:\Program Files\Blender Foundation\Blender 5.2`): build models and bake PBR
    textures headless with Python (`blender -b -P script.py`). **Cap threads** (`--threads 2` / Cycles device threads)
    — the PC cuts power under all-core load. One bake at a time. Export `.glb` + texture maps into `public/game/props/`.
  - Free CC0 PBR texture/model libraries (ambientCG, Poly Haven): **ask the user before downloading anything**
    (say which files, from where, how big).
  - Code-generated textures are fine for small details, but photorealism is the bar.

---

## Task 1 — 3D prop library (biggest value)

**Goal:** a library of photorealistic, Bloodborne-toned decorations, ready to place on the board.

- **Your files:** `src/props/**` (new), `props.html` (new preview page), `qa/props.mjs` (new),
  `public/game/props/**` (new: models and texture maps), `tools/blender/**` (new: your Blender scripts).
- **Props:** gnarled dead tree, dark pine, twisted stump, thorn bush, weathered rock (3 shapes), boulder cluster,
  gothic cottage (steep roof, timber and stone), ruined gothic wall, stone wall segment, wrought-iron fence, iron gate,
  old wooden bridge span (variable length), stone well, gravestones (2–3), iron street lantern and wall torch (with a
  `PointLight` hook — don't add the light yourself, expose its position), brazier, barrel, crate, chest
  (small/medium/large), signpost, coffin, campfire.
- Each prop at a quality that sits naturally next to Ember's photoreal sprites; show the user a first batch
  (3–4 props) **before** making all of them, so the look is approved early.
- **API:** `createProp(kind: PropKind, options?: { seed?: number; scale?: number; variant?: number }): THREE.Object3D`,
  plus an instanced path for scatter (`createPropInstances(kind, transforms[])`) for trees, rocks and bushes.
- Shared materials and geometries across instances; textures generated once and cached.
- Every prop casts and receives shadows; origin at its base centre, sitting on y = 0.
- **`props.html`:** a gallery page showing every prop in a row on a plain ground, with a human-height reference
  pole (2.65 units), orbit camera, and two lighting setups to toggle: overcast day and moonlit night with a lantern.
- Texture memory matters (4 GB GPU): 1K–2K maps, shared between props where possible.
- **Done when:** `npx tsc --noEmit` passes, `props.html` shows every prop, `qa/props.mjs` (Playwright, headless
  Edge with `--use-angle=d3d11`, server on 5300) saves screenshots to `shots/props/`, and a short report lists
  each prop's triangle count.

## Task 2 — Ember decoration → prop mapping

**Goal:** know what every Ember decoration should become in 3D, so old maps can be dressed automatically.

- **Read:** `C:\emberashes03D-main\src\game\data.ts` (`DECORATIONS`, ~420 entries) and the decoration art names
  in `C:\emberashes03D-main\public\game\decorations\`.
- **Your files:** `src/props/ember-decor-map.json`, `docs/ember-decor-map.md`.
- For each decoration id: `{ id, name, footprint (hex offsets), blocks movement?, category, propKind (from Task 1) | null, notes }`.
  Group them (trees, rocks, architecture/walls/doors, furniture/indoor, light sources, chests, waypoints/exits, other).
- Flag any decoration whose meaning is gameplay (exits, connectors, chests, doors) — those keep Ember's rules.
- **Done when:** every decoration id in Ember's `DECORATIONS` appears in the JSON, and the markdown has a summary
  table per category with counts.

## Task 3 — Ember battle flow, written up as a porting guide

**Goal:** a precise map of how Ember runs a battle, so its rules can be moved into Engine2 without its
2D rendering.

- **Read:** `C:\emberashes03D-main\src\game\engine.ts` (BattleEngine, ~13k lines), `pathfinding.ts`, `hexprops.ts`,
  `enmity.ts`, `data.ts`, `types.ts`.
- **Your file:** `docs/ember-battle-flow.md`.
- Cover: battle setup from a `Mission`; turn order/initiative; a unit's turn (move, attack, skill, wait, end);
  the action queue (`active` items) and how animations gate game logic; movement + footprints (body types, the
  "target zone" rule); attack resolution (hit chance, damage, crits, counters, rear/flank, high ground); each
  skill's resolution (one subsection per `SpellKind`: targeting, area, effect, timing, which pose/sound/FX it
  triggers); status effects; AI decision making; victory/defeat; what is pure rules vs. what is rendering.
- For every claim, cite `file:line`. Mark clearly what is **rules** (must be ported) vs. **2D rendering** (dropped).
- **Done when:** the doc covers all of the above with line references, and lists the functions that could be
  lifted almost unchanged.

## Task 4 — Sprite edge audit tool (read-only)

**Goal:** sort the imported units into "cut from video with leftover background on edges" (Veo) vs. "clean"
(Hydra), so only the Veo ones get edge cleaning.

- **Your files:** `tools/audit-sprites.py`, outputs in `shots/audit/`.
- Input: `C:\Engine2\public\game\sprites\<dir>\` (the imported originals — read only). Unit folders are listed in
  `src/units/manifest.json`.
- Per unit: score edge contamination (how far semi-transparent edge pixels' colours sit from the nearby opaque
  interior, toward a common neutral background colour), count disconnected leftover blobs, and detect dark
  semi-transparent blobs below the feet (baked ground shadows).
- Output: `shots/audit/report.md` ranking units, and per flagged unit a contact sheet (original frame on bright
  green and on dark ground, plus a zoomed edge crop).
- Single-threaded (`NUMBA_NUM_THREADS=1` if you use numba/pymatting). Python 3.12 + numpy + Pillow + pymatting
  are installed.
- **Done when:** the report covers all 17 units and the user can decide the cleanup list
  (`tools/sprite-cleanup.json` — **don't edit it yourself**, just recommend).

## Task 5 — Tests for the hex math and map loading

- **Your files:** `tests/**` (new); you may add `vitest` as a devDependency and a `"test"` script to `package.json`
  (only those two edits to `package.json`).
- Test `src/core/hex.ts` (layout, `hexAt` round-trip for every hex centre of a 30×24 board, neighbours on even and
  odd rows, board edges) and `src/map/board.ts` (elevation rule `level = max(terrainElevations, terrain minLevel)`,
  water/void heights) using a few real map files from `maps/ember/`.
- **Done when:** `npm test` passes; if a test reveals a bug, write it in your report — don't fix Claude's files.

---

## Reporting

At the end of each task, append a short section to `docs/GPT-REPORT.md`: what you made, files created,
how to see it, anything you need changed in Claude's files.
