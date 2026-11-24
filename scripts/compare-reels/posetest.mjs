import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
import path from 'path';
const [dir, names, out] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('file://' + path.resolve(dir, 'video.html') + '?static'); await p.waitForTimeout(400);
await p.evaluate((n) => window.poseSheet(n), names.split(','));
await p.screenshot({ path: out }); await b.close();
