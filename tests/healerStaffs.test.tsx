import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { HEALER_BLUNT_STAFF_TIERS, HEALER_BLUNT_STAFF_ELITE, HEALER_BLUNT_STAFF_ALL } from "../src/ember/healerBluntStaffs";
import { MAGE_STAFF_MAGIC, staffElementalDamage, staffLifeSteal } from "../src/ember/mageStaffMagic";
import { WEAPONS, gearStatBonus, statsFor, starterWeaponFor, weaponIcon, weaponPower, weaponMagicSummary } from "../src/game/data";
import { WEAPONS as EDITOR_WEAPONS } from "../src/ember/data";
import { elementalDamage } from "../src/game/resistances";
import { emptySave, loadBank, SAVE_VERSION } from "../src/game/save";
import { previewDamage } from "../src/game/combat";
import { InnScreen } from "../src/game/InnScreen";
import { BattleEngine } from "../src/game/engine";
import type { Unit } from "../src/game/types";

vi.mock("../src/game/audio", () => ({ sfxPlay: new Proxy({}, { get: () => vi.fn() }), hasMonsterSfx: () => false, playTheme: vi.fn(), stopMusic: vi.fn(), unlockAudio: vi.fn() }));

describe("Healer blunt staff series", () => {
  it("covers all nine rungs from level 1 to 30, in game and editor, with distinct assets", () => {
    expect(HEALER_BLUNT_STAFF_TIERS.map(t => t.recommendedLevel)).toEqual([1, 4, 8, 11, 15, 19, 22, 26, 30]);
    let previous = 0;
    for (const tier of HEALER_BLUNT_STAFF_TIERS) {
      const weapon = WEAPONS[tier.id];
      expect(weapon).toEqual(EDITOR_WEAPONS[tier.id]);
      expect(weapon.usableBy).toEqual(["healer", "salazar", "bishop", "cleric"]);
      expect(weapon.weaponType).toBe("staff"); expect(weapon.minRange).toBe(1); expect(weapon.maxRange).toBe(1);
      expect(weapon.magic).toBeUndefined(); expect(weaponPower(weapon)).toBeGreaterThan(previous);
      previous = weaponPower(weapon);
      expect(existsSync(`public${weaponIcon(tier.id)}`)).toBe(true);
    }
    expect(starterWeaponFor("healer")).toBe(HEALER_BLUNT_STAFF_TIERS[0].id);
    expect(emptySave().equipped.Salazar).toBe(HEALER_BLUNT_STAFF_TIERS[0].id);
  });

  it("adds eight stronger upper-tier alternatives while retaining the nine original weapons", () => {
    expect(HEALER_BLUNT_STAFF_ELITE).toHaveLength(8);
    expect(HEALER_BLUNT_STAFF_ALL).toHaveLength(17);
    for (const variant of HEALER_BLUNT_STAFF_ELITE) {
      const weapon = WEAPONS[variant.id];
      expect(weapon).toEqual(EDITOR_WEAPONS[variant.id]);
      expect(weapon.usableBy).toEqual(["healer", "salazar", "bishop", "cleric"]);
      expect(weapon.weaponType).toBe("staff"); expect(weapon.magic).toBeUndefined();
      expect(weapon.dice).toBe(2); expect(weapon.bonus).toBeGreaterThan(0);
      const base = HEALER_BLUNT_STAFF_TIERS.find(t => t.dice === variant.dice && t.faces === variant.faces)!;
      expect(weaponPower(weapon)).toBeGreaterThan(weaponPower(WEAPONS[base.id]));
      expect(weapon.price).toBe(base.price + variant.bonus * 60);
      expect(existsSync(`public${weaponIcon(variant.id)}`)).toBe(true);
    }
  });

  it("has real RGBA transparency without an opaque backdrop and with visible weapon pixels", async () => {
    for (const tier of HEALER_BLUNT_STAFF_ALL) {
      const file = `public${weaponIcon(tier.id)}`, meta = await sharp(file).metadata();
      expect(meta.hasAlpha, tier.id).toBe(true);
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const alphas = new Uint8Array(info.width * info.height);
      for (let pixel = 0; pixel < alphas.length; pixel++) alphas[pixel] = data[pixel * 4 + 3]!;
      // The generator can leave a single 1/255 alpha rounding pixel at a corner. The
      // backdrop must otherwise contain truly zero-alpha pixels, not a painted checkerboard.
      expect(alphas[0]).toBeLessThanOrEqual(1); expect(alphas[info.width - 1]).toBeLessThanOrEqual(1);
      expect(alphas[(info.height - 1) * info.width]).toBeLessThanOrEqual(1); expect(alphas[alphas.length - 1]).toBeLessThanOrEqual(1);
      expect(alphas.filter(a => a === 0).length).toBeGreaterThan(alphas.length * 0.7);
      expect(alphas.filter(a => a >= 240).length).toBeGreaterThan(1000);
    }
  });

  it("moves all 13 earlier ornate staffs to mages without removing their art or identifiers", () => {
    expect(Object.keys(MAGE_STAFF_MAGIC)).toHaveLength(13);
    for (const id of Object.keys(MAGE_STAFF_MAGIC)) {
      const weapon = WEAPONS[id];
      expect(weapon).toEqual(EDITOR_WEAPONS[id]);
      expect(weapon.usableBy).toEqual(["mage", "voss", "elementalist", "warlock", "conjurer", "sorcerer", "necromancer"]);
      expect(weapon.magic).toEqual(MAGE_STAFF_MAGIC[id]);
      expect(existsSync(`public${weaponIcon(id)}`)).toBe(true);
      expect(weaponMagicSummary(weapon)).not.toBe("");
    }
  });

  it("renders the actual blacksmith with the full Healer series and mage-only magic stock", () => {
    const save = { ...emptySave(true), seenSmithIntro: true, weapons: {}, equipped: {} };
    const props: any = { save, bags: save.bags, ember: 10000, muted: true, weapons: {}, equipped: {}, heroClass: { Kael: "healer" }, startInSmith: true, test: true,
      onUseRation: vi.fn(), onBuyMeal: vi.fn(), onBuyMealAll: vi.fn(), onOpenStatus: vi.fn(), onMute: vi.fn(), onLeave: vi.fn(), onPay: vi.fn(), onBuyRations: vi.fn(), onBuyWeapon: vi.fn(), onBuyEquipment: vi.fn(), onEquipWeapon: vi.fn(), onUpgradeWeapon: vi.fn(), onSellWeapon: vi.fn(), onSeenSmithIntro: vi.fn() };
    const healer = renderToStaticMarkup(createElement(InnScreen, props));
    for (const tier of HEALER_BLUNT_STAFF_ALL) { expect(healer).toContain(weaponIcon(tier.id)); expect(healer).toContain(`Nv. ${tier.recommendedLevel}`); }
    for (const id of Object.keys(MAGE_STAFF_MAGIC)) expect(healer).not.toContain(weaponIcon(id));
    const mage = renderToStaticMarkup(createElement(InnScreen, { ...props, heroClass: { Kael: "mage" } }));
    for (const id of Object.keys(MAGE_STAFF_MAGIC)) expect(mage).toContain(weaponIcon(id));
    for (const tier of HEALER_BLUNT_STAFF_ALL) expect(mage).not.toContain(weaponIcon(tier.id));
    expect(mage).toContain("Regeneração"); expect(mage).toContain("Dreno:");
    const output = "artifacts/healer-blunt-staffs-high-tier-2026-10-09";
    mkdirSync(output, { recursive: true });
    writeFileSync(`${output}/blacksmith-healer.html`, healer);
    writeFileSync(`${output}/blacksmith-mage.html`, mage);
  });
  it("preserves an old save's owned staff and enhancement when giving Salazar a compatible starter", () => {
    const save = emptySave(true);
    save.completed = ["aldeia"]; save.equipped.Salazar = "cajado-da-galhada";
    save.weapons["cajado-da-galhada"] = 3;
    const record = JSON.stringify({ version: SAVE_VERSION, lastSlot: 0, muted: true, slots: [save, null, null, null, null, null] });
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === "ember-save-bank" ? record : null, setItem: vi.fn() });
    try {
      const restored = loadBank().slots[0]!;
      expect(restored.weapons["cajado-da-galhada"]).toBe(3);
      expect(restored.equipped.Salazar).toBe(HEALER_BLUNT_STAFF_TIERS[0].id);
      expect(restored.weapons[HEALER_BLUNT_STAFF_TIERS[0].id]).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });
});

function battleFixture() {
  const engine: any = Object.create(BattleEngine.prototype);
  const unit: Unit = { ...statsFor("mage", 10), id: "mage", name: "Voss", classId: "mage", side: "player", alive: true, summoned: false, level: 10, hp: 15, maxHp: 30, weaponId: "cajado-da-renovacao", gear: {}, statPointAllocation: {}, hungerPenaltyPct: 0, diseased: false, shock: null, poisoned: false, x: 0, y: 0, drawX: 0, drawY: 0 } as unknown as Unit;
  Object.assign(engine, { heroSkills: {}, phase: "player", result: null, units: [unit], iceStormZones: [], time: 0, log: [], emitParticle: vi.fn(), applyTileHazard: vi.fn(), evaluateEnd: vi.fn() });
  return { engine, unit };
}

describe("equipped mage staff magic", () => {
  it("applies and removes staff stats/resistances without stacking on repeated gear refresh", () => {
    const { engine, unit } = battleFixture();
    engine.reapplyGear(unit); const mag = unit.mag;
    expect(mag).toBe(statsFor("mage", 10).mag + 1); expect(unit.resistances?.ice).toBe(10);
    engine.reapplyGear(unit); expect(unit.mag).toBe(mag); expect(unit.resistances?.ice).toBe(10);
    unit.weaponId = null; engine.reapplyGear(unit);
    expect(unit.mag).toBe(statsFor("mage", 10).mag); expect(unit.resistances?.ice).toBe(0);
    expect(gearStatBonus([], "cajado-da-renovacao", "healer").mag).toBe(0);
  });
  it("regenerates at turn start, stops when unequipped and cannot exceed max HP or revive", () => {
    const { engine, unit } = battleFixture();
    engine.startOfTurnEffects(unit); expect(unit.hp).toBe(17);
    unit.hp = 29; engine.startOfTurnEffects(unit); expect(unit.hp).toBe(30);
    unit.hp = 15; unit.weaponId = null; engine.startOfTurnEffects(unit); expect(unit.hp).toBe(15);
    unit.weaponId = "cajado-da-renovacao"; unit.alive = false; unit.hp = 0;
    engine.startOfTurnEffects(unit); expect(unit.hp).toBe(0);
  });
  it("drains actual damage into HP, caps at missing HP and does not affect other staffs", () => {
    const { engine, unit } = battleFixture(); unit.weaponId = "cajado-da-comunhao";
    engine.staffDrain(unit, 20); expect(unit.hp).toBe(17);
    unit.hp = 29; engine.staffDrain(unit, 100); expect(unit.hp).toBe(30);
    expect(staffLifeSteal(5, 20, MAGE_STAFF_MAGIC[unit.weaponId])).toBe(0);
    unit.weaponId = "cajado-da-graca"; unit.hp = 15; engine.staffDrain(unit, 100); expect(unit.hp).toBe(15);
  });
  it("boosts only matching elements before resistance, preserving full immunity", () => {
    const magic = MAGE_STAFF_MAGIC["cajado-da-justica"];
    expect(staffElementalDamage(100, magic, "holy")).toBe(125);
    expect(staffElementalDamage(100, magic, "arcane")).toBeCloseTo(115);
    expect(staffElementalDamage(100, magic, "fire")).toBe(100);
    expect(elementalDamage(staffElementalDamage(100, magic, "holy"), 100)).toBe(0);
    const { unit } = battleFixture(); unit.weaponId = "cajado-da-justica"; unit.weaponEnh = 0;
    const target = { alive: true, x: 1, y: 0, atk: 0, mag: 0, def: 0, dex: 0, resistances: { holy: 100 + unit.mag / 2 }, faceDx: -1, faceDy: 0 } as Unit;
    expect(previewDamage(unit, target, "plains", "plains").dmg).toBe(0);
  });
  it("rejects wielding a mage staff as a Healer or a healer staff as a mage", () => {
    const { engine, unit } = battleFixture(); unit.classId = "healer";
    expect(engine.equipWeaponOn(unit.id, "cajado-da-justica", 0)).toBe(false);
    unit.classId = "mage";
    expect(engine.equipWeaponOn(unit.id, HEALER_BLUNT_STAFF_TIERS[0].id, 0)).toBe(false);
    expect(engine.equipWeaponOn(unit.id, "cajado-da-justica", 0)).toBe(true);
  });
});
