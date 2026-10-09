// Ember tile-variant numbering (from Ember src/game/assets.ts, unchanged). Data only: maps store a
// variant index per hex, and these keep saved indices valid. The old tile art itself is not used.
import type { TerrainId } from "./types";

// Number of art variants available per terrain, e.g. plains001.png / plains002.png.
// Index 0 (the "001" file) is what every mission renders with unless it names a
// different variant in Mission.tileVariants — keep it as the tile that's safe
// for existing maps.
export const TILE_VARIANT_COUNT: Record<TerrainId, number> = {
  plains: 48,
  woods: 12,
  ruins: 8,
  water: 24,
  ember: 6,
  hill: 5,
  flame: 4,
  column: 3,
  nave: 19,
  barricade: 1,
  door: 1,
  void: 1,
  // The Icelands section keeps legacy snow variants first, then the 12 supplied
  // cold-ground tiles (snow004–snow015) so saved maps retain their old indices.
  snow: 21,
};

/** Append-only terrain set: previous saved-map indices keep their exact artwork. */
export const HEX_GROUND_001: Partial<Record<TerrainId, { variant: number; file: string }>> = {
  water: { variant: 22, file: "hex-ground-001-agua" },
  woods: { variant: 9, file: "hex-ground-001-bosque" },
  ember: { variant: 5, file: "hex-ground-001-brasa" },
  flame: { variant: 3, file: "hex-ground-001-chama" },
  plains: { variant: 38, file: "hex-ground-001-city" },
  hill: { variant: 4, file: "hex-ground-001-colina" },
  column: { variant: 2, file: "hex-ground-001-coluna" },
  nave: { variant: 2, file: "hex-ground-001-laje" },
  ruins: { variant: 7, file: "hex-ground-001-ruinas" },
  snow: { variant: 15, file: "hex-ground-001-neve" },
};

/** The art file a tile variant paints with, without path or cache-buster — "woods002".
 * Two variants of the same terrain differ only in art, so this is the only way to tell
 * from a painted map which of them a cell is actually using. */
export function tileVariantName(id: TerrainId, variant: number): string {
  if (id === "plains" && variant === 46) return "hex-ground-013-farm-soil";
  if (id === "plains" && variant === 47) return "hex-ground-006-cave-earth";
  if (id === "nave" && variant === 18) return "hex-ground-013-farm-planks";
  if (id === "woods" && (variant === 10 || variant === 11)) return `hex-ground-011-forest-${variant === 10 ? "dark" : "needles"}`;
  if (id === "snow" && variant >= 18 && variant <= 20) return `hex-ground-010-snow-${["wind", "crust", "powder"][variant - 18]}`;
  if (id === "plains" && variant >= 43 && variant <= 47) return `hex-ground-009-${["plains", "meadow", "prairie"][variant - 43]}-photographic`;
  if (id === "nave" && variant >= 15 && variant <= 17) return `hex-ground-006-cave-${["earth", "cracked", "moss"][variant - 15]}`;
  if (id === "water" && variant === 23) return "hex-ground-006-cave-water";
  if (id === "nave" && variant === 13) return "hex-ground-004-cave-cracked";
  if (id === "nave" && variant === 14) return "hex-ground-004-cave-moss";
  if (id === "nave" && variant === 12) return "hex-ground-004-cave-basalt";
  if (id === "nave" && variant === 10) return "hex-ground-003-cave-slate";
  if (id === "nave" && variant === 11) return "hex-ground-003-cave-scree";
  if (id === "nave" && variant === 9) return "hex-ground-002-cave-crystals";
  if (id === "nave" && variant >= 3 && variant <= 8) {
    return `hex-ground-001-${["temple-limestone", "temple-basalt", "dungeon-flagstone", "dungeon-brick", "cave", "cave-crystals"][variant - 3]}`;
  }
  if (id === "plains" && variant === 41) return "hex-ground-001-high-grass";
  if (id === "plains" && variant === 42) return "hex-ground-001-dark-plains";
  if (id === "snow" && variant === 16) return "hex-ground-001-tundra";
  if (id === "snow" && variant === 17) return "hex-ground-001-tundra-snow";
  if (id === "plains" && variant === 39) return "hex-ground-001-planicie";
  if (id === "plains" && variant === 40) return "hex-ground-001-madeira";
  const ground = HEX_GROUND_001[id];
  if (ground && variant === ground.variant) return ground.file;
  // New ground materials are inserted ahead of the legacy plains without renaming
  // their on-disk files, so saved maps keep their original art available.
  if (id === "plains") {
    if (variant === 0) return "plains016";
    if (variant === 1) return "plains015";
    if (variant === 2) return "plains001";
    if (variant === 15) return "plains018";
    // Keep the old saved-map index valid while retiring that City tile.
    if (variant === 22) return "plains024";
    // 16-20 are the five existing ground variants; 21-37 are the City indices, with 22 retired.
    // These ranges continue the numbered art files at plains019.
    if (variant >= 16 && variant <= 37) return `plains${String(variant + 3).padStart(3, "0")}`;
    return `plains${String(variant).padStart(3, "0")}`;
  }
  if (id === "water" && variant === 0) return "water023";
  if (id === "woods") {
    if (variant === 0) return "woods005";
    if (variant === 1) return "woods006";
    if (variant === 6) return "woods007";
    if (variant === 7) return "woods009";
    if (variant === 8) return "woods010";
    return `woods${String(variant - 1).padStart(3, "0")}`;
  }
  if (id === "hill") return `hill${String(variant + 4).padStart(3, "0")}`;
  if (id === "ruins") {
    if (variant === 0) return "ruins005";
    if (variant <= 4) return `ruins${String(variant).padStart(3, "0")}`;
    return `ruins${String(variant + 1).padStart(3, "0")}`;
  }
  return `${id}${String(variant + 1).padStart(3, "0")}`;
}

export function isHexGroundVariant(id: TerrainId, variant: number): boolean {
  return id !== "column" && ((id === "woods" && (variant === 10 || variant === 11)) || (id === "water" && variant === 23) || HEX_GROUND_001[id]?.variant === variant || (id === "plains" && variant >= 39 && variant <= 45) || (id === "snow" && (variant >= 16 && variant <= 20)) || (id === "nave" && variant >= 3 && variant <= 18));
}
