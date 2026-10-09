import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { BattleEngine } from "../src/game/engine";
import type { DioramaView } from "../src/editor/ember/dioramaView";

const doubles = vi.hoisted(() => {
  const instances: any[] = [];
  class Effect {
    casts: any[] = []; finished = false;
    constructor(..._args: any[]) { instances.push(this); }
    update() {} setSettings() {} dispose() {}
    cast(options: any) { this.casts.push(options); }
    castSpell(options: any) { this.casts.push(options); }
    restartAt(_target: any, _tile: any, options: any) { this.casts.push(options); }
  }
  return { Effect, instances };
});
vi.mock("../src/vfx/legacy/three/FireballVFX", () => ({ FireballVFX: doubles.Effect }));
vi.mock("../src/vfx/legacy/three/CausticVenomVFX", () => ({ CausticVenomVFX: doubles.Effect }));
vi.mock("../src/vfx/legacy/three/BlessVFX", () => ({ BlessVFX: doubles.Effect, getActiveBlessVfxSettings: () => ({}) }));
vi.mock("../src/vfx/legacy/three/PhantasmalForceVFX", () => ({ PhantasmalForceVFX: doubles.Effect, getActivePhantasmalForceSettings: () => ({}) }));
vi.mock("../src/vfx/legacy/three/MagicMissileV2VFX", () => ({ MagicMissileV2VFX: doubles.Effect, getActiveMagicMissileV2Settings: () => ({}) }));
vi.mock("../src/vfx/legacy/three/BurningHandsV2VFX", () => ({ BurningHandsV2VFX: doubles.Effect, getActiveBurningHandsV2Settings: () => ({}) }));
vi.mock("../src/vfx/legacy/three/VarreduraVFX", () => ({ VarreduraVFX: doubles.Effect, CleaveSweepVFX: doubles.Effect }));
vi.mock("../src/vfx/legacy/three/WebOfDreamsVFX", () => ({ WebOfDreamsVFX: doubles.Effect }));
import { BattleSpells3D } from "../src/game/battleSpells3d";

function setup() {
  doubles.instances.length = 0;
  const camera = new THREE.PerspectiveCamera();
  const view = { stage: { scene: new THREE.Scene(), camera, renderer: { domElement: { width: 800, height: 600 } } }, board: { layout: { ox: 0, oz: 0 }, cell: (x: number, y: number) => ({ x: x * Math.sqrt(3), z: y * 1.5 }) }, groundAt: () => 2 } as unknown as DioramaView;
  const engine: any = { units: [{ id: "caster", x: 0, y: 0, alive: true }, { id: "target", x: 1, y: 0, alive: true }], time: 0, webZones: [], fogged: false,
    effectAnchor: (x: number, y: number) => ({ worldX: x * 10 * Math.sqrt(3), worldY: y * 15, tile: 10 }),
    unitAnchor: (u: any) => engine.effectAnchor(u.x, u.y), visible: () => false, webZoneRadiusTiles: (r: number) => r };
  for (const name of ["fireball", "causticVenom", "phantasmalForce", "bless", "magicMissileV2", "burningHandsV2", "varredura", "cleave"]) { engine[`${name}VfxRequests`] = []; engine[`${name}VfxEvents`] = []; }
  engine.blessTimelineEvents = []; engine.magicMissileV2TimelineEvents = [];
  return { engine, spells: new BattleSpells3D(view, engine as BattleEngine) };
}

describe("OG spell combat handoff", () => {
  it("emits Fireball launch, impact and completion from the actual effect callbacks", () => {
    const { engine, spells } = setup();
    engine.fireballVfxRequests.push({ id: "fire", casterId: "caster", target: { x: 1, y: 0 }, tiles: [{ x: 1, y: 0 }] });
    spells.sync(0.016);
    const cast = doubles.instances[0].casts[0];
    expect(engine.fireballVfxEvents).toEqual([]);
    expect(cast.target.z).toBeCloseTo(2.04); // Engine2 terrain height survives the boundary.
    cast.onLaunch(); cast.onImpact(); cast.onComplete();
    expect(engine.fireballVfxEvents.map((e: any) => e.phase)).toEqual(["launch", "impact", "complete"]);
    spells.dispose(); expect(engine.fireballVfxAvailable).toBe(false);
  });
  it("finishes each missile before starting another queued shot", () => {
    const { engine, spells } = setup();
    engine.magicMissileV2VfxRequests.push(...["a", "b"].map(id => ({ id, casterId: "caster", targetUnitId: "target" })));
    spells.sync(0.016);
    const effect = doubles.instances[4];
    expect(effect.casts.map((c: any) => c.id)).toEqual(["a"]);
    effect.casts[0].onImpact(0); effect.casts[0].onComplete(); spells.sync(0.016);
    expect(effect.casts.map((c: any) => c.id)).toEqual(["a", "b"]);
    expect(engine.magicMissileV2VfxEvents).toEqual([{ id: "a", phase: "impact", index: 0 }, { id: "a", phase: "complete" }]);
    spells.dispose();
  });
  it("settles a hidden Fireball without drawing it or leaving combat waiting", () => {
    const { engine, spells } = setup(); engine.fogged = true;
    engine.fireballVfxRequests.push({ id: "hidden", casterId: "caster", target: { x: 1, y: 0 }, tiles: [] });
    spells.sync(0.016);
    expect(doubles.instances[0].casts).toEqual([]);
    expect(engine.fireballVfxEvents).toEqual([{ id: "hidden", phase: "impact" }, { id: "hidden", phase: "complete" }]);
    spells.dispose();
  });
  it("applies Bless per ally only when OG's wave reports receipt", () => {
    const { engine, spells } = setup();
    engine.blessVfxRequests.push({ id: "bless", center: { x: 0, y: 0 }, allies: [{ id: "target", x: 1, y: 0, distanceHexes: 1 }] });
    spells.sync(0.016);
    const cast = doubles.instances[2].casts[0];
    expect(engine.blessVfxEvents).toEqual([]);
    cast.onTimelineEvent("bless_unit_receive", "target"); cast.onApply("target"); cast.onComplete();
    expect(engine.blessVfxEvents).toEqual([{ id: "bless", phase: "apply", unitId: "target" }, { id: "bless", phase: "complete" }]);
    expect(engine.blessTimelineEvents).toEqual([{ id: "bless", event: "bless_unit_receive", unitId: "target" }]);
    spells.dispose();
  });
});
