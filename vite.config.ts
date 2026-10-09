import { defineConfig, type Plugin } from 'vite';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// @ts-expect-error JS plugin alongside the TS vite config
import { mapSavePlugin } from './tools/map-save-plugin.mjs';

// Map files for the editor, served by the dev server (not bundled): Ember's originals (maps/ember, never
// written) and Engine2 saves (maps/e2). Saving always appends the next serial — nothing is ever overwritten.
const MAP_DIRS = { ember: resolve('maps/ember'), e2: resolve('maps/e2') } as const;
const FILE_RE = /^([a-z0-9][a-z0-9-]*?)-?(\d{3})\.json$/;

function mapsPlugin(): Plugin {
  return {
    name: 'engine2-maps',
    configureServer(server) {
      server.middlewares.use('/__maps', (req, res) => {
        const best = new Map<string, { id: string; serial: number; file: string; source: string }>();
        for (const [source, dir] of Object.entries(MAP_DIRS)) {
          if (!existsSync(dir)) continue;
          for (const file of readdirSync(dir)) {
            const m = FILE_RE.exec(file);
            if (!m) continue;
            const id = m[1], serial = Number(m[2]), cur = best.get(id);
            if (!cur || serial > cur.serial) best.set(id, { id, serial, file, source });
          }
        }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify([...best.values()].sort((a, b) => a.id.localeCompare(b.id))));
      });
      server.middlewares.use('/__map/', (req, res) => {
        const [source, file] = decodeURIComponent((req.url ?? '').replace(/^\//, '')).split('/');
        const dir = MAP_DIRS[source as keyof typeof MAP_DIRS];
        if (!dir || !file || !FILE_RE.test(file) || !existsSync(resolve(dir, file))) { res.statusCode = 404; res.end(); return; }
        res.setHeader('content-type', 'application/json');
        res.end(readFileSync(resolve(dir, file)));
      });
      server.middlewares.use('/__save-map', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const draft = JSON.parse(body);
            const id = String(draft.id);
            if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('bad map id');
            mkdirSync(MAP_DIRS.e2, { recursive: true });
            let max = 0;
            for (const dir of Object.values(MAP_DIRS)) {
              if (!existsSync(dir)) continue;
              for (const f of readdirSync(dir)) { const m = FILE_RE.exec(f); if (m && m[1] === id) max = Math.max(max, Number(m[2])); }
            }
            const serial = max + 1, file = `${id}${String(serial).padStart(3, '0')}.json`;
            writeFileSync(resolve(MAP_DIRS.e2, file), JSON.stringify({ serial, savedAt: Date.now(), draft }, null, 2));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ id, serial, file, source: 'e2' }));
          } catch (e) { res.statusCode = 400; res.end(String(e)); }
        });
      });
    },
  };
}

// Engine2's own dev server. Port 5300 only — never Ember's 8080.
export default defineConfig({
  // React + Tailwind: Ember's own menus are built with them and are brought over as-is.
  plugins: [mapsPlugin(), mapSavePlugin(), react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify('0.034') },
  // `@/` is Ember's src alias; Ember's shared UI pieces live in src/ember-ui.
  resolve: { alias: { '@': resolve('src/ember-ui') } },
  server: {
    host: '127.0.0.1', port: 8080, strictPort: true,
    open: '/',
    // Huge asset, output and map folders are never edited live through the bundler; watching thousands of
    // files crashed the watcher (EBUSY while copying art in) and made it miss real source edits.
    // Map saves (maps/ember) are watched only so Ember's save plugin can refresh the map store; its own
    // config writes are ignored, exactly as in Ember, so saving never reloads the editor.
    watch: { ignored: ['**/public/game/**', '**/shots/**', '**/node_modules/**', '**/maps/e2/**', '**/src/campaign/map-order.json', '**/src/campaign/location-order.json', '**/src/campaign/map-slots.json'] },
  },
  build: { target: 'esnext', rollupOptions: { input: { main: resolve('index.html'), game: resolve('game.html'), editor: resolve('editor.html'), diorama: resolve('diorama.html'), vfx: resolve('vfx.html') } } },
});
