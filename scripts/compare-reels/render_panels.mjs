// (env PAGE=workout.html renders the workout reel) node render_panels.mjs <dir with panels.html + assets> <layout> <outdir> "<extra query>"   (env DSF, DUR)
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright'); import fs from 'fs';
const [dir, l, out, q = ''] = process.argv.slice(2), DSF = +(process.env.DSF || 2), DUR = +(process.env.DUR || 15);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: DSF });
await p.goto(`file://${dir}/${process.env.PAGE || "panels.html"}?l=${l}&v=1&${q}`); await p.waitForTimeout(800);
for (let i = 0; i < DUR * 30; i++) { await p.evaluate(t => window.setT(t), i / 30); await p.screenshot({ path: `${out}/o_${String(i + 1).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 95 }); }
await b.close();
