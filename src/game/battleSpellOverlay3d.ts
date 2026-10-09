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
    this.legacy = new WebGL2DRenderer(artCanvas);
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
    const e = this.engine as unknown as { missileFx: Array<{ live: boolean; kind: string }> };
    const arrows = e.missileFx.filter(m => m.live && m.kind === "longShot");
    for (const arrow of arrows) arrow.live = false;
    try { this.engine.renderUnitsAndOverlays(this.legacy, 1280, 800, undefined, true, true, true, true, true, false, true, true); }
    finally { for (const arrow of arrows) arrow.live = true; }
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
