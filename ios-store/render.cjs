// node render.cjs <dir with shots.html + the app screens + kanit font> <outdir>   → 6 PNGs, 1290x2796
const { chromium } = require('playwright');
(async () => { const [dir, out] = process.argv.slice(2); const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1290, height: 2796 } });
  for (let i = 0; i < 6; i++) { await p.goto(`file://${dir}/shots.html?i=${i}`); await p.waitForFunction('window.READY===true'); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/WF_AppStore_${i + 1}.png` }); }
  await b.close(); })();
