// Engine2's 3D battlefield, standing in for Ember's 2D BattleCanvas (same props). Ember's
// BattleEngine still runs every rule, turn and AI decision; this only draws its state on the 3D
// map (Engine2 terrain, decorations, full-resolution sprites) and feeds clicks back as hexes.
// First pass: units snap/walk between hexes with idle, walk, attack and death poses; reach and
// selection show as hex rings. Spell/hit effects and the HUD's finer overlays come later.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { BattleEngine } from "./engine";
import type { HudSnapshot, Unit } from "./types";
import { DioramaView } from "../editor/ember/dioramaView";
import { UnitActor } from "../units/actor";
import { unitForSpawn } from "../units/catalog";
import type { Mission } from "../ember/types";

type Any = Record<string, any>; // the engine's private helpers (hexCenter, active) are read as-is

export function Battle3D({
  engine,
  onHud,
  onInspectUnit,
  paused,
  onTileReadout,
}: {
  engine: BattleEngine;
  onHud: (hud: HudSnapshot) => void;
  onInspectUnit?: (unitId: string) => void;
  paused?: boolean;
  onTileReadout?: (showing: boolean) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onHudRef = useRef(onHud);
  onHudRef.current = onHud;

  useEffect(() => {
    const host = hostRef.current!;
    const view = new DioramaView(host);
    const e = engine as unknown as Any;
    // the board only: battle units come from the engine, not the map's spawn list
    // Ember's loading curtain lifts on "ember:battle-ready": sent once the board and its
    // decorations are in the scene and a frame has been drawn.
    void view.setMission({ ...(engine.mission as unknown as Mission), playerSpawns: [], enemySpawns: [], neutralSpawns: [] })
      .then(() => requestAnimationFrame(() => window.dispatchEvent(new Event("ember:battle-ready"))));

    const actors = new Map<string, { actor: UnitActor; dead: boolean; lastAction: unknown }>();
    const toWorld = (wx: number, wy: number) => {
      const a0 = e.effectAnchor(0, 0) as { worldX: number; worldY: number; tile: number };
      const L = view.board!.layout;
      return { x: (wx - a0.worldX) / a0.tile - L.ox, z: (wy - a0.worldY) / a0.tile - L.oz };
    };
    const syncUnits = () => {
      if (!view.board) return;
      const seen = new Set<string>();
      for (const u of engine.units as Unit[]) {
        seen.add(u.id);
        let entry = actors.get(u.id);
        if (!entry) {
          const def = unitForSpawn({ name: u.name, classId: u.classId }, u.side === "player" ? "player" : u.side === "enemy" ? "enemy" : "neutral");
          if (!def) continue;
          const actor = new UnitActor(def);
          view.stage.scene.add(actor.mesh);
          void actor.ready().catch(() => undefined);
          entry = { actor, dead: false, lastAction: null };
          actors.set(u.id, entry);
        }
        const { actor } = entry;
        const anchor = e.unitAnchor(u) as { worldX: number; worldY: number };
        const p = toWorld(anchor.worldX, anchor.worldY);
        actor.x = p.x; actor.z = p.z;
        actor.facing = (u.facing ?? 1) >= 0 ? 1 : -1;
        actor.mesh.visible = (u.fade ?? 1) > 0;
        const active = e.active as Any | null;
        if (!u.alive) {
          if (!entry.dead) { entry.dead = true; void actor.play("death"); }
          continue;
        }
        if (entry.dead) { entry.dead = false; actor.revive(); }
        const moving = active?.type === "move" && active.id === u.id;
        const attacking = active && (active.type === "combat" || active.type === "spell" || active.type === "heal") && active.att === u.id;
        if (attacking && entry.lastAction !== active) {
          entry.lastAction = active;
          void actor.play(active.type === "combat" ? (String(active.stage ?? "").startsWith("counter") ? "counter" : "attack") : "cast");
        } else if (moving && entry.lastAction !== active) {
          entry.lastAction = active;
          void actor.play(actor.has("walk") ? "walk" : "idle");
        } else if (!moving && !attacking && entry.lastAction) {
          entry.lastAction = null;
          void actor.play("idle");
        }
      }
      for (const [id, entry] of actors) if (!seen.has(id)) { view.stage.scene.remove(entry.actor.mesh); entry.actor.dispose(); actors.delete(id); }
    };

    let hudClock = 0;
    view.stage.onFrame((dt) => {
      // keeps the engine's sight/fog current exactly as its own renderer does every frame
      e.updateCameraLayout(1280, 800);
      if (!pausedRef.current) engine.tick(dt);
      syncUnits();
      const yaw = view.rig.facingYaw;
      for (const { actor } of actors.values()) actor.update(dt, yaw, view.groundAt);
      const reach = [...(engine.reach?.keys?.() ?? [])].map((k: string) => { const [x, y] = k.split(",").map(Number); return { x, y }; });
      view.setRings("reach", reach, new THREE.Color(0.9, 1.9, 2.8));
      const sel = engine.selectedId ? (engine.units as Unit[]).find(u => u.id === engine.selectedId) : null;
      view.setRings("selected", sel ? [{ x: sel.x, y: sel.y }] : [], new THREE.Color(2.6, 2.1, 0.9));
      hudClock += dt;
      if (hudClock > 0.1) { hudClock = 0; onHudRef.current(engine.getHud()); }
    });

    // clicks: the hex under the pointer, handed to the engine as that hex's own screen point
    const cssPoint = (x: number, y: number) => e.hexCenter(x, y) as { cx: number; cy: number };
    view.rig.onClick = (ev) => {
      if (pausedRef.current) return;
      const cell = view.cellAt(ev.clientX, ev.clientY);
      if (!cell) return;
      const p = cssPoint(cell.x, cell.y);
      engine.pointerDown(p.cx, p.cy, "click");
    };
    const onMove = (ev: PointerEvent) => {
      const cell = view.cellAt(ev.clientX, ev.clientY);
      view.setHover(cell);
      if (!cell) { onTileReadout?.(false); return; }
      const p = cssPoint(cell.x, cell.y);
      engine.pointerMove(p.cx, p.cy);
    };
    // a short right click (no drag) is Ember's: inspect a unit, or step back / cancel
    let rightDown: { x: number; y: number } | null = null;
    const onDown = (ev: PointerEvent) => { if (ev.button === 2) rightDown = { x: ev.clientX, y: ev.clientY }; };
    const onUp = (ev: PointerEvent) => {
      if (ev.button !== 2 || !rightDown || pausedRef.current) return;
      const moved = Math.hypot(ev.clientX - rightDown.x, ev.clientY - rightDown.y) > 5;
      rightDown = null;
      if (moved) return;
      const cell = view.cellAt(ev.clientX, ev.clientY);
      const unit = cell ? (engine.units as Unit[]).find(u => u.alive && u.x === cell.x && u.y === cell.y) : null;
      if (unit) { onInspectUnit?.(unit.id); return; }
      const hud = engine.getHud();
      const showAct = hud.mode === "awaitAction" || hud.mode === "awaitAttack" || hud.mode === "selected" || hud.mode === "awaitSpell" || hud.mode === "awaitOffHand";
      if (!showAct || hud.busy) return;
      if (engine.mission.explore && (hud.mode === "selected" || hud.mode === "awaitAction")) { engine.deselect(true); return; }
      engine.cancel();
    };
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (pausedRef.current) return;
      engine.keyDown(ev.code);
    };
    const canvas = view.stage.renderer.domElement;
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      for (const { actor } of actors.values()) actor.dispose();
      view.dispose();
    };
  }, [engine]);

  return <div ref={hostRef} className="absolute inset-0 bg-black" onContextMenu={(ev) => ev.preventDefault()} />;
}
