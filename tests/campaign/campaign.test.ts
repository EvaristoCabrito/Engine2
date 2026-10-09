import { afterEach, describe, expect, it, vi } from 'vitest';
import * as portSave from '../../src/campaign/save';
import * as originalSave from 'C:/emberashes03D-main/src/game/save.ts';
import * as portHunger from '../../src/campaign/hunger';
import * as originalHunger from 'C:/emberashes03D-main/src/game/hunger.ts';
import * as portWorld from '../../src/campaign/overworld';
import * as originalWorld from 'C:/emberashes03D-main/src/game/overworld.ts';
import * as maps from '../../src/campaign/mapstore';
import * as originalMaps from 'C:/emberashes03D-main/src/game/mapstore.ts';
import { configureCampaignStorage, memoryCampaignStorage } from '../../src/campaign/storage';
import { EQUIPMENT, MAX_LEVEL, WEAPONS, expToLevel, statsFor } from '../../src/ember/data';
import { awardExperience, canStartMission, finishBattle, partyMembers, setPartyLeader } from '../../src/campaign/campaign';
import { equipSharedItem, equipSharedWeapon, unequipSharedItem } from '../../src/campaign/inventory';
import * as progression from '../../src/campaign/progression';
import * as originalProgression from 'C:/emberashes03D-main/src/game/progression.ts';
import { completedAfterWispVictory, WISP_BOSS_ID, WISP_CROSSING_ID } from '../../src/campaign/wispCrossing';
import { buyConsumables, buyEquipment, buyRations, buyWeapon, sellWeapon, upgradeWeapon } from '../../src/campaign/commerce';
import { acceptQuest, talkToNpc, turnInQuest } from '../../src/campaign/questActions';
import { QUESTS } from '../../src/campaign/quests';
import { POTION_CARRY_MAX, POTION_PRICE, RATIONS_PRICE, weaponEnhCost, weaponSellValue } from '../../src/ember/data';

function rng(seed: number): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); configureCampaignStorage(); });

describe('preserved Ember save contract', () => {
  it('fresh save and bank have the exact original format and starting inventory', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    expect(portSave.emptySave()).toEqual(originalSave.emptySave());
    expect(portSave.emptyBank()).toEqual(originalSave.emptyBank());
    expect(portSave.emptySave().rations).toBe(20);
    expect(portSave.SAVE_VERSION).toBe(19);
  });

  it.each([1, 6, 9, 12, 16, 17, 18, 19])('reads an unchanged version %i bank with original migration parity', version => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const raw = { ...originalSave.emptySave(), version, completed: ['vau', 'estalagem'], levels: { Kael: 12, Nira: 9, Voss: 5, Silas: 4 }, xp: { Kael: 120, Nira: 60, Silas: 10 }, heroHunger: { Kael: 72.5 }, heroSkills: { Kael: { swordWeapon: 2.4 } }, exploredHexes: ['1,2'], dialogsSeen: ['intro:vau:one'], companionConversations: { 'Kael>Neera:0': 3 }, unitHp: { Kael: 15 } };
    const storage = memoryCampaignStorage({ 'ember-save-bank': JSON.stringify({ version, lastSlot: 2, muted: true, slots: [null, null, raw] }) });
    configureCampaignStorage(storage);
    vi.stubGlobal('localStorage', storage);
    expect(portSave.loadBank()).toEqual(originalSave.loadBank());
  });

  it('reads legacy single save and backup keys without reformatting input', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const text = JSON.stringify({ ...originalSave.emptySave(), version: 6, completed: ['vau'], unitHp: { Kael: 10 } });
    const port = memoryCampaignStorage({ 'brasa-save': text });
    const original = memoryCampaignStorage({ 'brasa-save': text });
    configureCampaignStorage(port);
    vi.stubGlobal('localStorage', original);
    expect(portSave.loadBank()).toEqual(originalSave.loadBank());
    expect(port.getItem('brasa-save')).toBe(text);
  });

  it('round trips a populated slot with the same normalization as Ember', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const storage = memoryCampaignStorage(); configureCampaignStorage(storage);
    let bank = portSave.emptyBank();
    const save = { ...portSave.emptySave(), unitHp: { Kael: 10 }, pendingMission: 'vau' };
    bank = portSave.writeSlot(bank, 4, save);
    vi.stubGlobal('localStorage', storage);
    expect(portSave.loadBank()).toEqual(originalSave.loadBank());
    expect(portSave.loadBank().slots[4]?.unitHp).toEqual(save.unitHp);
    expect(portSave.activeSave(bank).pendingMission).toBe('vau');
    expect(portSave.lastSaveWrite().ok).toBe(true);
    expect(portSave.lastSaveWrite().bytes).toBeGreaterThan(0);
  });

  it('supports pure JSON readers and rejects corrupt text', () => {
    expect(portSave.parseRecord('{')).toBeNull();
    expect(portSave.parseBank('null')).toBeNull();
    const save = { ...portSave.emptySave(), unitHp: { Kael: 1 } };
    const text = JSON.stringify(save);
    const parsed = portSave.parseRecord(text)!;
    expect(parsed.unitHp).toEqual(save.unitHp);
    expect(portSave.parseRecord(JSON.stringify(parsed))).toEqual(parsed);
  });

  it('reports failed storage writes', () => {
    configureCampaignStorage({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    portSave.writeBank(portSave.emptyBank());
    expect(portSave.lastSaveWrite().ok).toBe(false);
  });

  it('reads an unchanged in-battle save with turns, statuses, enmity and zone state', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const missionId = maps.ALL_MISSIONS[0].id;
    const raw = { ...portSave.emptySave(), pendingMission: missionId, battle: {
      missionId, turn: 6, phase: 'enemy', tiles: ['plain', 'forest'], decorations: [],
      units: [{ id: 'Kael-1', name: 'Kael', classId: 'swordsman', side: 'player', x: 2, y: 3, hp: 14, maxHp: 31, atk: 9, mag: 0, def: 8, dex: 7, mov: 4, level: 5, xp: 31, alive: true, moved: true, acted: false, poison: true, poisonTier: 'minor', burning: 2, restrained: 3, facing: -1, spells: { tier1: 2 }, bag: { mid: 1 }, weaponSkills: { sword: 14.5 } }],
      turnOrder: ['Kael-1'], activeUnitId: 'Kael-1', selectedId: 'Kael-1',
      enmity: { foe: { 'Kael-1': [20, 5] } }, webZones: [{ cells: ['2,3'], roundsLeft: 2 }], auraZones: [{ cells: ['2,3'], roundsLeft: 1, side: 'player', kind: 'protection', pct: 0.2 }], explored: 'opaque-packed-mask', awake: ['Kael-1'], log: ['turn six'], turnBegan: true,
    } };
    const text = JSON.stringify({ version: 19, lastSlot: 0, muted: false, slots: [raw] });
    const storage = memoryCampaignStorage({ 'ember-save-bank': text }); configureCampaignStorage(storage); vi.stubGlobal('localStorage', storage);
    const port = portSave.loadBank();
    expect(port).toEqual(originalSave.loadBank());
    expect(port.slots[0]?.battle?.turn).toBe(6);
    expect(port.slots[0]?.battle?.enmity).toEqual({ foe: { 'Kael-1': [20, 5] } });
    expect(port.slots[0]?.battle?.explored).toBe('opaque-packed-mask');
    expect(storage.getItem('ember-save-bank')).toBe(text);
  });
});

describe('campaign data and travel parity', () => {
  it('loads every latest map, location order, slots, encounter region and floor grouping', () => {
    expect(maps.ALL_MISSIONS).toEqual(originalMaps.ALL_MISSIONS);
    expect(maps.ALL_LOCATIONS).toEqual(originalMaps.ALL_LOCATIONS);
    expect(maps.LOCATION_SLOTS).toEqual(originalMaps.LOCATION_SLOTS);
    expect(maps.RANDOM_ENCOUNTER_REGIONS).toEqual(originalMaps.RANDOM_ENCOUNTER_REGIONS);
    expect(maps.DEFAULT_LOCATION_SUBMAPS).toEqual(originalMaps.DEFAULT_LOCATION_SUBMAPS);
  });

  it('preserves saved authored membership and removed mission behavior', () => {
    const order = { stonebridge: [], inn: ['estalagem'] };
    const known = maps.ALL_LOCATIONS.flatMap(l => l.missionIds);
    expect(maps.locationsForOrder(order, ['inn', 'stonebridge'], undefined, known)).toEqual(originalMaps.locationsForOrder(order, ['inn', 'stonebridge'], undefined, known));
  });

  it('never spends rations on dead or already fed heroes and matches original meals', () => {
    let save = portSave.emptySave();
    save = { ...save, ember: 20, unitHp: { Kael: 10, Neera: 0 }, heroHunger: { Kael: 30, Neera: 0 } };
    expect(portHunger.useRation(save, 'Kael')).toEqual(originalHunger.useRation(save, 'Kael'));
    expect(portHunger.useRation(save, 'Neera')).toBe(save);
    expect(portHunger.buyInnMeal(save, 'Kael')).toEqual(originalHunger.buyInnMeal(save, 'Kael'));
    expect(portHunger.travelHungerCost(12)).toBe(25);
  });

  it.each([1, 7, 59, 122, 991, 2134])('matches 40 travel steps against original RNG sequence, seed %i', seed => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    let source = { ...originalSave.emptySave(), completed: ['vau', 'estalagem', ...originalMaps.ALL_LOCATIONS.flatMap(l => l.missionIds)], ember: 400, rations: 80 };
    let port = structuredClone(source);
    const sourceRng = rng(seed); const portRng = rng(seed);
    vi.spyOn(Math, 'random').mockImplementation(sourceRng);
    for (let step = 0; step < 40; step++) {
      const hexes = portWorld.neighborsOf(port.overworldPos.col, port.overworldPos.row);
      const target = hexes[step % hexes.length];
      const a = originalWorld.stepOverworld(source, target.x, target.y, originalMaps.ALL_LOCATIONS);
      const b = portWorld.stepOverworld(port, target.x, target.y, maps.ALL_LOCATIONS, false, portRng);
      expect(b).toEqual(a);
      source = a.save; port = b.save;
    }
  });

  it('rejects illegal travel without consuming RNG', () => {
    const save = portSave.emptySave(); const random = vi.fn();
    expect(portWorld.stepOverworld(save, 999, 999, maps.ALL_LOCATIONS, false, random).save).toBe(save);
    expect(random).not.toHaveBeenCalled();
  });

  it('rolls the same configured travel battle without repeating completed or seen encounters', () => {
    const base = { ...portSave.emptySave(), completed: ['vau', 'estalagem'], gameHour: 8 };
    let tested = false;
    for (let col = 2; col < 12 && !tested; col++) for (let row = 2; row < 12 && !tested; row++) {
      if (!portWorld.isOverworldCell(col, row) || portWorld.locationAt(maps.ALL_LOCATIONS, col, row)) continue;
      const encounters = portWorld.travelEncounterIds(col, row);
      if (!encounters.length) continue;
      for (const from of portWorld.neighborsOf(col, row)) {
        const save = { ...base, overworldPos: { col: from.x, row: from.y }, roadEncountersSeen: encounters.length > 1 ? [encounters[0]] : [] };
        if (!portWorld.canStepOverworld(save, from, { x: col, y: row })) continue;
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const expected = originalWorld.stepOverworld(save, col, row, originalMaps.ALL_LOCATIONS);
        const actual = portWorld.stepOverworld(save, col, row, maps.ALL_LOCATIONS, false, () => 0);
        expect(actual).toEqual(expected);
        expect(actual.event?.kind).toBe('battle');
        expect(encounters).toContain(actual.event?.missionId);
        if (encounters.length > 1) expect(actual.event?.missionId).not.toBe(encounters[0]);
        tested = true; break;
      }
    }
    expect(tested).toBe(true);
  });

  it('preserves chapter, quest, flag and mission gate evaluation against Ember', () => {
    const saves = [portSave.emptySave(), { ...portSave.emptySave(), completed: ['vau', 'estalagem'], chapter: 2, questsActive: ['brue-birolho'], questKills: ['O Birolho'], flags: ['suspeito-watchtower-intel'] }];
    for (const save of saves) {
      expect(progression.advanceProgression(save)).toEqual(originalProgression.advanceProgression(save));
      for (const mission of maps.ALL_MISSIONS) expect(progression.missionAccess(mission.id, save)).toBe(originalProgression.missionAccess(mission.id, save));
    }
    expect(completedAfterWispVictory(WISP_CROSSING_ID, [])).toEqual([]);
    expect(completedAfterWispVictory(WISP_BOSS_ID, [])).toEqual([WISP_BOSS_ID, WISP_CROSSING_ID]);
  });
});

describe('pure campaign integration', () => {
  it('respects recruitment and leader selection', () => {
    const save = portSave.emptySave();
    expect(partyMembers(save)).toContain('Kael');
    expect(partyMembers(save)).not.toContain('Malrec');
    expect(setPartyLeader(save, 'Malrec')).toBe(save);
  });

  it('uses exact XP bands, multi-level growth, partial HP healing and level cap', () => {
    let save = { ...portSave.emptySave(), unitHp: { Kael: 1 } };
    save = awardExperience(save, 'Kael', 201);
    expect(save.levels.Kael).toBe(3); expect(save.xp.Kael).toBe(1);
    expect(save.unitHp.Kael).toBe(1 + statsFor('swordsman', 3).hp - statsFor('swordsman', 1).hp);
    save = awardExperience(save, 'Kael', 100000);
    expect(save.levels.Kael).toBe(MAX_LEVEL); expect(save.xp.Kael).toBe(0);
    expect(expToLevel(28)).toBe(600);
  });

  it('matches allocated HP, gear, absent HP and per-level intermediate clamps', () => {
    const gear = Object.values(EQUIPMENT).find(i => (i.hp ?? 0) > 0)!;
    const save = { ...portSave.emptySave(), levels: { Kael: 3 }, xp: { Kael: 0 }, statPointAllocations: { Kael: { hp: 6 } }, equipment: { Kael: { [gear.slot]: gear.id } } };
    const grown = awardExperience(save, 'Kael', expToLevel(3));
    expect(grown.levels.Kael).toBe(4);
    expect(grown.unitHp.Kael).toBe(statsFor('swordsman', 4).hp + 6);
    const barelyAwarded = awardExperience(save, 'Kael', 1);
    expect(barelyAwarded.unitHp.Kael).toBe(statsFor('swordsman', 3).hp + 6 + gear.hp!);
    const wounded = awardExperience({ ...save, unitHp: { Kael: 1 } }, 'Kael', expToLevel(3));
    expect(wounded.unitHp.Kael).toBe(1 + statsFor('swordsman', 4).hp - statsFor('swordsman', 3).hp);
  });

  it('moves a shared weapon rather than duplicating it', () => {
    const save = portSave.emptySave(); const weapon = save.equipped.Kael;
    const next = equipSharedWeapon(save, 'Neera', weapon)!;
    expect(next.equipped.Neera).toBe(weapon); expect(next.equipped.Kael).toBeUndefined();
    expect(save.equipped.Kael).toBe(weapon);
  });

  it('transfers physical equipment and conserves stash quantities', () => {
    const item = Object.values(EQUIPMENT).find(e => e.slot !== 'ring2')!;
    const save = { ...portSave.emptySave(), looseEquipment: { [item.id]: 1 } };
    const equipped = equipSharedItem(save, 'Kael', item.slot, item.id)!;
    expect(equipped.looseEquipment[item.id]).toBeUndefined();
    const transferred = equipSharedItem(equipped, 'Neera', item.slot, item.id)!;
    expect(transferred.equipment.Kael[item.slot]).toBeUndefined();
    expect(unequipSharedItem(transferred, 'Neera', item.slot).looseEquipment[item.id]).toBe(1);
    expect(save.looseEquipment[item.id]).toBe(1);
  });

  it('exposes actual mission unlocking and rejects unknown missions', () => {
    const save = portSave.emptySave();
    expect(canStartMission(save, 'does-not-exist', true)).toBe(false);
    const mission = maps.ALL_MISSIONS[0];
    expect(canStartMission(save, mission.id, true)).toBe(true);
  });

  it('persists resolved battle totals without rerolling loot', () => {
    const save = portSave.emptySave();
    const result = { missionId: maps.ALL_MISSIONS[0].id, victory: true, heroes: { unitHp: { Kael: 10 }, levels: save.levels, xp: save.xp, bags: save.bags, spellUses: save.spellUses }, ember: 8, rations: 2, defeatedSpawnIds: ['enemy-1'] };
    const finished = finishBattle(save, result).save;
    expect(finished.ember).toBe(save.ember + 8); expect(finished.rations).toBe(save.rations + 2);
    expect(finished.unitHp).toEqual({ Kael: 10 });
    expect(save.completed).toEqual([]);
  });

  it('shops use original prices, ownership, enhancement and consumable capacity', () => {
    const save = { ...portSave.emptySave(), ember: 99999 };
    const weapon = Object.values(WEAPONS).find(w => save.weapons[w.id] == null)!;
    const purchased = buyWeapon(save, weapon.id)!;
    expect(purchased.ember).toBe(save.ember - weapon.price);
    expect(buyWeapon(purchased, weapon.id)).toBeNull();
    const upgraded = upgradeWeapon(purchased, weapon.id)!;
    expect(upgraded.weapons[weapon.id]).toBe(1);
    expect(upgraded.ember).toBe(purchased.ember - weaponEnhCost(1));
    expect(sellWeapon(upgraded, weapon.id)!.ember).toBe(upgraded.ember + weaponSellValue(weapon.id, 1));
    const potions = buyConsumables(save, 'Kael', { mid: 1 })!;
    expect(potions.bags.Kael.mid).toBe(save.bags.Kael.mid + 1);
    expect(potions.ember).toBe(save.ember - POTION_PRICE.mid);
    expect(buyConsumables(save, 'Kael', { mid: POTION_CARRY_MAX.mid })).toBeNull();
    expect(buyRations(save, 1)!.ember).toBe(save.ember - RATIONS_PRICE);
    const item = Object.values(EQUIPMENT).find(i => (i.price ?? 0) > 0)!;
    expect(buyEquipment(save, item.id)!.looseEquipment[item.id]).toBe(1);
    expect(save.ember).toBe(99999);
  });

  it('quest discovery and payment preserve source statuses and pay only once', () => {
    const quest = QUESTS.find(q => q.kind === 'kill' && !q.availability)!;
    const fresh = { ...portSave.emptySave(), bags: { Kael: { ...portSave.emptySave().bags.Kael, mid: 0 } } };
    const talked = talkToNpc(fresh, quest.npc);
    expect(talked.npcTalked).toContain(quest.npc); expect(talked.questsDiscovered).toContain(quest.id);
    const active = acceptQuest(talked, quest.id)!;
    expect(turnInQuest(active, quest.id)).toBeNull();
    const paid = turnInQuest({ ...active, questKills: [quest.targetName!] }, quest.id)!;
    expect(paid.ember).toBe(active.ember + quest.reward);
    expect(paid.questsDone).toContain(quest.id);
    expect(turnInQuest(paid, quest.id)).toBeNull();
  });
});
