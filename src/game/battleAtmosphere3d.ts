// Ember's battle atmosphere on the 3D map: fog of war (engine sight → Engine2's FogOfWar over
// the terrain + dimmed decorations) and the world-space Névoas ("Tipo de névoa": Névoa 2/3/4, 01, 5, plus
// the wisps) from Ember's own ThreeAtmosphere, unchanged. The screen-space Vinhetas are
// BattleVignettes.tsx.
//
// ThreeAtmosphere builds in Ember's renderer space: x = board pixels, y = -board pixels (down
// is negative), z = height toward its overhead camera. One parent transform maps that onto
// Engine2's world (1 unit = one hex radius, y up), lying just above the ground. Like Ember, the
// mist draws by order, not depth: over the ground, under the unit and decoration cards
// (CARD_RENDER_ORDER), so a flat sheet never slices a card in two.

import * as THREE from "three";
import type { BattleEngine } from "./engine";
import type { Unit } from "./types";
import type { DioramaView } from "../editor/ember/dioramaView";
import { ThreeAtmosphere } from "./gfx/three/ThreeAtmosphere";
import { getDevGfx } from "./gfx/three/devGfx";
import { footprint, hexNeighbors } from "./pathfinding";
import { FogOfWar, FOG_EXPLORED, FOG_UNSEEN, FOG_VISIBLE } from "../render/fogOfWar";
import { EXPLORED_ALPHA } from "./gfx/three/ThreeFogMask";
import { hexAt } from "../core/hex";

type Any = Record<string, any>;

/** Height of Ember's mist plane above the board's average ground: low ground mist, shin-deep. */
const MIST_LIFT = 0.3;

export class BattleAtmosphere3D {
  private readonly fog = new FogOfWar();
  private readonly atmosphere = new ThreeAtmosphere();
  private readonly mistRoot = new THREE.Group();
  private placed = false;
  private shadeKey = "";

  constructor(private readonly view: DioramaView, private readonly engine: BattleEngine) {
    view.stage.scene.add(this.fog.group);
    this.mistRoot.rotation.x = -Math.PI / 2; // Ember (x, y, z) → Engine2 (x, z, -y)
    this.mistRoot.add(this.atmosphere.group);
    view.stage.scene.add(this.mistRoot);
  }

  /** Ember board pixel → Engine2 world, from hex (0, 0)'s anchor in both. */
  private origin(): { a0x: number; a0y: number; tile: number; ox: number; oz: number } | null {
    const L = this.view.board?.layout;
    if (!L) return null;
    const a0 = (this.engine as unknown as Any).effectAnchor(0, 0) as { worldX: number; worldY: number; tile: number };
    return { a0x: a0.worldX, a0y: a0.worldY, tile: a0.tile, ox: L.ox, oz: L.oz };
  }

  sync(dt: number): void {
    const board = this.view.board, o = this.origin();
    if (!board || !o) return;
    const engine = this.engine;
    this.syncFog();

    if (!this.placed) {
      this.placed = true;
      const groundY = board.cells.reduce((s, c) => s + c.groundY, 0) / board.cells.length;
      const s = 1 / o.tile;
      this.mistRoot.scale.setScalar(s);
      this.mistRoot.position.set(-o.a0x * s - o.ox, groundY + MIST_LIFT, -o.a0y * s - o.oz);
    }
    // Ember sized each sheet to its screen; the 3D camera can see the whole board and far past
    // it, so the sheets reach well beyond the board (their edge never shows on the backdrop).
    const pad = o.tile * 60;
    const w = o.tile * Math.sqrt(3) * (engine.cols + 0.5) + 2 * pad;
    const h = o.tile * (1.5 * engine.rows + 4.4) + 2 * pad;
    // Ember hexWorld units (y down, board-relative) → that hex's index, for Névoa 01/5's masks
    const cellAt = (x: number, y: number): number => {
      const [c, r] = hexAt(board.layout, x - o.a0x / o.tile - o.ox, y - o.a0y / o.tile - o.oz);
      return c < 0 || r < 0 || c >= engine.cols || r >= engine.rows ? -1 : r * engine.cols + c;
    };
    const feet = (engine.units as Unit[]).filter(u => u.alive && !engine.unitHidden(u)).map(u => {
      const a = (engine as unknown as Any).unitAnchor(u) as { worldX: number; worldY: number };
      return { x: a.worldX, y: -a.worldY, halfW: o.tile * 0.3, band: o.tile * 0.3 };
    });
    this.atmosphere.sync(engine, o.tile, dt, this.view.stage.sun, this.view.stage.hemi,
      { cssW: w, cssH: h, camX: -pad, camY: -pad }, cellAt, feet, getDevGfx().atmosphericFx);
    // Névoa 5 alone depth-tested against Ember's per-unit depth cut-outs, which the 3D map does
    // not have: there it sliced every card in two. It draws by order like the other mists.
    const fog5 = (this.atmosphere as unknown as Any).fog5?.group as THREE.Group | undefined;
    fog5?.traverse(obj => {
      const mesh = obj as THREE.Mesh, m = mesh.material as THREE.Material | undefined;
      if (m && m.depthTest) { m.depthTest = false; m.needsUpdate = true; mesh.renderOrder = 1.8; }
    });
  }

  /** Ember's ThreeBattleRenderer.syncFog: the same states and the same "always clear within one
   * hex of the party" rule, rebuilt only when sight changes or the party moves. */
  private syncFog(): void {
    const engine = this.engine, board = this.view.board!;
    if (!engine.fogged) {
      this.fog.hide();
      if (this.shadeKey !== "off") { this.shadeKey = "off"; this.view.decor.shade(null); }
      return;
    }
    const cols = engine.cols;
    const clear = new Set<number>();
    const party = (engine.units as Unit[]).filter(u => u.side === "player" && u.alive);
    for (const u of party) for (const p of footprint(u)) for (const n of [p, ...hexNeighbors(p.x, p.y)]) {
      if (n.x >= 0 && n.y >= 0 && n.x < cols && n.y < engine.rows) clear.add(n.y * cols + n.x);
    }
    const state = (x: number, y: number) => clear.has(y * cols + x) || engine.visible(x, y) ? FOG_VISIBLE : engine.explored(x, y) ? FOG_EXPLORED : FOG_UNSEEN;
    const key = `${engine.mission.id}:${engine.visVersion}:${party.map(u => `${u.x},${u.y}`).join("|")}`;
    this.fog.update(key, board, this.view.surfaces, state);
    // decorations load in after the board, so their count is part of when to re-shade them
    const shadeKey = `${key}:${this.view.decor.count}`;
    if (shadeKey === this.shadeKey) return;
    this.shadeKey = shadeKey;
    this.view.decor.shade((x, y) => {
      if (x < 0 || y < 0 || x >= cols || y >= engine.rows) return 1;
      const s = state(x, y);
      return s === FOG_VISIBLE ? 0 : s === FOG_EXPLORED ? EXPLORED_ALPHA : 1;
    });
  }

  dispose(): void {
    this.view.stage.scene.remove(this.fog.group, this.mistRoot);
    this.fog.dispose();
    this.atmosphere.dispose();
  }
}
