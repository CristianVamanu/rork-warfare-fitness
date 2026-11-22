import { createRequire } from 'module';
const sharp = createRequire('/home/user/rork-warfare-fitness/')('sharp');
const R = '/home/user/rork-warfare-fitness/public';
const W = 1170, H = 1380;
// the warrior from the battlefield art, big, filling the right side from the top
// The warrior on the right half, head near the top right like the reference.
const bf = R + '/landing/hero-battlefield.webp';
const sky = await sharp(bf).extract({ left: 1900, top: 0, width: 852, height: 1000 }).resize(W, H).blur(6).modulate({ brightness: 1.2 }).toBuffer();
const war0 = await sharp(bf).extract({ left: 1000, top: 40, width: 1000, height: 1400 }).resize({ height: 1300 }).toBuffer();
const w0 = (await sharp(war0).metadata()).width;
const L = 380, CW = Math.min(w0, W - L);
const war = await sharp(war0).extract({ left: 0, top: 0, width: CW, height: 1300 }).toBuffer();
const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="1300"><defs><linearGradient id="m" x1="0" x2="1"><stop offset="0" stop-color="#000"/><stop offset=".22" stop-color="#fff"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#m)"/></svg>`)).png().extractChannel(0).toBuffer();
const warM = await sharp(war).joinChannel(mask).png().toBuffer();
const base = await sharp(sky).composite([{ input: warM, left: L, top: 0 }]).png().toBuffer();
const wm = { width: w0 };
const glow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
<radialGradient id="a" cx=".9" cy=".25" r=".55"><stop offset="0" stop-color="#ff8a14" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<radialGradient id="b" cx=".35" cy=".05" r=".55"><stop offset="0" stop-color="#ffb04a" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<radialGradient id="c" cx=".7" cy=".75" r=".5"><stop offset="0" stop-color="#ff7a00" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
</defs><rect width="100%" height="100%" fill="url(#a)"/><rect width="100%" height="100%" fill="url(#b)"/><rect width="100%" height="100%" fill="url(#c)"/></svg>`);
const mtn = await sharp(R + '/home/mountain.webp').resize(W, Math.round(W / 2)).modulate({ brightness: 1.45, saturation: 1.35 }).toBuffer();
const out = await sharp(base).modulate({ brightness: 1.75, saturation: 1.2 }).composite([{ input: await sharp(glow).png().toBuffer(), blend: 'screen' }, { input: mtn, top: 640, left: 0, blend: 'screen' }]).png().toBuffer();
const fade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset=".7" stop-color="#080808" stop-opacity="0"/><stop offset=".9" stop-color="#080808"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#f)"/></svg>`);
await sharp(out).composite([{ input: await sharp(fade).png().toBuffer() }]).webp({ quality: 84 }).toFile(R + '/landing/hero-mobile.webp');
await sharp(R + '/landing/hero-mobile.webp').resize(390).jpeg().toFile('mobchk.jpg');
console.log('ok', wm.width);
