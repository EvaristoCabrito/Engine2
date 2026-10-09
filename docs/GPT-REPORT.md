# GPT task report

## Task 1 — 3D prop library

Created `src/props/index.ts`, `src/props/gallery.ts`, `props.html`, and `qa/props.mjs`. Preview at http://127.0.0.1:5300/props.html on the existing server. All 22 kinds are present, with three rock and three chest variants (26 gallery entries). Shared generated material/texture and geometry caches, base-centred placement, deterministic seeded variants, variable bridge length through `options.length`, and light hooks without PointLights. `createPropInstances` batches scatter into shared component InstancedMeshes; two pines take two draw calls before shadows. No ongoing animation loop or per-frame canvas uploads. Do not dispose per-prop shared resources.

Validation: `npx tsc --noEmit` passed; headless Edge D3D11 `node qa/props.mjs refined` passed with no page/network errors, every base at y=0, exact 7-unit bridge bounds, and no PointLights. Original first-pass screenshots retained beside refined images in `shots/props/`. Materials use restrained natural colours, grain/bump, cutout foliage and real daylight/shadows. These are procedural code-built assets; screenshot review is not a claim of final photographic asset quality or RX6400 frame-rate certification. The gallery is separate from Claude's editor; integration remains in Claude-owned files. Fire meshes are emissive and deliberately do not cast opaque flame shadows.

| Prop / variant | Triangles |
|---|---:|
| pine | 1384 |
| broadleaf-tree | 1504 |
| dead-tree | 624 |
| stump | 288 |
| bush | 280 |
| rock 1 | 180 |
| rock 2 | 180 |
| rock 3 | 180 |
| boulder-cluster | 900 |
| cottage | 236 |
| ruined-wall | 204 |
| stone-wall | 300 |
| wooden-fence | 48 |
| gate | 144 |
| wooden-bridge | 336 |
| well | 224 |
| torch | 448 |
| brazier | 784 |
| barrel | 576 |
| crate | 60 |
| chest small | 60 |
| chest medium | 60 |
| chest large | 60 |
| signpost | 60 |
| tent | 116 |
| campfire | 1984 |

## Task 2 — Ember decoration mapping

Created `src/props/ember-decor-map.json` and `docs/ember-decor-map.md`. All 450 live decoration ids and names, original art footprints and effective blocking footprints are included, with complete grouped Markdown tables. Validated source-id/name/footprint equality, legal prop kinds and documentation coverage. 208 semantic prop candidates; 242 explicit gaps remain preserved as null, requiring dedicated assets. 141 mandatory blockers, 42 gameplay-flagged entries, 33 light definitions. Importer must preserve ids, rotation, per-placement collision overrides, destination information, loot/lock rules, door and waypoint semantics. Prop geometry dimensions must never replace authored collision footprints. No source changes.

## Task 3 — Ember battle porting guide

Created `docs/ember-battle-flow.md`, covering Mission setup, initiative, player turns, queue and animation gates, footprints/target zones, attack resolution, all 49 SpellKind values, statuses, AI, end conditions, persistence and liftable functions with source line references. Validated expanded SpellKind coverage and citation bounds. Claude integration decisions: startNewRound reuses initiative despite its reroll comment; numeric climb limits need a deliberate adapter because audited pathfinding has no elevation-array argument; renderer impact/complete contracts gate authoritative damage and must survive the rendering replacement. Ember unchanged.

## Task 4 — Sprite edge audit

Created `tools/audit-sprites.py` and `shots/audit/report.md`, `metrics.json`, 18 worst-frame contact sheets, 18 separate representative edge sheets and `overview.png`. Audited all 3,324 native frames across all 18 current manifest directories, rather than the outdated requested count of 17. Single-threaded processing. Originals and `tools/sprite-cleanup.json` untouched.

The full report ranks neutral-edge departures, disconnected alpha components and possible ground shadows. Visual review prioritizes Aldric, familiar2 and familiar3 fringes, plus Kael's baked ground shadow in atk-21.png. Neera variants and militia-v2 are strongest keep-unchanged candidates. Gray clothing and translucent tendrils create false positives; measurements cannot establish Veo/Hydra provenance. Source-generation labels remain unknown without metadata; the user chooses the cleanup list.

Run `python tools/audit-sprites.py`; additional representative edge sheets use `--sample-contact-sheets`. Open `shots/audit/report.md` for complete values and evidence links.

## Task 5 — Hex math and map tests

Created `tests/hex.test.ts` and `tests/board.test.ts`. Added Vitest and a single-worker npm test script; dependency installation updated package-lock.json. Final npm test: 2 files / 9 cases passed. Eight ordinary tests pass; one explicit it.fails case records a known defect. Covers all 720 centres of a 30x24 board, row parity, symmetric neighbours/distances, board edges, three real maps, authored elevation, terrain minimums, columns, water and void.

Bug for Claude: `src/core/hex.ts:21` makeLayout(1,1) centres at x=-0.433013 instead of zero because horizontal extent calculation assumes an odd shifted row exists. All single-row boards are offset. Recorded an expected-failure regression without changing Claude's files.

No Ember modifications, sprite cleanup, deletion of content, commits or pushes. Existing server on5300 reused; port8080 untouched.

## Task 1 restart — gothic cottage, approved design plus requested glass

Built a new cottage in Blender 5.2.2, without touching Ember models or their Engine2 copies. The user approved cottage v01 and requested glass windows. v03 retains that approved geometry and baked material look, and adds two leaded front lancet panes plus side casement glazing. The optional darker v02 draft is preserved but is not selected. No further props have been started.

| Active prop version | High source triangles | LOD0 triangles, including glass | LOD1 triangles, including glass | LOD1 / LOD0 | Shared runtime PBR texture memory, RGBA8 + mipmaps | Runtime PBR maps |
|---|---:|---:|---:|---:|---:|---|
| Gothic cottage v03, based on approved v01 | 215,230 | 34,052 | 12,969 | 38.09% | 64.00 MiB | 2K base colour, 2K tangent normal, 2K packed AO/roughness/metalness |

Window glass is 52 triangles, using a shared physical material (IOR 1.52, roughness 0.10, transmission 0.65). No additional PBR texture maps were needed for glass. Reflective environment and renderer transmission buffers are scene-wide preview costs, excluded from the prop's 64 MiB map figure. Model has one baked structural material and one glass material. Real-time transmissive glass adds a transmission render pass; this should be measured on the RX6400 in the final engine. LOD distance is currently 24 world units. Placement is base-centred and rests exactly at y=0. The preview has a 2.65-unit reference pole. Door design height is 2.4 units.

Files: `tools/blender/gothic_cottage_v01.py`, preserved v02 material script/draft, `tools/blender/cottage_glass_v03.py`, `tools/blender/cottage_glass_render_v03.py`; source/baked .blend, glb and separate maps under `public/game/props/gothic-cottage/v01/`, draft under v02, active glazing .blend/glb/metrics under v03. v03 GLB embeds the original approved PBR maps.

Loader and gallery: `src/props/baked.ts`, `src/props/gallery-v2.ts`, `props.html`. Previous `src/props/index.ts` and `gallery.ts` remain; original gallery preserved at `props-placeholder-v01.html`, original QA at `qa/props-placeholder-v01.mjs`. Current `qa/props.mjs` invokes `qa/props-v2.mjs`. GLTFLoader caches loading and clones share geometry/materials/maps. Await preloadProp before synchronous createProp.

See http://127.0.0.1:5300/props.html. Overcast/night/front/LOD shots and JSON QA reports are under `shots/props/gothic-cottage-v03-glass-balanced-*`. Earlier v01 and intermediate shots are retained. The updated glass Cycles render is `shots/props/gothic-cottage-v03-render.png`; original cottage render retained at `gothic-cottage-v01-render.png`.

Validation: npx tsc --noEmit passed. Headless Edge D3D11 QA passed, no page/network errors; automatic LOD1 at distant camera, exact floor placement, 3 shared 2048x2048 runtime maps. Blender model/bakes/renders capped at 2 threads, one Blender job at a time. No external downloads, deletion, renaming, Ember/core/editor/render file edits, commits or pushes. Existing server5300 reused;8080 untouched. Next: review requested glazing, then gnarled dead tree and iron street lantern one at a time after approval.

## Cottage v04 — close the wooden side window

At the user's request, closed the existing side shutter boards and iron straps in high source, LOD0 and LOD1. Front lancet glass remains intact. No new surfaces or textures: original UVs and baked material preserved. New asset `public/game/props/gothic-cottage/v04/gothic-cottage-v04.glb`, .blend and metrics; reproducible script `tools/blender/cottage_closed_shutters_v04.py`. Earlier versions remain untouched.

LOD0 34,052 triangles; LOD1 12,969 triangles; shared 2K runtime PBR maps64 MiB with mipmaps, unchanged. Added Side view to props.html and QA. npx tsc --noEmit and headless Edge D3D11 QA passed, including floor placement, day/night, side screenshot, distant LOD. Evidence: `shots/props/gothic-cottage-v04-closed-shutters-side-day.png`.

The live Vite server's ignored public/game watcher makes its public-file index miss newly created versions. Dev loader uses the working /public/game static route; production keeps /game. No changes to Claude's Vite config and no server restart.

## Ember import — rules, preserved VFX, campaign and saves (2026-10-08)

The new import request replaces the earlier prop roadmap. These ports were developed in parallel in the assigned folders. Verification jobs run one at a time with one worker. Ember and Claude-owned files remain untouched; no assets were deleted, no server was started, and no commits were made.

### Task C — campaign and saves

Added renderer-independent campaign modules preserving Ember's version 19 migration, six-slot bank, `ember-save-bank`, `ember-save`, `ember-save.bak` and `brasa-save` keys, historical migrations, in-battle snapshots, quest/dialog/affinity state and exact default inventory/rations. `parseRecord` and `parseBank` accept unchanged Ember JSON. Storage and notifications are injected through `configureCampaignStorage`; there are no window/document/Three/animation dependencies.

Preserved mapstore, overworld and hunger behavior: all 238 map exports, newest-serial selection, saved-map precedence, location/mission order, slots and floors, removed maps, chapters/quests/gates, recruitment/formation/leader, poison/disease/hunger/travel recovery/training, and authored encounter regions/zones. An optional RNG argument on `stepOverworld` enables deterministic travel without changing tuning. Added pure XP/level/promotion/stat actions, physical shared equipment transfers, shops/upgrades/sales/rations, quest discovery/accept/payment, and resolved battle-result persistence. XP healing preserves the original per-level HP clamp order. Victory persistence never rerolls drops; Wisp routing and rescue reward helpers are preserved.

Created: `src/campaign/{access,affinity,campaign,campaignTime,commerce,companionDialogues,dexterity,enmity,hexprops,hunger,index,inventory,mapstore,overworld,partyFormation,pathfinding,poison,progression,questActions,quests,save,skills,storage,victory-reward,watchtowerDungeon,weaponSkills,weaponTypes,wispCrossing}.ts`; unchanged `src/campaign/{location-order,location-submaps,map-order,map-slots,progression,random-encounter-zones,random-encounters}.json`; `tests/campaign/campaign.test.ts`.

Claude integration: inject host storage once, use `src/campaign/index.ts`, guard `finishBattle` once per battle run while allowing legitimate dungeon revisits, and pass already-resolved reward totals. The original save cleaner deliberately drops unknown snapshot fields; Engine2-only state requires an explicit schema extension rather than silently changing Ember saves.

### Task A — battle rules

Added the pure `Battle` API in `src/rules/`. It creates state from a draft, including terrain, decorations, elevations, spawns and roster; generates the seeded opening initiative and turn order; resolves movement, attacks, counters, all 49 `SpellKind` actions, skill/status ticks, enemy AI, summons, hazards, victory/defeat and authored loot synchronously. Actions return renderer-ready events; there are no animation waits. Rules preserve the exact source impact/combat methods and seeded RNG call order, and support their own deterministic save/restore plus adapters for Ember `BattleSnapshot` saves.

Movement uses authored body footprints and blocks any unit from entering another unit's body zone. Ember has no numeric climb limit; per the task, the named fallback is 2 elevation levels up and 3 down. Numeric elevation is included in reachable movement and decoration overlays. Original save adapters retain turn-began state, unit status and legacy metadata; Engine2's richer battle save additionally retains its RNG position and numeric elevations.

Created: `src/rules/{affinity,available-spells,battle,combat,context,dexterity,enmity,events,fog,frost,hexprops,pathfinding,poison,skills,spell-source,weaponSkills,weaponTypes}.ts` and the source extraction helper `src/rules/extract-source.cjs`; `tests/rules/{battle,source-parity}.test.ts`. The independent source oracle compiles original pure Ember helpers in memory and compares snapshot identity, seeded damage and RNG, initiative, body footprints, target zones, counters/forecasts, enmity and decoration/high-ground overlays.

### Task B — preserved spell VFX

Copied 14 Ember Three.js source files byte-for-byte into `src/vfx/legacy/three/` and kept their tuning values. A single `EmberVfxAdapter` converts Ember's Z-up coordinates and scale into Engine2's Y-up space. `playSpell(kind, from, targets, scene): Promise<void>`, `onImpact`, manual updates, and scene disposal are available through `src/vfx/index.ts`. VFX promises only synchronize visuals; battle logic remains immediate. `vfx.html` has a button for every one of Ember's 49 spell kinds. Spell kinds with a matching dedicated 3D system use it directly; remaining kinds route through `SPELL_VFX_FOR` to the closest existing preserved visual system. This reuses source effects without drawing new assets.

Created: `src/vfx/{adapter,adapter.test,index,preview,engine}.ts`, `src/vfx/legacy/three/` (14 unchanged files), `vfx.html`, `qa/vfx.mjs`. Adapter and lifecycle tests: 6 pass. Visual QA used Edge D3D11 with the running port 5300 URL fulfilled locally because that port now serves Claude's `C:\Engine2\game` app. The final QA output is `shots/vfx/final-verified/`: 22 day/night screenshots, 14/14 source hashes unchanged, all 11 effects cast 20 times (220 casts), 0 geometry growth, 0 texture growth, 0 browser errors, and the caster/target distance is exactly 4 hexes. Fireball shadow maps were enabled during the final run. The post-disposal baseline (2 geometries, 3 textures) is the preview's persistent floor/sprite scene; every effect returned to its own pre-cast geometry/texture counts after each 20-cast loop.

### Verification and handoff

Before the all-spell preview buttons were added, the assigned-scope run passed: 111 tests across `tests/rules`, `tests/campaign` and `src/vfx/adapter.test.ts`; `npx tsc --noEmit` passed. Per the user's follow-up, no tests were run after adding the 49-spell preview mapping. VFX visual QA covers the 11 dedicated effect systems. A broad Vitest discovery command also picked up 38 test files in the separate nested `game/` app; it reported no-suite and missing-file failures there, so those are outside this Engine2 port.

Claude should initialize campaign storage once, adapt `BattleEvent` to renderer events, and choose whether Engine2 elevation/RNG battle snapshots need a versioned extension to the original save format. The preview file and QA are ready, but port 5300 currently serves `C:\Engine2\game`; point it at the Engine2 root for the interactive `/vfx.html` page.
