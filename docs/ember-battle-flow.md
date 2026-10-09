# Ember battle flow — Engine2 porting guide

Source audit: 2026-10-08. Ember was read only. All citations below are relative to `C:/emberashes03D-main/src/game/`; `engine.ts:1601` therefore means that exact file and one-based line. Ranges identify the complete relevant implementation, rather than a guessed call site. This is a porting guide, not a proposal to change gameplay.

## Boundary and source map

**RULES — port:** Mission/Unit/SpellKind data, seeded RNG, occupancy, traversal, targeting, damage, status durations, resource spending, turn ownership, AI, loot, campaign-facing outputs and snapshots (`types.ts:185–238`, `types.ts:529–550`; `engine.ts:1601–1710`, `engine.ts:1932–2263`).

**PRESENTATION — replace drawing, preserve authored cues:** Canvas geometry, screen coordinates, camera projection, painted ground, decoration compositing and effect drawing (`engine.ts:9688–10322`, `engine.ts:11133–11416`, `engine.ts:11845–13580`). Sprite pose selection, sound and timing are part of the retained content; they are not evidence that the old Canvas renderer must remain (`engine.ts:2540–2659`, `engine.ts:10464–11067`).

**MIXED — split carefully:** `tick`, `startSeq`, `stepActive`, `stepCombat`, `stepSpell`, movement commits and start-of-turn handlers contain both authoritative mutations and visual calls. Deleting them as “animation code” deletes gameplay (`engine.ts:2264–2513`, `engine.ts:2540–3755`, `engine.ts:4120–4207`, `engine.ts:9173–9221`).

## Battle setup from a Mission

`BattleEngine(mission, art, roster, seed, debugFreeCast)` copies roster affinity/skills, leader and owned weapons; takes dimensions/layout, clones decorations and applies watchtower/rock corrections (`engine.ts:1601–1617`). Decoration definitions that name a tile stamp their placed footprint into terrain; barricades and the decoration overlay are then built (`engine.ts:1643–1654`, `engine.ts:1687–1688`). This stamping is rules; loading missing decoration images and synthesizing optional water visuals are presentation (`engine.ts:1631–1642`, `engine.ts:1656–1686`).

The RNG seed is `seed + mission.index * 97`. Player spawns exclude unconscious heroes; previously defeated crossing spawns are excluded from enemy/neutral creation; neutral NPC spawns are deduplicated. Units are nudged off hazards, players off waypoints, then initiative is rolled and sorted (`engine.ts:1689–1710`). `spawnUnit` derives the runtime Unit from class, spawn, roster, gear and spell resources; snapshot restoration has a separate constructor (`engine.ts:841–1048`, `engine.ts:1050–1142`). An immediate end-condition check catches an empty surviving party (`engine.ts:1721–1724`).

## Initiative, rounds and a unit's turn

Opening initiative is `1d20 + initiativeBonus(classId)`; the bonus converts historical delay to `11 - delay`. Highest score acts first, player side wins ties, then IDs break ties (`engine.ts:1143–1158`, `engine.ts:1727–1744`). Neutrals do not take turns (`engine.ts:1143–1147`).

Despite the comment “reset and re-roll”, `startNewRound` does **not** call `rollOpeningInitiative`: it sorts existing initiative again. Preserve actual behavior or request an explicit rules change. It decays volatile enmity, resets movement/action flags, decrements bleeding/Bless and web/ice/aura zone lifetimes, increments round number and clears the active unit (`engine.ts:8386–8427`).

`beginUnitTurn` chooses the side, handles resumed turns, resets the movement budget and applies start-of-turn effects. A dead unit is skipped; stun and sleep consume the turn; fear chooses a reachable destination away from its source and prevents attacking. Web restraint is latched at turn start. Player turns become selected with reach/attack previews; enemy turns invoke AI (`engine.ts:8286–8383`).

Player input changes modes, stages actions and validates before committing. Attack and off-hand targeting are distinct; cancellation/undo are stateful operations (`engine.ts:4967–5172`, `engine.ts:8983–9171`, `engine.ts:9226–9311`). Move spends budget and queues an unpruned reconstructed path; attack queues move first if needed, then combat; off-hand has its own dice and equipment checks (`engine.ts:9173–9221`, `engine.ts:9269–9311`). `wait` marks moved, snaps draw coordinates and commits deselection; `endTurn` explicitly finishes the active player unit (`engine.ts:5133–5143`, `engine.ts:8224–8234`). Action completion and combat completion reconcile remaining queued actions, acted/moved flags, selection and end checks (`engine.ts:3931–3985`).

## Queue, active item and timing contract

`Seq` is a discriminated action union; combat carries bonuses, counter suppression, knockback and skill identity, while spell carries tiles, target IDs, dice, multipliers, poison and center damage (`engine.ts:419–471`). Active combat has lunge/hit/recover/counter/fade stages; active spell retains hit and renderer synchronization state (`engine.ts:497–638`).

`tick` caps dt at 0.05 seconds. Action speed scales fast/normal/slow by 1/0.65/0.4; ambient timers use unscaled dt. Idle callbacks and waypoint checks require both no active item and an empty queue (`engine.ts:2264–2295`). `startSeq` establishes persistent facing, fires cues once, and can return a long-sheet step to the front of the queue behind its wind-up. Reduced motion bypasses wind-up (`engine.ts:2540–2659`). `stepActive` handles banners/delays, movement and dispatch to combat/spell/heal/cure handlers (`engine.ts:2861–2977`).

Movement interpolates draw positions, but commits logical cells only as each step completes; at that point it smashes barricades, applies hazards and invalidates undo if world state changed. Death interrupts movement (`engine.ts:2878–2964`). Replace the projection/camera calls, retain cell commits and side effects.

Spell damage is guarded by the active item's hit state. Default hit time is 0.18 seconds, frost 0.75, arrows `ARROW_TRAVEL`, phantom/fantom their travel constants and ordinary missiles `SPELL_TRAVEL`. Renderer events can replace those clocks (`engine.ts:3306–3417`). Fireball waits for impact/complete events; Caustic Venom has impact/complete fallbacks; Phantasmal Force uses impact/complete events; Magic Missile V2 has 2.5/3.2-second fallbacks; Burning Hands/Poison Breath use release/complete with 0.7/2.5-second fallbacks (`engine.ts:3318–3408`). Bless applies per-ally wave events, or at 0.3 seconds with 1.5-second completion when its renderer is unavailable (`engine.ts:3271–3304`). Finish also waits for retained sheet holds (`engine.ts:3648–3662`).

**Port requirement:** implement these event contracts or provide equivalent authoritative scheduler events. A missing renderer event is a gameplay issue; do not merely remove VFX event consumption. Keep exactly-once hits and queued shot ordering (`engine.ts:3271–3417`, `engine.ts:3430–3449`).

## Movement, body types and the target zone

Odd-r cube conversion, rounding, line/ray, six neighbours, arc/cone geometry and range are rules independent of drawing (`pathfinding.ts:31–336`). Body types are data-owned offset arrays, including types 2–8 and long variants (`data.ts:73–184`).

The footprint anchor is the front-most tile. Explicit offsets authored on even rows shift odd-dy cells one column on odd anchor rows. Size-1, fallback rectangles and generic small footprints follow separate branches (`pathfinding.ts:344–397`). Occupancy and AoE use the full living footprint (`pathfinding.ts:399–429`). **The mover's own explicit body checks only its front row for traversal; other units cannot pass through any part of its target zone, even if allied.** Generic allies can be passed but cannot be stopped on (`pathfinding.ts:431–478`). This distinction prevents large bodies freezing at board edges.

Reach is cost-ordered traversal using maximum footprint terrain cost. Stop pruning is a separate final pass; reconstruct animations from the unpruned reach so parent chains through allies stay intact (`pathfinding.ts:480–537`, `pathfinding.ts:577–586`; `engine.ts:9173–9221`). Water exceptions and troll barricade traversal are retained (`pathfinding.ts:15–19`, `pathfinding.ts:455–463`). Target range/clear shot helpers distinguish full-footprint counters and regular attack origins (`pathfinding.ts:588–666`).

Decoration overlay separates blocked/high/open-shot bits from art. Elevated decoration range is handled by `effectiveMaxRangeAt` (`hexprops.ts:23–39`, `hexprops.ts:49–136`, `hexprops.ts:138–188`). The audited pathfinder accepts terrain and overlay, **not a numeric elevation array** (`pathfinding.ts:431–493`). Engine2's real elevation needs an explicit compatibility design; adding numeric climb limits would be new gameplay, not an existing parameter to copy.

## Attack resolution

`powerOf` contributes floor(ATK/2), or floor(MAG/2) for a caster; physical protection is floor(DEF/2), magic bypasses DEF. Terrain adds defense and projectile cover; high terrain contributes rounded 10% of attacker ATK/MAG. This is a terrain-height flag, not a relative altitude comparison (`combat.ts:28–49`).

Main-hand roll = stat power + weapon dice × mastery damage + weapon bonus + enhancement + terrain attack − protection − terrain defense, clamped/floored, then class-matched weapon multiplier 1.1 and rear multiplier 1.1. Accuracy is `dexAccuracy(mastery.accuracy + rear bonus 10, defender.dex)`; critical probability is 8%, critical damage ×1.5; hit roll follows critical RNG consumption. Custom/off-hand dice follow a separate version without main-hand class bonus/enhancement (`combat.ts:61–107`). Forecast uses averages, not RNG (`combat.ts:110–175`).

Rear means the two adjacent hexes behind the defender's board heading. No separate flank multiplier appears in this resolver; flank is not an additional numeric bonus to invent. Defenders retain heading until the incoming hit, then face for response (`combat.ts:8–20`; `engine.ts:2700–2708`).

The hit stage applies custom/normal rolls, training, spell/weapon modifiers, sleep bonus/wake, auras, elemental resistance, damage, enmity, disease/status side effects, XP and death (`engine.ts:3017–3186`). Recovery tests counter eligibility and can select an off-hand counter; long bow counters have their own release wind-up. `noCounter`, stun/sleep, death and weapon reach affect response (`combat.ts:132–145`; `engine.ts:3188–3249`). Successful counters earn flat 1 XP; ordinary and summon XP/death/loot are separate (`engine.ts:3762–3856`).

## Status effects and resources

Start-of-turn order is lightning echo, poison, occupied ice zones, Second Wind, tile hazard, end evaluation. These can kill before input (`engine.ts:4120–4207`). Bleeding triggers on actions, with move tracking and item-use handling (`engine.ts:4096–4118`). Stun/sleep skip turns; webs can add another 1d4 sleep before existing sleep decrements; fear retreats (`engine.ts:8303–8356`). Sleep is broken by spell damage after bonus damage (`engine.ts:3512–3516`).

Poison uses resistance, tier strengthening and stored caster MAG; life drain heals the living summoner from actual damage (`engine.ts:3531–3569`). Disease infliction/cure persist through player state (`engine.ts:3734–3754`, `engine.ts:3901–3929`). Bless keeps the maximum accuracy bonus and refreshes duration (`engine.ts:8429–8436`). Zone damage multipliers, web restraint, movement budget and rooted encounters are rules (`engine.ts:6296–6374`). Tier/familiar spending has separate paths; do not spend once per projectile when the cast spends once (`engine.ts:5174–5184`, `engine.ts:6276–6289`, `engine.ts:7186–7236`). Round expiration is explicit (`engine.ts:8399–8420`).

## Skill resolution catalogue

Each subsection covers one expanded SpellKind, including all three HealId members (`types.ts:185–238`). **RULES** describes target/area/effect. **CUES** describes retained pose/sound/FX and timing. Common queued spell cues use cast sheets (fallback attack), except Neera bow skills use her alternate attack sheet and Tendril Swipe uses attack; combat skills use attack/counter sheets. Generic audio is class/sprite-dispatched; heal actions use heal sound (`engine.ts:2555–2598`, `engine.ts:10517–10625`, `engine.ts:10720–10747`). Shared default spell timing and event exceptions are specified above, not independently guessed for each skill.

### fireball
RULES: aimed cell, level-scaled range/origin and burst tiles; all alive bodies overlapping the burst are collected, including allies; spell dice/MAG damage. CUES: cast, fireball projectile/burst, impact/complete event synchronization (`engine.ts:9345–9372`, `engine.ts:3335–3352`, `engine.ts:3410–3417`; `data.ts:3903–3952`).

### iceStorm
RULES: aimed area becomes a persistent zone recording caster MAG/level and scaled dice/duration; damage occurs at affected units' own turn start. CUES: cast/ice elemental zone; queued setup plus later tick impacts (`engine.ts:9313–9343`, `engine.ts:4155–4176`).

### frost
RULES: directional line, level-scaled length, overlapping alive targets except caster, allies included; ice spell damage. CUES: cast, frost request, hit 0.75 seconds and minimum end 1.1 seconds (`engine.ts:5198–5204`, `engine.ts:2785`, `engine.ts:3411`, `engine.ts:3649`).

### bless
RULES: living same-side allies within data radius, no aimed cell; accuracy bonus/duration applied individually. CUES: cast/heal sound, Bless wave ally/complete events or fallback clock (`engine.ts:5956–5976`, `engine.ts:3271–3304`, `engine.ts:8429–8436`).

### cureMinor
RULES: valid living friendly target, CURES-specific range/roll, capped healing and healing training. CUES: heal action/cast sheet, heal sound/glow, `stepHeal` timing (`engine.ts:6215–6227`, `engine.ts:6896–6941`, `engine.ts:3664–3698`; `data.ts:3846–3867`).

### cureWounds
RULES: same heal pipeline with its own CURES dice, multiplier and range. CUES: heal action, sheet/sound/glow and `stepHeal` timing (`engine.ts:6215–6227`, `engine.ts:6926–6941`, `engine.ts:3664–3698`; `data.ts:3846–3867`).

### cureLight
RULES: same heal pipeline with its own CURES definition; preserve resource kind. CUES: heal action, sheet/sound/glow and `stepHeal` timing (`engine.ts:6215–6227`, `engine.ts:6926–6941`, `engine.ts:3664–3698`; `data.ts:3846–3867`).

### longShot
RULES: one visible ranged target with shot legality; scaled bonus dice and multiplier. CUES: bow special/arrow sound, arrow FX and arrow travel hit (`engine.ts:7008–7038`, `engine.ts:6735–6740`, `engine.ts:2811–2815`, `engine.ts:3410–3411`).

### bloodyShot
RULES: one ranged target with clear shot, damage multiplier and level-scaled bleeding duration. CUES: same bow arrow pipeline; bleed set at landed impact (`engine.ts:7040–7066`, `engine.ts:6741–6746`, `engine.ts:3613–3619`).

### provoke
RULES: valid target area adds enemy enmity toward warrior; no damage roll. CUES: dedicated provoke FX, sound/UI and action completion within cast method (`engine.ts:5595–5643`, `engine.ts:6800–6803`).

### piercing
RULES: valid axis ray, ordered overlapping enemies, scaled weapon damage. CUES: bow special/arrow sound, ray arrow FX, arrow travel hit (`engine.ts:7068–7086`, `engine.ts:6835–6850`, `engine.ts:2820–2824`).

### lightning
RULES: one target in range, ignore-cover validation, primary dice and stored next-turn echo. CUES: cast, lightning FX, default hit clock (`engine.ts:7126–7153`, `engine.ts:6749–6753`, `engine.ts:2832–2836`, `engine.ts:4122–4138`).

### lightningTier3
RULES: stronger primary/echo payload against one in-range target. CUES: cast, tier-3 lightning FX, default hit and next-turn echo (`engine.ts:7155–7184`, `engine.ts:6754–6758`, `engine.ts:2832–2836`, `engine.ts:4122–4138`).

### magicMissile
RULES: multiple selected/repeated targets validated by missile target rules; familiar or tier resource spent once. Player cast currently queues V2 identity, while AI can queue original identity. CUES: original missile uses fallback projectile/`SPELL_TRAVEL` (`engine.ts:6416–6431`, `engine.ts:7186–7236`, `engine.ts:8590–8615`, `engine.ts:2786–2789`, `engine.ts:3411`).

### magicMissileV2
RULES: player missile resolution uses one queued shot per chosen target and independent damage. CUES: cast, V2 shot requests, per-shot impact/complete with 2.5/3.2-second fallbacks (`engine.ts:7186–7236`, `engine.ts:3385–3408`).

### causticVenom
RULES: aimed burst with center-specific damage and poison; overlapping bodies collected. CUES: cast, poison projectile/impact/burst, event sync with fallback; plant uses its alternate burst route (`engine.ts:9374–9409`, `engine.ts:3353–3369`, `engine.ts:3531–3539`, `engine.ts:3629`).

### divineBolt
RULES: aimed divine burst with separate center and surrounding damage payload. CUES: cast, central and splash lightning FX, default hit clock (`engine.ts:9411–9444`, `engine.ts:2825–2831`, `engine.ts:3455–3456`).

### minorVenom
RULES: radius venom around origin, damage/lesser poison; AI may move then queue the same payload. CUES: cast, minor venom missile and caustic burst, `SPELL_TRAVEL` (`engine.ts:9446–9521`, `engine.ts:2806–2810`, `engine.ts:3628`).

### doubleStrike
RULES: adjacent hostile target, two combat items with bonus dice; only first suppresses counter. CUES: two attack sequences/melee cues and combat hit-stage timing (`engine.ts:7279–7299`, `engine.ts:3113–3119`, `engine.ts:3017–3186`).

### cleave
RULES: directed adjacent arc; weapon damage/bonus and increased damage against qualifying large targets. CUES: attack-style skill, melee cue and arc VFX request/default hit (`engine.ts:7575–7612`, `engine.ts:3310–3313`, `engine.ts:3511`, `engine.ts:3632–3635`).

### cureDisease
RULES: valid diseased friendly target, separate cure action and persistent disease cleanup. CUES: heal sound, cure glow/effect and `stepCureDisease` clock (`engine.ts:6253–6264`, `engine.ts:6907–6914`, `engine.ts:6943–6958`, `engine.ts:3700–3732`).

### piercingThrust
RULES: axis thrust through ordered targets; DEF reduced 20% for each hit, later landed bodies take half damage; miss does not advance falloff. CUES: melee/attack sheet, line blade FX/default hit (`engine.ts:7088–7107`, `engine.ts:6852–6861`, `engine.ts:3461–3477`, `engine.ts:3637–3640`).

### sweep
RULES: self-centered adjacent sweep, hostile overlapping bodies and knockback. CUES: attack/melee cue, ring/Varredura request/default hit (`engine.ts:5738–5760`, `engine.ts:3314–3317`, `engine.ts:3620`, `engine.ts:3636`).

### trip
RULES: adjacent hostile target, combat bonus and trip status on landed strike. CUES: attack/melee cue, combat timing with knockdown-side effects (`engine.ts:7301–7329`, `engine.ts:3108–3112`, `engine.ts:3138–3153`).

### summonFamiliar
RULES: valid free/passable summon location, range and one-out checks, tier-1 class and charge creation; summon enters runtime units. CUES: portal/fade, summoning cast method's immediate mutation, not damage impact (`engine.ts:5780–5802`, `engine.ts:6775–6791`, `engine.ts:7400–7529`).

### phantasmalForce
RULES: valid hostile single target, level-scaled dice, own resource. CUES: cast, phantasmal impact/complete event pipeline or fallback projectile/travel (`engine.ts:7363–7398`, `engine.ts:6770–6774`, `engine.ts:2795–2799`, `engine.ts:3370–3384`).

### fantomForce
RULES: AI-specific single-target spell payload with FANTOM_FORCE damage multiplier. CUES: cast, fantom projectile and its travel constant (`engine.ts:8556–8583`, `engine.ts:2790–2794`, `engine.ts:3411`, `engine.ts:3509`).

### summonFamiliar2
RULES: tier-2 summon variant through shared summon method, range/free-cell checks and charge/class selection. CUES: summon portal/fade, direct cast mutation (`engine.ts:5821–5841`, `engine.ts:6775–6791`, `engine.ts:7400–7529`).

### summonFamiliar3
RULES: tier-3 body validates its explicit footprint; shared method supplies class/resources. CUES: body-aware portal/fade, direct cast mutation (`engine.ts:5843–5858`, `engine.ts:6782–6791`, `engine.ts:7400–7529`).

### summonFamiliar4
RULES: tier-4 variant with own range/availability and shared unit creation. CUES: portal/fade, direct cast mutation (`engine.ts:5860–5875`, `engine.ts:6775–6791`, `engine.ts:7400–7529`).

### summonZombieDog
RULES: tier-5 zombie dog, explicit body placement validation and own summon class/resources. CUES: summon portal/fade, direct cast mutation (`engine.ts:5877–5892`, `engine.ts:6782–6791`, `engine.ts:7400–7529`).

### lifeDrain
RULES: hostile single target; familiar charges, scaled damage, living summoner healed from real damage dealt. CUES: cast/default spell clock, summoner heal particle/glow (`engine.ts:7331–7361`, `engine.ts:3541–3569`).

### webOfDreams
RULES: aimed area creates persistent web/sleep zone, initial sleep checks and later restraint/sleep. CUES: web shot/zone, special sound handling; direct zone creation then queued spell (`engine.ts:7531–7573`, `engine.ts:2565`, `engine.ts:6296–6313`, `engine.ts:8312–8330`).

### multiShot
RULES: selected targets can repeat; one queued arrow spell per shot with scaled target count/power. CUES: Neera bow special/arrow audio, per-target arrow FX/travel (`engine.ts:5906–5916`, `engine.ts:7238–7277`, `engine.ts:2816–2819`).

### secondWind
RULES: passive paladin self-heal when its turn opens badly wounded; spends tier-3 use, scales with DEX and clamps to missing HP. CUES: heal sound/text; immediate during start-of-turn, never armed (`engine.ts:4178–4204`, `engine.ts:6205–6206`).

### auraOfProtection
RULES: immediate self-centered same-side damage-reduction zone, duration and tier spend. CUES: UI sound/banner; no aimed cast/impact (`engine.ts:5919–5936`, `engine.ts:6315–6352`).

### divineWrath
RULES: aimed axis-defined area with scaled divine payload; validates wrath ray. CUES: cast/default impact and elemental effect (`engine.ts:7614–7650`, `engine.ts:6828–6833`, `engine.ts:3630–3631`).

### shoulderSmash
RULES: directed cleave-like arc, weapon bonus and knockback; mounted restrictions at start. CUES: melee sheet/cue, warm arc/default hit (`engine.ts:6030–6046`, `engine.ts:7652–7691`, `engine.ts:3621–3625`, `engine.ts:3632–3635`).

### intimidatingPresence
RULES: immediate self-centered enemy damage-amplification zone. CUES: shock ring, UI sound/banner; no target/impact wait (`engine.ts:5938–5953`, `engine.ts:6315–6352`).

### stampede
RULES: directional ray validation, area/targets and scaled weapon damage payload. CUES: melee sheet/cue, line FX/default hit (`engine.ts:7693–7730`, `engine.ts:6820`, `engine.ts:3637–3640`).

### shock
RULES: one hostile in-range target, ignores cover, small lightning primary/echo. CUES: cast/lightning/default hit; echo at next turn (`engine.ts:7109–7124`, `engine.ts:6759–6763`, `engine.ts:2832–2836`, `engine.ts:4122–4138`).

### bullRush
RULES: axis charge with terrain/body legality, chained movement and combat, enemy push route; miss cancels remaining charge combat/movement. CUES: rush trail/charge movement; combat timing, calf alternate attack sheet (`engine.ts:5437–5593`, `engine.ts:3042–3050`, `engine.ts:3159–3180`, `engine.ts:10572–10586`).

### executionerStrike
RULES: hostile melee target, bonus dice and special landed-hit damage branch. CUES: attack/melee cue, combat hit stage/effect (`engine.ts:5645–5676`, `engine.ts:3061–3078`, `engine.ts:3126–3137`).

### shieldBash
RULES: hostile melee target, bonus/stun combat path; weapon-skill bypass for authored shield bash, equipment off-hand path also exists. CUES: attack sheet, shieldBash sound at strike and shock ring (`engine.ts:5678–5711`, `engine.ts:3024–3034`, `engine.ts:3154–3158`, `engine.ts:9291–9311`).

### poisonBreath
RULES: directional cone using level-scaled range/radius/dice and poison flag; enemies and AI plant route share effect pipeline. CUES: cast, poison cone request release/complete or caustic fallback burst (`engine.ts:7732–7767`, `engine.ts:6810–6812`, `engine.ts:3318–3333`, `engine.ts:3627`, `engine.ts:9630–9672`).

### tendrilSwipe
RULES: AI-only attack area touches plant Type-7 front/flanks, excluding behind head; weapon-roll spell against selected foes. CUES: plant attack sheet/audio, default hit (`engine.ts:9523–9567`, `engine.ts:2563`, `engine.ts:10550`, `engine.ts:3478–3489`).

### burningHands
RULES: aimed directional cone with scaled radius/range/dice, same area builder as poison breath. CUES: cast/fire cone request release/complete, elemental fallback (`engine.ts:7732–7767`, `engine.ts:6810–6812`, `engine.ts:3318–3333`, `engine.ts:3630–3631`).

### turnUndead
RULES: self-area, damage only to undead; survivors gain fear source and duration. CUES: cast, Turn Undead V4/turnUndeadFx at hit, default impact (`engine.ts:5205–5237`, `engine.ts:3417`, `engine.ts:3433`, `engine.ts:3522–3525`).

### createFoodAndWater
RULES: immediate nearby friendly feeding, fullness reset, gear/stat recalculation, generated rations added to loot pool; rejects no eligible targets. CUES: food holy FX, heal sound/banner; no impact queue (`engine.ts:5979–6013`).

## AI decision making

AI first waits if fog awareness has not awakened it, smashes barricades, computes legal stopping reach and independent unpruned walking reach. Enmity focus restricts candidate players; otherwise alive players are candidates (`engine.ts:8478–8505`). Enmity stores cumulative/volatile entries with clamping, serializes separately and decays volatile values per round (`enmity.ts:9–69`; `engine.ts:1516–1563`, `engine.ts:8388–8391`).

Class-specific spell branches precede general weapon behavior, including calf Bull Rush, caster/familiar/monster spells, plant helpers and brigand ranged skills (`engine.ts:8507–8913`, `engine.ts:9487–9672`). General attack scoring is `(maxHp-hp)*3 + terrain.def*2 + (hp<=8 ? 20 : 0)` over reachable attack positions; selected movement is queued before combat (`engine.ts:8915–8930`). If no attack exists, cached terrain-distance fields select a player and reachable cell closing real path distance around walls, not straight hex distance (`engine.ts:8936–8961`; `pathfinding.ts:540–575`).

## Victory, defeat, exits and persistence

End evaluation collects pickups and detects exits. Explore missions expose exits without normal win/defeat checks. Ordinary defeat requires no alive non-summoned player; boss objective tests alive enemy boss classes; rout tests any alive enemy; escape requires an exit. Victory enables finishing rather than ending immediately, allowing looting and reverting if enemies appear (`engine.ts:4792–4818`). Exit footprint/eligible player checks and `confirmFinish` are separate; escape markers can fail an escape attempt while dungeon connectors finish directly (`engine.ts:4822–4874`). Ordinary flee eligibility/chance/action loss are separate (`engine.ts:8240–8284`).

Campaign-facing HP, hunger, bags, spent tiers, loot and snapshots must survive renderer replacement. Capture/apply snapshot retain battle state, while derived occupancy/visibility and presentation caches require reconciliation (`engine.ts:1948–2031`, `engine.ts:2033–2263`). Death handling centralizes alive-state, drops and summon ownership/XP, so use `markDead` from every damage route (`engine.ts:3762–3856`).

## Functions that can be lifted almost unchanged

| Source | Functions/data | Port notes |
|---|---|---|
| `pathfinding.ts:5–336` | key, inBounds, tileAt, oddrToCube, cubeToOddr, cubeRound, hexLine, clearShot, shotBlocker, shotKind, hexDist, manhattan, cubeAdd, axisDir, hexRay, allAxisRays, piercingLine, hexNeighbors, cleaveHexes, axisWalk, coneWedge, coneSector | Pure grid geometry/terrain rules; keep odd-r layout. |
| `pathfinding.ts:344–537` | unitSize, footprintFrontRow, footprint, occupies, occupancy, unitAt, minRangeTo, inRangeOf, footprintCost, computeReachable | Preserve front-row mover/full-body target distinction; input Unit/data dependencies. |
| `pathfinding.ts:540–685` | terrainDistanceField, reconstructPath, attackCellsFrom, inWeaponRange, canHitFrom, attackableEnemies, computeThreat | Terrain/occupancy logic; no screen renderer. |
| `hexprops.ts:49–188` | buildDecorOverlay, hexDef, effectiveMaxRangeAt, hexProps | Replace art only; retain decoration-derived gameplay flags. |
| `enmity.ts:32–69` | enmityTotal, addToEntry, enmityToSnapshot, enmityFromSnapshot | Pure threat state and persistence. |
| `combat.ts:8–185` | isRearAttack, powerOf, protOf, rollDamage, rollDamageCustom, previewDamage, canCounter, makeForecast, mulberry32 | Rules; retain supporting dexterity/weapon/data dependencies and RNG consumption order. |
| `data.ts:73–184`, `data.ts:3846–3952`, `data.ts:4727–4840` | body offsets, cure/skill definitions and power/formula helpers | Copy data faithfully with referenced helpers; frost is imported from `frost.ts` (`engine.ts:3`). |
| `engine.ts:1143–1158`, `engine.ts:1729–1744` | takesTurns, initiativeBonus, rollOpeningInitiative, sortByInitiative | Small deterministic rules; remove class encapsulation only as needed. |

The large engine methods are **not** drop-in pure modules: `spawnUnit`, action commits, `stepCombat`, `stepSpell`, status handlers, AI, victory and snapshots need their state/data dependencies extracted and presentation calls converted to events (`engine.ts:841–1142`, `engine.ts:2540–3755`, `engine.ts:3931–4207`, `engine.ts:4792–4874`, `engine.ts:8478–8961`).

## Integration issues to resolve in the port

1. Keep heading in board coordinates; derive billboard facing from it. Camera rotation must not alter rear-attack rules (`combat.ts:8–20`; `engine.ts:2514–2538`).
2. Keep original native sprite frames and pose clocks; replace pixel anchors/scales with world anchors without rewriting action duration (`engine.ts:10303–10365`, `engine.ts:10464–11067`).
3. Decide the numerical height-to-gameplay adapter explicitly: Ember's pathfinder uses terrain flags/overlay rather than numeric climb levels (`pathfinding.ts:431–493`; `hexprops.ts:138–188`).
4. Define renderer impact/complete contracts and authoritative timeouts, especially Fireball, Phantasmal Force and Bless paths that consume events (`engine.ts:3271–3417`).
5. Preserve actual initiative reuse across rounds unless the design intentionally changes it (`engine.ts:8386–8427`).
6. Preserve neutral awakening, fog targetability and exits as rules, even when their markers become 3D props (`engine.ts:4765–4777`, `engine.ts:6376–6414`, `engine.ts:4792–4874`).

