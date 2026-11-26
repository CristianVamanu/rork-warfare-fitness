// node render3d.mjs <served-url-of-scene.html> <outdir> <key> [from] [to]   (env DSF)
// Serve scripts/reels3d over http first (python3 -m http.server), with three
// installed there (npm i three), plus the two fonts and logo-wf.webp.
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright'); import fs from 'fs';
const [url, out, key, from = '0', to = ''] = process.argv.slice(2), DSF = +(process.env.DSF || 2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: DSF });
await p.goto(`${url}?c=${key}&dsf=${DSF}`); await p.waitForFunction('window.READY===true', { timeout: 120000 });
const n = Math.round((await p.evaluate(() => window.DUR)) * 30), end = to ? Math.min(n, +to) : n;
for (let i = +from; i < end; i++) { await p.evaluate(t => window.setT(t), i / 30); await p.screenshot({ path: `${out}/o_${String(i + 1).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 95 }); }
await b.close(); console.log('frames', +from, end, 'of', n);
