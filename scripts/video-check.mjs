#!/usr/bin/env node
/**
 * Checks every exercise demo video the LIVE programs point at, and says why
 * each one would or would not play in the session screen.
 *
 *   node --env-file=.env.production scripts/video-check.mjs
 *       → read-only report.
 *
 *   node --env-file=.env.production scripts/video-check.mjs --fix
 *       → for every exercise whose stored URL is dead but whose name matches
 *         a current exercise-library entry, rewrite the program's videoUrl to
 *         the library's URL. Prints each change. Touches nothing else.
 *
 * WHY. Programs snapshot the video URL into the exercise at save time (the
 * builder resolves name → library URL once and stores the string). If an
 * admin later replaces or removes that library video, the old object is
 * deleted from storage but the program still carries the old URL, so that one
 * exercise silently stops playing while the rest of the program is fine. The
 * session screen also loads clips with crossOrigin="anonymous", so a host
 * that answers without an Access-Control-Allow-Origin header will not play
 * either, even though the same URL opens fine in a new tab.
 *
 * Each URL is fetched once with a 1-byte Range request from the app's origin,
 * exactly the shape the <video> element sends.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Run this from /root/rork-warfare-fitness with:');
  console.error('  node --env-file=.env.production scripts/video-check.mjs');
  process.exit(1);
}
const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com').replace(/\/$/, '');
const fix = process.argv.includes('--fix');

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// ── Library: what SHOULD be playing ────────────────────────────────────────
const libSnap = await db.collection('exerciseLibrary').get();
const library = libSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const libByUrl = new Map(library.map((e) => [e.videoUrl, e]));
const libByName = new Map();
for (const e of library) {
  for (const n of [e.name, ...(e.aliases ?? [])]) if (n) libByName.set(norm(n), e);
}

// ── Programs: what IS stored ───────────────────────────────────────────────
const progSnap = await db.collection('programs').get();
const refs = []; // { program, programId, path, name, url }
for (const doc of progSnap.docs) {
  const p = doc.data();
  const phases = p.phases?.length ? p.phases : [{ label: '', schedule: p.schedule ?? [] }];
  phases.forEach((ph, pi) => (ph.schedule ?? []).forEach((day, di) => (day.exercises ?? []).forEach((ex, ei) => {
    refs.push({ programId: doc.id, program: p.name ?? doc.id, phased: !!p.phases?.length, pi, di, ei, name: ex.name, url: ex.videoUrl || '' });
  })));
  (p.exercises ?? []).forEach((ex, ei) => refs.push({ programId: doc.id, program: p.name ?? doc.id, flat: true, ei, name: ex.name, url: ex.videoUrl || '' }));
}

// ── Probe every distinct URL once ──────────────────────────────────────────
const urls = [...new Set(refs.map((r) => r.url).filter(Boolean))];
const probe = new Map();
await Promise.all(urls.map(async (url) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0', Origin: origin }, signal: ctrl.signal, redirect: 'follow' });
    probe.set(url, {
      status: res.status,
      acao: res.headers.get('access-control-allow-origin'),
      type: res.headers.get('content-type') ?? '',
      ranges: res.headers.get('accept-ranges') ?? res.headers.get('content-range') ?? '',
    });
  } catch (err) {
    probe.set(url, { status: 0, error: err?.name === 'AbortError' ? 'timeout' : String(err?.message ?? err) });
  } finally { clearTimeout(t); }
}));

function verdict(url) {
  const r = probe.get(url);
  if (!r) return { ok: false, why: 'not probed' };
  if (r.status === 0) return { ok: false, why: `unreachable (${r.error})` };
  if (r.status === 404 || r.status === 403 || r.status === 410) return { ok: false, why: `DEAD — host answers ${r.status}${libByUrl.has(url) ? '' : ' (URL is no longer in the exercise library)'}` };
  if (r.status >= 400) return { ok: false, why: `host answers ${r.status}` };
  if (!r.acao || (r.acao !== '*' && r.acao !== origin)) return { ok: false, why: `NO CORS — session loads clips with crossOrigin="anonymous"; host sent Access-Control-Allow-Origin: ${r.acao ?? '(none)'}` };
  if (!/^video\//.test(r.type)) return { ok: false, why: `content-type is "${r.type}", not video/*` };
  return { ok: true, why: `${r.status} ${r.type}` };
}

// ── Report ─────────────────────────────────────────────────────────────────
console.log(`\n${progSnap.size} programs, ${refs.length} exercise slots, ${urls.length} distinct video URLs, ${library.length} library entries. Origin used: ${origin}\n`);

const hosts = {};
for (const u of urls) { try { hosts[new URL(u).host] = (hosts[new URL(u).host] ?? 0) + 1; } catch { hosts['(bad url)'] = (hosts['(bad url)'] ?? 0) + 1; } }
console.log('Hosts:', Object.entries(hosts).map(([h, n]) => `${h} ×${n}`).join(', '));

const broken = urls.filter((u) => !verdict(u).ok);
console.log(`\n${urls.length - broken.length} URLs play, ${broken.length} do not.\n`);

const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
const changes = [];
for (const u of broken) {
  const v = verdict(u);
  const users = refs.filter((r) => r.url === u);
  console.log(`✗ ${v.why}`);
  console.log(`  ${u}`);
  for (const r of users) {
    const lib = libByName.get(norm(r.name));
    const fixable = lib?.videoUrl && lib.videoUrl !== u && verdict(lib.videoUrl).ok !== false;
    console.log(`    ${pad(r.program, 28)} ${pad(r.name, 30)} ${fixable ? '→ library has a working "' + lib.name + '"' : (lib ? '(library entry has the same dead URL)' : '(no library entry by this name)')}`);
    if (fixable) changes.push({ ...r, to: lib.videoUrl });
  }
}

// Exercises with NO url at all whose name is in the library: the session shows
// the plain "i" button for these — nothing plays, which reads as "broken".
const missing = refs.filter((r) => !r.url && libByName.get(norm(r.name)));
if (missing.length) {
  console.log(`\n${missing.length} exercise slots have NO videoUrl stored but the library has a clip by that name:`);
  for (const r of missing) {
    const lib = libByName.get(norm(r.name));
    console.log(`    ${pad(r.program, 28)} ${pad(r.name, 30)} → "${lib.name}"`);
    if (verdict(lib.videoUrl).ok !== false || !probe.has(lib.videoUrl)) changes.push({ ...r, to: lib.videoUrl });
  }
}

const name = process.argv.find((a) => a.startsWith('--name='))?.slice(7);
if (name) {
  console.log(`\nEvery slot named like "${name}":`);
  for (const r of refs.filter((r) => norm(r.name).includes(norm(name)))) {
    const v = r.url ? verdict(r.url) : { ok: false, why: 'no videoUrl stored' };
    console.log(`  ${v.ok ? '✓' : '✗'} ${pad(r.program, 28)} ${pad(r.name, 30)} ${r.url || '(none)'}  ${v.why}`);
  }
  const lib = [...libByName.entries()].filter(([k]) => k.includes(norm(name))).map(([, e]) => e);
  console.log(`  library entries matching: ${[...new Set(lib.map((e) => `${e.name} → ${e.videoUrl}`))].join(' | ') || 'none'}`);
}

if (!changes.length) { console.log('\nNothing to fix automatically.\n'); process.exit(0); }

console.log(`\n${changes.length} slot(s) can be pointed at the current library clip${fix ? ' — applying' : ' — re-run with --fix to apply'}:`);
if (!fix) { for (const c of changes) console.log(`    ${pad(c.program, 28)} ${pad(c.name, 30)} → ${c.to}`); console.log(''); process.exit(0); }

const byProgram = new Map();
for (const c of changes) { if (!byProgram.has(c.programId)) byProgram.set(c.programId, []); byProgram.get(c.programId).push(c); }
for (const [programId, cs] of byProgram) {
  const ref = db.collection('programs').doc(programId);
  const p = (await ref.get()).data();
  for (const c of cs) {
    const ex = c.flat ? p.exercises[c.ei] : (p.phases?.length ? p.phases[c.pi].schedule[c.di].exercises[c.ei] : p.schedule[c.di].exercises[c.ei]);
    if (!ex || ex.name !== c.name) { console.log(`    skipped ${c.program} / ${c.name} — document changed underneath`); continue; }
    ex.videoUrl = c.to;
    console.log(`    ${pad(c.program, 28)} ${pad(c.name, 30)} → ${c.to}`);
  }
  const update = p.phases?.length ? { phases: p.phases } : (p.schedule?.length ? { schedule: p.schedule } : {});
  if (p.exercises?.length) update.exercises = p.exercises;
  await ref.update(update);
}
console.log('\nDone. Members pick the change up on their next session load (the session screen re-fetches the program in the background even when resuming a draft).\n');
process.exit(0);
