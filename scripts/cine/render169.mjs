// node render169.mjs <dir with promo169.html + assets> <outdir> [from] [to]   (env DSF, default 2 = 3840x2160)
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright'); import fs from 'fs';
const [dir, out, from = '0', to = ''] = process.argv.slice(2), DSF = +(process.env.DSF || 2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DSF });
await p.goto(`file://${dir}/promo169.html`, { waitUntil: 'load' }); await p.waitForFunction('window.READY===true');
const n = Math.round((await p.evaluate(() => window.DUR)) * 30), end = to ? Math.min(n, +to) : n;
for (let i = +from; i < end; i++) { await p.evaluate(t => window.setT(t), i / 30); await p.screenshot({ path: `${out}/o_${String(i + 1).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 96 }); }
await b.close(); console.log('frames', +from, end);
