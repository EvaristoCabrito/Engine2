// Draw order shared by the 3D map's layers (three.js renderOrder; higher draws later).
//
// Ember's mist sheets (ThreeAtmosphere: Névoa 2/3/4 at 1.5-1.7) draw by order with no depth
// test: over the ground, then the unit and decoration cards over them, so a flat mist sheet
// never slices a standing card in two. Terrain fog draws after the grid (6), before cards (7).
// Cards already receive the battle's visibility/shading rules. Drawing them after terrain fog
// prevents their translucent edge pixels writing depth that punches bright holes in the fog.
export const FOG_RENDER_ORDER = 6.5;
export const CARD_RENDER_ORDER = 7;
