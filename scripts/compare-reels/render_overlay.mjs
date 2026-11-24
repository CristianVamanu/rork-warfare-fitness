// node render_overlay.mjs <workdir> <comp>  -> ov/o_00001.png (transparent) + layout.json
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs'; import path from 'path';
const [dir, comp] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('file://' + path.resolve(dir, 'video.html') + '?static&overlay&c=' + comp); await p.waitForTimeout(500);
const dur = await p.evaluate(() => window.DUR), fps = await p.evaluate(() => window.FPS);
fs.mkdirSync(path.join(dir, 'ov'), { recursive: true });
const layout = [];
for (let i = 0; i < Math.round(dur * fps); i++) {
  const t = i / fps;
  layout.push(await p.evaluate((t) => { window.render(t); return window.figLayout(t); }, t));
  await p.screenshot({ path: path.join(dir, 'ov', `o_${String(i + 1).padStart(5, '0')}.png`), omitBackground: true });
}
fs.writeFileSync(path.join(dir, 'layout.json'), JSON.stringify(layout));
await b.close();
