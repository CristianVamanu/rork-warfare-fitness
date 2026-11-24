// node render.mjs <workdir> [t1,t2,...|all] [comp]   -> frames/f_00001.jpg ... (or stills)
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs'; import path from 'path';
const [dir, only] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('file://' + path.resolve(dir, 'video.html') + '?static&c=' + (process.argv[4] || 'squat_press')); await p.waitForTimeout(500);
const dur = await p.evaluate(() => window.DUR), fps = await p.evaluate(() => window.FPS);
const times = only && only !== 'all' ? only.split(',').map(Number) : Array.from({ length: Math.round(dur * fps) }, (_, i) => i / fps);
fs.mkdirSync(path.join(dir, only && only !== 'all' ? 'stills' : 'frames'), { recursive: true });
for (let i = 0; i < times.length; i++) {
  await p.evaluate((t) => window.render(t), times[i]);
  await p.screenshot({ path: path.join(dir, only && only !== 'all' ? 'stills' : 'frames', only && only !== 'all' ? `t${times[i]}.jpg` : `f_${String(i + 1).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
}
await b.close();
