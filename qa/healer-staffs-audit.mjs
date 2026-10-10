// Render the real blacksmith's SSR output with the production CSS and actual PNGs.
// All browser requests are fulfilled from disk; this starts no preview/game server.
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { HEALER_BLUNT_STAFF_ALL } from '../src/ember/healerBluntStaffs.ts';

const root = process.cwd();
const output = path.join(root, 'artifacts/healer-blunt-staffs-high-tier-2026-10-09');
const styles = (await readdir(path.join(root, 'dist/assets'))).filter(file => file.endsWith('.css'));
const css = (await Promise.all(styles.map(file => readFile(path.join(root, 'dist/assets', file), 'utf8')))).join('\n');
const markup = {};
for (const kind of ['healer', 'mage']) markup[kind] = await readFile(path.join(output, `blacksmith-${kind}.html`), 'utf8');
const html = body => `<!doctype html><html><head><meta charset="utf-8"><base href="http://engine2.test/"><style>${css}</style></head><body>${body}</body></html>`;
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'engine2.test') { await route.fulfill({ status: 204, body: '' }); return; }
    const file = path.resolve(root, 'public', `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(path.join(root, 'public') + path.sep)) { await route.fulfill({ status: 403, body: '' }); return; }
    try { await route.fulfill({ status: 200, contentType: mime[path.extname(file)] ?? 'application/octet-stream', body: await readFile(file) }); }
    catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await page.setContent(html(markup.healer), { waitUntil: 'load' });
  await page.evaluate(async () => { await Promise.all([...document.images].map(img => img.decode().catch(() => {}))); });
  const rendered = await page.locator('img[src*="bastao-curandeiro-"]').evaluateAll(images => images.map(img => ({ src: img.getAttribute('src'), width: img.naturalWidth, height: img.naturalHeight })));
  if (rendered.length !== HEALER_BLUNT_STAFF_ALL.length || rendered.some(img => img.width === 0)) throw new Error('Blacksmith did not load the complete staff family');
  const rows = await page.locator('img[src*="bastao-curandeiro-"]').evaluateAll(images => images.map(img => img.closest('div.flex.items-center').parentElement.outerHTML));
  await page.screenshot({ path: path.join(output, 'blacksmith-healer.png') });
  const gallery = `<main class="bg-bg text-fg p-4" style="width:544px"><h1 class="font-display text-2xl mb-4">Cajados contundentes — níveis 1–30</h1><div class="max-w-lg flex flex-col gap-2">${rows.join('')}</div></main>`;
  await page.setContent(html(gallery), { waitUntil: 'load' });
  await page.evaluate(async () => { await Promise.all([...document.images].map(img => img.decode().catch(() => {}))); });
  await page.locator('main').screenshot({ path: path.join(output, 'staff-series.png') });
  await writeFile(path.join(output, 'staff-series.html'), html(gallery));
  const eliteRows = rows.filter(row => /bastao-curandeiro-(1[0-7])-/.test(row));
  if (eliteRows.length !== 8) throw new Error('Blacksmith is missing a new upper-tier staff');
  const elite = `<main class="bg-bg text-fg p-4" style="width:544px"><h1 class="font-display text-2xl mb-4">Cajados reforçados — níveis 20–30</h1><div class="max-w-lg flex flex-col gap-2">${eliteRows.join('')}</div></main>`;
  await page.setContent(html(elite), { waitUntil: 'load' });
  await page.evaluate(async () => { await Promise.all([...document.images].map(img => img.decode().catch(() => {}))); });
  await page.locator('main').screenshot({ path: path.join(output, 'high-tier-staffs.png') });
  await writeFile(path.join(output, 'high-tier-staffs.html'), html(elite));
  await page.setContent(html(markup.mage), { waitUntil: 'load' });
  await page.evaluate(async () => { await Promise.all([...document.images].map(img => img.decode().catch(() => {}))); });
  await page.screenshot({ path: path.join(output, 'blacksmith-mage.png') });
  const alpha = [];
  for (const image of rendered) {
    const file = path.join(root, 'public', image.src);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let zero = 0, visible = 0;
    for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) zero++; if (data[i] >= 240) visible++; }
    alpha.push({ file: image.src, width: info.width, height: info.height, zeroAlphaPixels: zero, zeroAlphaPercent: +(100 * zero / (info.width * info.height)).toFixed(2), visiblePixels: visible });
  }
  const report = { rendered, alpha, errors, noServerStarted: true };
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
