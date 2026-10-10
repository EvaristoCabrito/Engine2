// Original Ember's canvas spell art (lightning, healing, Turn Undead, Provoke, portals,
// status effects) and Frost/Blizzard WebGL pass, projected onto Engine2's battle camera.
import * as THREE from "three";
import type { BattleEngine } from "./engine";
import type { DioramaView } from "../editor/ember/dioramaView";
import { WebGL2DRenderer } from "./gfx/WebGL2DRenderer";
import { EffectsRenderer } from "../vfx/legacy/two-d/EffectsRenderer";

export class BattleSpellOverlay3D {
  private readonly legacy: WebGL2DRenderer;
  private readonly effects: EffectsRenderer;
  private readonly blizzards = new Map<number, number>();
  private webShot: number | null = null;
  private readonly pulses = Array.from({ length: 4 }, () => ({ age: 1, light: new THREE.PointLight(0xb6e7ff, 0, 3.2, 1.8) }));
  constructor(private readonly artCanvas: HTMLCanvasElement, private readonly fxCanvas: HTMLCanvasElement, private readonly view: DioramaView, private readonly engine: BattleEngine) {
    this.legacy = new WebGL2DRenderer(artCanvas, true);
    this.effects = new EffectsRenderer(fxCanvas, true);
    for (const pulse of this.pulses) view.stage.scene.add(pulse.light);
  }
  private pulse(cell: { x: number; y: number }, dx: number, dy: number, strength: number): void {
    const pulse = this.pulses.reduce((old, p) => p.age > old.age ? p : old);
    const point = this.view.board!.cell(cell.x, cell.y);
    pulse.light.position.set(point.x + dx, this.view.groundAt(point.x, point.z) + 0.5, point.z + dy);
    pulse.light.intensity = 0.012 * strength; pulse.age = 0;
  }
  private projected(x: number, y: number): THREE.Vector3 {
    const a = this.engine.effectAnchor(0, 0), p = this.view.board!.cell(0, 0);
    const wx = p.x + (x - a.x) / a.tile, wz = p.z + (y - a.y) / a.tile;
    return new THREE.Vector3(wx, this.view.groundAt(wx, wz) + 0.05, wz).project(this.view.stage.camera);
  }
  /** Canvas → world for one bolt: Ember's path (caster to target hex, lifted 0.3 tile) is laid
   * between the two units' chests, its sideways axis turned to face the camera, 1 tile = 1 hex. */
  private boltSheet(m: { fromX: number; fromY: number; toX: number; toY: number }, tile: number): THREE.Matrix4 {
    const camera = this.view.stage.camera;
    const f = this.engine.effectAnchor(m.fromX, m.fromY), t = this.engine.effectAnchor(m.toX, m.toY);
    const chest = (x: number, y: number) => { const c = this.view.board!.cell(x, y); return new THREE.Vector3(c.x, this.view.groundAt(c.x, c.z) + 0.9, c.z); };
    const A = chest(m.fromX, m.fromY), B = chest(m.toX, m.toY);
    const fx = f.x, fy = f.y - tile * 0.3;
    let dx = t.x - f.x, dy = t.y - f.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) { dx = tile; dy = 0; B.copy(A).add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)); }
    const n = Math.hypot(dx, dy), nx = -dy / n, ny = dx / n;
    const D = B.clone().sub(A), dir = D.clone().normalize();
    const view = camera.position.clone().sub(A.clone().add(B).multiplyScalar(0.5));
    view.addScaledVector(dir, -view.dot(dir));
    const w = new THREE.Vector3().crossVectors(view, dir).normalize();
    // keep Ember's handedness on screen (canvas y points down), so the art is never mirrored
    const a = A.clone().project(camera), b = B.clone().project(camera), s = A.clone().add(w).project(camera);
    if ((b.x - a.x) * -(s.y - a.y) - -(b.y - a.y) * (s.x - a.x) < 0) w.negate();
    w.divideScalar(tile);
    const det = dx * ny - nx * dy;
    const Lx = D.clone().multiplyScalar(ny).addScaledVector(w, -dy).divideScalar(det);
    const Ly = D.clone().multiplyScalar(-nx).addScaledVector(w, dx).divideScalar(det);
    const O = A.clone().addScaledVector(Lx, -fx).addScaledVector(Ly, -fy);
    const N = new THREE.Vector3().crossVectors(Lx, Ly).normalize();
    return new THREE.Matrix4().set(Lx.x, Ly.x, N.x, O.x, Lx.y, Ly.y, N.y, O.y, Lx.z, Ly.z, N.z, O.z, 0, 0, 0, 1);
  }
  /** Canvas → world for an effect on one hex: a sheet facing the camera, standing on the hex's
   * ground (or water) with the hex centre at its foot, canvas up = camera up, 1 tile = 1 hex.
   * `footPx`: Ember drew a unit's feet that far below its hex centre (UnitVisual.footY); effects
   * aimed at a unit's body put that point on the ground, where the 3D card's feet are. */
  private standingSheet(cell: { x: number; y: number }, tile: number, footPx = 0): THREE.Matrix4 {
    const camera = this.view.stage.camera, at = this.engine.effectAnchor(cell.x, cell.y), c = this.view.board!.cell(cell.x, cell.y);
    const G = new THREE.Vector3(c.x, (c.water ? c.waterY : this.view.groundAt(c.x, c.z)) + 0.05, c.z);
    const R = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).divideScalar(tile);
    const D = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).divideScalar(-tile);
    const N = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
    const O = G.clone().addScaledVector(R, -at.x).addScaledVector(D, -(at.y + footPx));
    return new THREE.Matrix4().set(R.x, D.x, N.x, O.x, R.y, D.y, N.y, O.y, R.z, D.z, N.z, O.z, 0, 0, 0, 1);
  }
  sync(dt: number): void {
    if (!this.view.board) return;
    for (const pulse of this.pulses) { pulse.age += dt; pulse.light.intensity *= Math.exp(-dt * 6); if (pulse.age > 1) pulse.light.intensity = 0; }
    const width = this.artCanvas.clientWidth, height = this.artCanvas.clientHeight, dpr = devicePixelRatio || 1;
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    if (this.artCanvas.width !== w || this.artCanvas.height !== h) { this.artCanvas.width = w; this.artCanvas.height = h; this.legacy.setSize(w, h); }
    this.effects.resize(width, height, dpr);
    this.legacy.clear();
    const a = this.engine.effectAnchor(0, 0), p = this.view.board.cell(0, 0), camera = this.view.stage.camera;
    const world = new THREE.Matrix4().set(1 / a.tile, 0, 0, p.x - a.x / a.tile, 0, 0, 1, 0.05, 0, 1 / a.tile, 0, p.z - a.y / a.tile, 0, 0, 0, 1);
    const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(world);
    this.legacy.setProjection(projection.elements);
    // The engine still draws its actual art. Arrows already have their own camera-facing 3D
    // pass, so hide just those canvas shots for this synchronous draw and restore immediately.
    const e = this.engine as unknown as { missileFx: Array<{ live: boolean; kind: string; fromX: number; fromY: number; toX: number; toY: number }>; bladeFx: Array<{ live: boolean; x: number; y: number }>; drawBladeFx: (ctx: unknown, tile: number) => void; drawMissileFx: (ctx: unknown, tile: number) => void };
    // The mage's basic bolt also flies in that 3D pass (battleProjectiles3d.ts).
    const arrows = e.missileFx.filter(m => m.live && (m.kind === "longShot" || m.kind === "arcaneBolt"));
    // Spell bolts (enemy Magic Missile, Phantasmal Force, venom…) fly hex to hex at chest height;
    // on the flat ground sheet they landed off their caster and target, so each gets its own sheet.
    const bolts = e.missileFx.filter(m => m.live && !arrows.includes(m));
    // Melee slashes (Double Strike's cross, Cleave's arc, Sweep's ring…) are drawn on the flat
    // canvas sheet at height 0; on raised ground that put them visibly off the struck hex. They
    // are left out of the shared pass and each drawn below on its own hex's ground height.
    const blades = e.bladeFx.filter(b => b.live);
    // Ember's hex-anchored spell art (lightning, bursts, holy light, hit sparks, level-up stars,
    // portals, Provoke) was painted for a 2D view: "up" on the canvas is up in the air. On the
    // flat ground sheet that laid them along the floor at height 0, off their hex, so each is
    // drawn on its own camera-facing sheet standing on its hex instead (Ember's 2D look, in place).
    const eng = this.engine as unknown as Record<string, any>, tile = a.tile;
    const unitCell = (id?: string) => { const u = id ? this.engine.units.find(n => n.id === id) : undefined; return u ? { x: u.x, y: u.y } : null; };
    const standing = ([
      [eng.lightningFx, (l: any) => l, () => eng.drawLightningFx(this.legacy, tile), false],
      [eng.fireballBurstFx, (b: any) => b, () => eng.drawFireballBurstFx(this.legacy, tile), false],
      [eng.holyFx, (fx: any) => unitCell(fx.unitId) ?? fx, () => eng.drawHolyFx(this.legacy, tile), false],
      [eng.particles, (q: any) => ({ x: Math.round(q.x), y: Math.round(q.y) }), () => eng.drawParticleFx(this.legacy, tile, true), true],
      [eng.levelUpFx, (s: any) => unitCell(s.unitId), () => eng.drawLevelUpFx(this.legacy, tile, true), true],
      [eng.portalFx, (q: any) => q, () => eng.drawPortalFx(this.legacy, tile), false],
    ] as Array<[Array<{ live: boolean }>, (fx: any) => { x: number; y: number } | null, () => void, boolean]>)
      .map(([list, cell, draw, onUnit]) => ({ items: list.filter(fx => fx.live), cell, draw, onUnit }));
    // hit sparks, level-up stars and Provoke sit on a unit's body: anchor them at its Ember feet
    const footAt = (cell: { x: number; y: number }) => { const u = this.engine.units.find(n => n.alive && n.x === cell.x && n.y === cell.y); return u ? eng.unitVisual(u, tile).footY as number : tile * Math.sqrt(3) * 0.42; };
    // Turn Undead and Provoke keep plain lists (no live flag): swapped out while they're drawn alone.
    const provoke: Array<{ unitId: string }> = eng.provokeFx, turnUndead: Array<{ tiles: { x: number; y: number }[] }> = eng.turnUndeadFx;
    for (const shot of [...arrows, ...bolts]) shot.live = false;
    for (const blade of blades) blade.live = false;
    for (const pool of standing) for (const fx of pool.items) (fx as { live: boolean }).live = false;
    eng.provokeFx = []; eng.turnUndeadFx = [];
    try { this.engine.renderUnitsAndOverlays(this.legacy, 1280, 800, undefined, true, true, true, true, true, false, true, true); }
    finally {
      for (const shot of [...arrows, ...bolts]) shot.live = true; for (const blade of blades) blade.live = true;
      for (const pool of standing) for (const fx of pool.items) (fx as { live: boolean }).live = true;
      eng.provokeFx = provoke; eng.turnUndeadFx = turnUndead;
    }
    const viewProj = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    for (const pool of standing) {
      // effects on the same hex share one sheet and one draw
      const byCell = new Map<string, { cell: { x: number; y: number }; fx: object[] }>();
      for (const fx of pool.items) {
        const cell = pool.cell(fx);
        if (!cell || cell.x < 0 || cell.y < 0 || cell.x >= this.engine.cols || cell.y >= this.engine.rows) continue;
        const key = `${cell.x},${cell.y}`, group = byCell.get(key);
        if (group) group.fx.push(fx); else byCell.set(key, { cell: { x: cell.x, y: cell.y }, fx: [fx] });
      }
      for (const { cell, fx } of byCell.values()) {
        this.legacy.setProjection(viewProj.clone().multiply(this.standingSheet(cell, tile, pool.onUnit ? footAt(cell) : 0)).elements);
        for (const other of pool.items) (other as { live: boolean }).live = fx.includes(other);
        try { pool.draw(); } finally { for (const other of pool.items) (other as { live: boolean }).live = true; }
      }
    }
    try {
      for (const fx of provoke) {
        const cell = unitCell(fx.unitId); if (!cell) continue;
        this.legacy.setProjection(viewProj.clone().multiply(this.standingSheet(cell, tile, footAt(cell))).elements);
        eng.provokeFx = [fx]; eng.drawProvokeFx(this.legacy, tile);
      }
      // Turn Undead marks the struck hexes on the floor: a ground sheet at their average height.
      for (const fx of turnUndead) {
        const heights = fx.tiles.filter(c => c.x >= 0 && c.y >= 0 && c.x < this.engine.cols && c.y < this.engine.rows).map(c => { const g = this.view.board!.cell(c.x, c.y); return g.water ? g.waterY : this.view.groundAt(g.x, g.z); });
        const lift = (heights.length ? heights.reduce((s, h) => s + h, 0) / heights.length : 0) + 0.05;
        const sheet = new THREE.Matrix4().set(1 / tile, 0, 0, p.x - a.x / tile, 0, 0, 1, lift, 0, 1 / tile, 0, p.z - a.y / tile, 0, 0, 0, 1);
        this.legacy.setProjection(viewProj.clone().multiply(sheet).elements);
        eng.turnUndeadFx = [fx]; eng.drawTurnUndeadFx(this.legacy, tile);
      }
    } finally { eng.provokeFx = provoke; eng.turnUndeadFx = turnUndead; }
    for (const bolt of bolts) {
      this.legacy.setProjection(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.boltSheet(bolt, a.tile)).elements);
      for (const other of bolts) other.live = other === bolt;
      try { e.drawMissileFx(this.legacy, a.tile); } finally { for (const other of bolts) other.live = true; }
    }
    for (const blade of blades) {
      if (blade.x < 0 || blade.y < 0 || blade.x >= this.engine.cols || blade.y >= this.engine.rows) continue;
      const c = this.view.board.cell(blade.x, blade.y);
      const lift = (c.water ? c.waterY : this.view.groundAt(c.x, c.z)) + 0.05;
      const sheet = new THREE.Matrix4().set(1 / a.tile, 0, 0, p.x - a.x / a.tile, 0, 0, 1, lift, 0, 1 / a.tile, 0, p.z - a.y / a.tile, 0, 0, 0, 1);
      this.legacy.setProjection(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(sheet).elements);
      for (const other of blades) other.live = other === blade;
      try { e.drawBladeFx(this.legacy, a.tile); } finally { for (const other of blades) other.live = true; }
    }
    this.legacy.setProjection(projection.elements);
    const anchor = (x: number, y: number) => {
      const original = this.engine.effectAnchor(x, y), s = this.projected(original.x, original.y);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const cell = this.view.board!.cell(x, y);
      const center = new THREE.Vector3(cell.x, this.view.groundAt(cell.x, cell.z) + 0.05, cell.z);
      const edge = center.clone().add(right).project(camera);
      return { ...original, x: (s.x + 1) * width / 2, y: (1 - s.y) * height / 2, tile: Math.hypot((edge.x - s.x) * width / 2, (edge.y - s.y) * height / 2) };
    };
    for (const request of this.engine.frostVfxRequests.splice(0)) this.effects.spawnFrost({ ...request, onImpact: cell => this.pulse(cell, 0, 0, 0.55) });
    const live = new Set(this.engine.iceStormZones.map(zone => zone.createdAt));
    for (const [key, id] of this.blizzards) if (!live.has(key)) { this.effects.removeBlizzard(id); this.blizzards.delete(key); }
    for (const zone of this.engine.iceStormZones) if (!this.blizzards.has(zone.createdAt)) {
      const cells = [...zone.cells].map(key => { const [x, y] = key.split(",").map(Number); return { x, y }; }).filter(c => !this.engine.fogged || this.engine.visible(c.x, c.y));
      if (cells.length) this.blizzards.set(zone.createdAt, this.effects.spawnBlizzard({ cells, duration: 9, seed: Math.floor(zone.createdAt * 1000), particleDensity: 1.3, groundScaleY: this.view.rig.flat ? 1 : Math.abs(Math.sin(this.view.rig.pitch)), onImpact: (cell, dx, dy, strength) => this.pulse(cell, dx, dy, strength) }));
    }
    const beam = this.engine.webShotBeam();
    if (beam) {
      if (this.webShot === null) this.webShot = this.effects.spawnEffect("webShot", 0, 0, { radiusTiles: 0.01 });
      const s = this.projected(beam.x, beam.y), end = this.projected(beam.x + Math.cos(beam.angle) * beam.length / 2, beam.y + Math.sin(beam.angle) * beam.length / 2);
      const dx = (end.x - s.x) * width / 2, dy = -(end.y - s.y) * height / 2;
      this.effects.updateOverride(this.webShot, { x: (s.x + 1) * width / 2, y: (1 - s.y) * height / 2, worldX: beam.worldX, worldY: beam.worldY, tile: beam.tile, halfLengthPx: Math.max(1, Math.hypot(dx, dy)), halfWidthPx: anchor(0, 0).tile * 0.4, rotation: Math.atan2(dy, dx) });
    } else if (this.webShot !== null) { this.effects.removeEffect(this.webShot); this.webShot = null; }
    for (const request of this.engine.elementalFxRequests.splice(0)) if (!this.engine.fogged || this.engine.visible(request.x, request.y)) this.effects.spawnEffect(request.kind, request.x, request.y, { duration: request.duration });
    if (this.effects.hasEffects()) { this.fxCanvas.style.display = "block"; this.effects.render(this.view.stage.renderer.domElement, dt, anchor); }
    else this.fxCanvas.style.display = "none";
  }
  dispose(): void { this.effects.dispose(); this.legacy.dispose(); for (const pulse of this.pulses) pulse.light.removeFromParent(); }
}
