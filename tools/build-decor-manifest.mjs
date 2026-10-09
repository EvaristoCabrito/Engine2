// Lists the decoration art files on disk (public/game/decorations) into src/world/decor-files.json,
// so the engine can apply Ember's side/facing rules without probing URLs.  node tools/build-decor-manifest.mjs
import { readdirSync, writeFileSync } from 'node:fs';
const files = readdirSync('C:/Engine2/public/game/decorations').filter(f => /\.(png|webp)$/i.test(f)).sort();
writeFileSync('C:/Engine2/src/world/decor-files.json', JSON.stringify(files, null, 0));
console.log(`${files.length} decoration files`);
