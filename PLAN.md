# Engine2 — Diorama Engine Plan

**Status: pre-planning. No engine code until this plan is agreed.**

## Decided

1. **Foundation:** a powerful, clean engine built for diorama. It's our own engine. Three.js (its WebGPU renderer) is only the drawing layer, not an engine, and we can replace any part of it with our own code whenever we need to.
2. **Clean reboot:** new folder `C:\Engine2`. It reuses code from Ember (`C:\emberashes03D-main`), and Ember stays untouched.
3. **Performance rules from day one:**
   - Everything is drawn directly on the GPU, with no 2D canvas copied into the GPU every frame.
   - Repeated things (tiles, trees, rocks) are batched into a few draw calls.
   - One designed shadow setup and one designed post-processing chain, not layers stacked over time.
   - **Sprites are the game's selling point: always full native resolution, never downscaled to save space.** Memory is saved only losslessly (trimming empty transparent margins, loading poses on demand). Sprites keep their painted look: no scene re-shading, color-preserving tone mapping, soft blended edges, anti-aliased rendering.
   - **No graphics budget (decided 2026-10-09):** visual quality is never lowered to fit a GPU; the user upgrades
     hardware if needed. The AMD RX 6400 (4 GB) is no longer the target. When something is slow, the fix is
     optimizing the engine, never nerfing the graphics.
   - **No waste.** Simple graphics and basic animations must never slow the game down. No heavy, clunky design hidden behind simple visuals, which is the main reason for starting Engine 2 fresh.
4. **Ember's 2D effects are kept** and placed inside the 3D world as cards or particles drawn on the GPU. They can give off real light, and depth sorts them correctly.
5. **Elevation:** real height per hex, terraced like Minecraft, with visible steps.
6. **Windows `.exe`:** only in the distant future, once there's a demo with no test mode. Not part of the foundation.
7. **Reference:** the hex diorama prototype in `C:\Engine2\index.html`.

## What carries over from Ember, and what doesn't

- **Preserve faithfully:** the engine and systems (rules, combat, pathfinding, AI, campaign), the **spells and skills**, and the **sprites** (heroes, summons, monsters, with their sizes and timings). This is the work that matters.
- **Placeholders, free to redesign:** Ember's ground, tiles, terrain art and decorations were test placeholders, none of them satisfying. Engine2 designs the world from scratch in the prototype's style (`C:\Engine2\index.html`). Most maps can be remade; their spawns, objectives and layout intent are reused, their ground is not.

## Art direction for the world: photorealistic, with a Bloodborne edge

- **Photorealistic**, not the prototype's bright storybook colours. The prototype (`index.html`) is a reference for
  *techniques* only (seamless ground, natural terraces, real lights, diorama finish), not for style.
- **Bloodborne mood:** Victorian-gothic stone and wrought iron, old timber, grime, moss, wet and weathered surfaces,
  decay. Muted, desaturated palette; cold moonlit blues and greys against warm lantern and torch light; fog and deep
  shadows. Dark, but always readable for tactics.
- **Real surface detail:** physically based materials (colour, normal/bump, roughness), not flat painted colours.
- It must sit naturally with Ember's photoreal sprites — they are the reference for how real the world should feel.
- **Photoreal 2D is the medium, not 3D modelling.** 3D props always came out generic; photoreal 2D art reaches
  realism no game has. So:
  - **Props and decor are photoreal 2D art** made with the sprite pipeline (AI image + cut-out), standing in the 3D
    world as upright cards like the heroes: lit by the world, real shadows, full native resolution.
  - **3D hybrid (decided 2026-10-09):** houses and buildings become real 3D models, made with Meshy for high quality;
    the more detailed objects stay 2D diorama cards. Current house cards are placeholders.
  - **The ground surface is photoreal 2D texture art** on the 3D terrain; elevation stays real.
  - **3D is used only where it isn't seen as 3D:** terrain shape, heights, light, fog, shadows, collision.
  - **Camera (decided, for now):** the **campaign is locked** to the approved default view below: zoom and pan
    only, no turning or tilting. The **editor is free**: a full 360° in every direction (turn, and tilt over the top
    and under the ground) to test which angles work best, with an angle readout and a **Câmera normal** button that
    returns to the default view. Both modes live in `src/render/cameraRig.ts` (`mode: 'locked' | 'free'`).
  - **Approved default view:** turned 30°, tilted 20° (low diorama angle) — "camera 1 = perfection"
    (`shots/camera/limit-left-low.png`). Every map opens there. Steep top-down views are "an example of what not
    to do with the game" (`shots/camera/limit-right-high.png`, 55°).

## The vision

**Triangle Strategy, with Ember's sprites and a photorealistic look, on a hex board.** Same editor, same rules, a clean engine, 3D tiles, proper elevation.

- **Terrain and movement grid are separate.** The board, map and editor don't need to be hexed. Terrain is authored however is easiest to edit by hand (e.g. a simple square grid: paint terrain type, raise and lower ground), and roads, bridges and cliffs follow the terrain, not hexes. The movement grid stays hex regardless of what the terrain looks like: each hex reads its height and terrain type from the terrain under its centre, using square-to-hex math like Ember's existing editor converter. *(Look at Ember's converter when we get there.)*

8. **Same rules:** Ember's game code carries over: combat, pathfinding, units/classes/spells, campaign, UI, sound, saves. Rebuilt: everything that draws the world.
9. **Map format:** Ember's map format, plus real elevation per hex. Ember's tactical maps already store elevation in their data; the 2D view just never showed it properly. In the new engine that same data becomes real 3D height, so every existing map gets its elevation with nothing to redo.
10. **3D tiles:** each terrain type is a real 3D hex tile with photorealistic materials. Ember's old terrain art is not reused.
11. **Decorations:** real 3D props (houses, rocks, trees, ruins) in the same photorealistic style. Ember's old decoration art is not reused.
12. **Characters:** Ember's sprites stand upright in the 3D world, facing the camera, casting real shadows. All humans are the same size by default.
13. **Elevation in gameplay:** Ember's existing rules (including high ground), fed by real height. Height limits where units can climb, as in Triangle Strategy. *(Exact numbers to confirm against Ember's rules.)*
14. **Camera:** tilted tactical view. It zooms, pans to every corner and follows the action. Campaign: locked to the default view. Editor: free 360° for testing angles (see Art direction).
15. **Editor:** the same editor and workflow you know, shown in 3D, with tools to raise and lower terrain.

## Lessons from Ember's tactical camera — never repeat

Seen in Ember's live game (`C:\Engine2\shots\ember-tactical\`) and in the Oct 2 history:

- **Never tilt or rotate a 2D painting.** Ember's background (barrels, chest, rocks, brazier) is one painting lying on the floor; tilting it doubles the perspective, and rotating spins props like stickers. In the new engine, everything you see is either real 3D or an upright card.
- **One world scale for everything.** Hexes, characters, props and effects are measured in the same units. No painted chest twice the size of a hex.
- **Real elevation geometry.** No flat floor with grey slabs pushed up around it.
- **The engine is 3D from day one, with no "tactical mode" on top of 2D.** There is one camera. Text, health bars, ranges, fog and cursors are designed for it from the start, so nothing has to be patched one by one.
- **A real diorama camera range.** It can go low and diorama-like (down to 20°), and can reach every corner of the board. *(Campaign is locked to the default view; the editor spins freely for testing — see Art direction.)*
- **Seamless or not acceptable.** The ground is one natural-looking environment: no tile edges, no grid lines, no per-hex shade differences. The hex board stays underneath as the logic: every hex is still an individual tile you edit (height and terrain type), but the ground renders as one continuous terrain whose terraces and cliffs wander naturally around the hex layout. Terrain types blend softly into each other. The hex grid only appears when it's needed: the cursor, movement and attack ranges, or a toggle. *(Proven in the prototype, `C:\Engine2\shots\v4-*.png`.)*
- **Terrain edges are the player's choice: Options → Terrain edges: Smooth / Hard.** Smooth means natural cliffs and shorelines that wander around the hex layout. Hard means every height step is a crisp hex cliff while same-level ground still flows seamlessly. Both use the same map data, and gameplay is identical. The setting applies when a map loads (not mid-battle), so only one version of the ground is ever in memory. *(Prototype looks 1 and 2, `C:\Engine2\shots\modes-1-*.png` / `modes-2-*.png`.)*
- **Rejected: visible tile seams** (each hex as a separate beveled piece with an outline, prototype look 3). Hex shape may show in height steps, never as lines around tiles.
- **The editor and the game use the same renderer.** No separate preview that breaks when the game changes.

## Proposed order of work (each step approved before the next)

1. **3D board:** load an Ember map and show it as 3D hex tiles with real elevation, lighting and shadows, plus the camera.
2. **Characters in the world:** Ember's sprites standing on the board, animated, same sizes.
3. **Rules connected:** Ember's battle code drives the 3D board, so a battle can be played start to finish.
4. **Editor in 3D:** same editor and workflow, plus raising and lowering terrain.
5. **2D effects in the world:** Ember's spell and impact effects inside the 3D scene, giving off real light.
6. **Photorealistic tiles and props:** final materials and 3D props replace the placeholders.
7. **Diorama finish:** tilt-shift, bloom, color grade, day/night.
