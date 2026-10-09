// Draw order shared by the 3D map's layers (three.js renderOrder; higher draws later).
//
// Ember's mist sheets (ThreeAtmosphere: Névoa 2/3/4 at 1.5-1.7) draw by order with no depth
// test: over the ground, then the unit and decoration cards over them, so a flat mist sheet
// never slices a standing card in two. Its wisps (13-14), the grid (6) and fog of war (100)
// come after.
export const CARD_RENDER_ORDER = 2;
