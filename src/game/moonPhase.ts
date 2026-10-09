// Moon phases on the campaign's day count (save.gameClock), in the spirit of Shin Megami
// Tensei's moon: a short, visible cycle the player can plan around (a werewolf character will
// play on it). Nothing is saved — the phase always follows from the day, so old saves just work.
//
// User decision: a regular 8-day cycle, the eight phases one per day (day 1 new, day 5 full).
// Every third cycle the full moon is a blood moon instead — rarer, yet predictable: days 21, 45,
// 69, … The calendar never changes length; only that one day's moon does.

export type MoonPhase =
  | "new" | "waxingCrescent" | "firstQuarter" | "waxingGibbous"
  | "full" | "waningGibbous" | "lastQuarter" | "waningCrescent"
  | "blood";

/** One cycle, one entry per day. */
export const MOON_PHASES: readonly MoonPhase[] = [
  "new", "waxingCrescent", "firstQuarter", "waxingGibbous",
  "full", "waningGibbous", "lastQuarter", "waningCrescent",
];
export const MOON_CYCLE_DAYS = MOON_PHASES.length;
/** Every this-many cycles, the full moon is a blood moon (the last cycle of each run). */
export const BLOOD_MOON_EVERY = 3;

export const MOON_PHASE_LABEL: Record<MoonPhase, string> = {
  new: "Lua nova",
  waxingCrescent: "Lua crescente",
  firstQuarter: "Quarto crescente",
  waxingGibbous: "Crescente gibosa",
  full: "Lua cheia",
  waningGibbous: "Minguante gibosa",
  lastQuarter: "Quarto minguante",
  waningCrescent: "Lua minguante",
  blood: "Lua de sangue",
};

/** Icon art, one per phase (GPT task: docs/GPT-TODO.md "Moon phase icons"). */
export const moonPhaseIcon = (phase: MoonPhase): string =>
  phase === "full" ? "/game/ui/moon/moon-full-v2.png" : `/game/ui/moon/moon-${phase}.png`;

/** Days since day 1 (day 0, a fresh test save, counts as day 1). */
const dayIndex = (gameClock: number) => Math.max(0, Math.floor(gameClock) - 1);

export function moonPhaseOf(gameClock: number): MoonPhase {
  const d = dayIndex(gameClock);
  const phase = MOON_PHASES[d % MOON_CYCLE_DAYS];
  const cycle = Math.floor(d / MOON_CYCLE_DAYS);
  return phase === "full" && cycle % BLOOD_MOON_EVERY === BLOOD_MOON_EVERY - 1 ? "blood" : phase;
}

/** Days until the next `phase` (0 on that day). */
export function daysToMoon(gameClock: number, phase: MoonPhase): number {
  for (let ahead = 0; ahead <= MOON_CYCLE_DAYS * BLOOD_MOON_EVERY; ahead++) {
    if (moonPhaseOf(dayIndex(gameClock) + 1 + ahead) === phase) return ahead;
  }
  return -1;
}

/** Night lighting for a phase: the moonlight's strength (× the night preset's), and for the
 * blood moon its red colour plus a red-tinted sky and backdrop. */
export function moonlightFor(phase: MoonPhase): { strength: number; color?: string; sky?: string; background?: string } {
  if (phase === "blood") return { strength: 1.35, color: "#ff4a3a", sky: "#5a1e26", background: "#2a0a10" };
  return { strength: 0.2 + 1.1 * moonIllumination(phase).lit };
}

/** Lit share of the disc, 0 (new) … 1 (full and blood), and which side is lit — for the placeholder icon. */
export function moonIllumination(phase: MoonPhase): { lit: number; waxing: boolean } {
  const i = phase === "blood" ? MOON_PHASES.indexOf("full") : MOON_PHASES.indexOf(phase);
  return { lit: (1 - Math.cos((i / MOON_CYCLE_DAYS) * 2 * Math.PI)) / 2, waxing: i <= 4 };
}
