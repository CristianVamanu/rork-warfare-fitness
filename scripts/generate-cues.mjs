#!/usr/bin/env node
/**
 * Writes the missing "how to perform" cue for every exercise in every live
 * program, using the same OpenAI key the app already uses.
 *
 *   node --env-file=.env.production scripts/generate-cues.mjs
 *       → DRY RUN. Generates the cues, writes them to a review file, changes
 *         nothing in the database.
 *
 *   node --env-file=.env.production scripts/generate-cues.mjs --apply
 *       → same, then writes them into the programs.
 *
 *   ... --program "Calisthenics"   only that program (substring, case-insensitive)
 *   ... --limit 20                 only the first 20 distinct exercises
 *   ... --overwrite                also replace cues that already exist
 *   ... --model gpt-4o             a different model (default: OPENAI_MODEL or gpt-4o-mini)
 *
 * WHAT A CUE IS. The `notes` field on an exercise. The workout screen shows it
 * behind the ⓘ button next to the exercise name; with nothing there a member
 * taps it and reads "No extra notes for this exercise", which is a polite way
 * of showing them nothing. Coverage was measured at 9% on Calisthenics and
 * 32% on Burn Ops, against 100% on SAS Selection — so the app coaches some
 * members and hands the others a list.
 *
 * WHY IT GENERATES PER NAME, NOT PER SLOT. "Push-Ups" appears ~50 times across
 * the catalogue. Generating once per distinct name and applying everywhere
 * costs a fraction as much, and means the same exercise never gets two
 * different explanations in two different programs.
 *
 * EXISTING CUES ARE NOT TOUCHED unless --overwrite is passed. Some of what is
 * already in there is not technique at all but a target the author wrote
 * deliberately ("Build toward 30 in one set — the Commando PT Test standard"),
 * and overwriting that would be destroying real work.
 *
 * GENERATED TEXT IS CACHED in Firestore at exerciseCues/{normalized name}, so
 * a re-run costs nothing for names already done, and an edit made there is
 * kept rather than regenerated.
 *
 * REVIEW. Every run writes cues-for-review.txt. Reading ~100 one-line cues
 * takes a few minutes and is worth doing: this text tells people how to move
 * a loaded barbell.
 */

import { writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash, createDecipheriv } from 'node:crypto';
import OpenAI from 'openai';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : (argv[i + 1] ?? d); };
const apply = has('--apply');
const overwrite = has('--overwrite');
const onlyProgram = val('--program', null);
const limit = Number(val('--limit', Infinity)) || Infinity;

const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Run this from /root/rork-warfare-fitness with:');
  console.error('  node --env-file=.env.production scripts/generate-cues.mjs');
  process.exit(1);
}
initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

// The OpenAI key may be in the env or, encrypted, in Firestore — the admin
// panel writes to the latter. Same resolution order the app uses.
async function getSecret(name) {
  if (process.env[name]) return process.env[name];
  const snap = await db.collection('system').doc('secrets').get();
  const p = snap.exists ? snap.data()?.[name] : null;
  if (!p?.ciphertext || !process.env.ENCRYPTION_KEY) return '';
  try {
    const key = createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
    d.setAuthTag(Buffer.from(p.authTag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(p.ciphertext, 'base64')), d.final()]).toString('utf8');
  } catch { return ''; }
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/** A cue this short is a label, not an explanation — treat it as missing. */
const MIN_USEFUL = 25;
const isThin = (notes) => !notes || String(notes).trim().length < MIN_USEFUL;

// ── Collect the slots that need a cue ──────────────────────────────────────
const progSnap = await db.collection('programs').get();
const docs = new Map();
const slots = [];
for (const doc of progSnap.docs) {
  const data = doc.data();
  const label = data.name ?? doc.id;
  if (onlyProgram && !label.toLowerCase().includes(onlyProgram.toLowerCase())) continue;
  const entry = { ref: doc.ref, data, dirty: false };
  docs.set(doc.ref.path, entry);
  const eat = (list) => (list ?? []).forEach((ex) => {
    if (!ex?.name) return;
    if (!overwrite && !isThin(ex.notes)) return;
    slots.push({ program: label, ex, entry, name: ex.name, equipment: data.equipment ?? '' });
  });
  (data.phases ?? []).forEach((ph) => (ph.schedule ?? []).forEach((d) => eat(d.exercises)));
  (data.schedule ?? []).forEach((d) => eat(d.exercises));
  eat(data.exercises);
}

if (!slots.length) {
  console.log('\nEvery exercise already has a cue. Nothing to do.\n');
  process.exit(0);
}

const names = [...new Set(slots.map((s) => s.name))];
console.log(`\n${slots.length} exercise slot(s) without a usable cue, across ${docs.size} program(s).`);
console.log(`${names.length} distinct exercise name(s) — one cue each, applied everywhere it appears.`);

// ── Reuse anything generated (or hand-edited) before ────────────────────────
const cues = new Map();
const cueSnap = await db.collection('exerciseCues').get();
for (const d of cueSnap.docs) if (d.data()?.cue) cues.set(d.id, d.data().cue);
const needed = names.filter((n) => !cues.has(norm(n))).slice(0, limit === Infinity ? undefined : limit);
console.log(`${names.length - needed.length} already cached in exerciseCues; generating ${needed.length}.`);

// ── Generate ───────────────────────────────────────────────────────────────
const SYSTEM = `You write the one-line coaching cue a fitness app shows a member mid-set, when they tap the info button next to an exercise.

Rules:
- 1-2 sentences, under 200 characters. It is read between sets, on a phone, by someone slightly out of breath.
- Technique only: setup, the movement itself, and the one mistake people actually make on this lift.
- Plain imperative English. "Chest up, weight through the heels." Not "one should endeavour to".
- No sets, reps, weight, tempo or RPE — the screen already shows those.
- No medical or injury claims, no "consult a physician", no motivational filler.
- If the name is too vague to teach safely (e.g. "Mobility Exercises", "Circuit"), return an empty string for it rather than inventing a movement.

Reply with JSON only: {"cues":[{"name":"<exact name given>","cue":"<text or empty string>"}]}`;

if (needed.length) {
  const apiKey = await getSecret('OPENAI_API_KEY');
  if (!apiKey) {
    console.error('\nNo OPENAI_API_KEY — set it in .env.production or Admin → Integrations.\n');
    process.exit(1);
  }
  const model = val('--model', process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
  const openai = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 2 });
  console.log(`\nGenerating with ${model}…`);

  // Batched: one request per 25 names keeps each response small enough to come
  // back complete, and a failed batch costs 25 names rather than all of them.
  const BATCH = 25;
  for (let i = 0; i < needed.length; i += BATCH) {
    const batch = needed.slice(i, i + BATCH);
    try {
      const res = await openai.chat.completions.create({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Write a cue for each:\n${batch.map((n) => `- ${n}`).join('\n')}` },
        ],
      });
      const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}');
      let got = 0;
      for (const item of parsed.cues ?? []) {
        const cue = String(item?.cue ?? '').trim();
        // Only accept a cue for a name we actually asked about — a model that
        // renames the exercise must not have its version silently stored.
        const match = batch.find((n) => norm(n) === norm(item?.name));
        if (!match || !cue) continue;
        cues.set(norm(match), cue);
        got++;
      }
      console.log(`  ${Math.min(i + BATCH, needed.length)}/${needed.length} — ${got} cue(s) back`);
    } catch (err) {
      console.log(`  ${Math.min(i + BATCH, needed.length)}/${needed.length} — FAILED: ${err?.message ?? err}. Re-run to retry this batch.`);
    }
  }

  // Cache before touching any program: if the apply step fails, the expensive
  // part is not lost and a re-run picks up from here.
  const fresh = needed.filter((n) => cues.has(norm(n)));
  for (let i = 0; i < fresh.length; i += 400) {
    const batch = db.batch();
    for (const n of fresh.slice(i, i + 400)) {
      batch.set(db.collection('exerciseCues').doc(norm(n)), { name: n, cue: cues.get(norm(n)), source: 'generated', at: new Date().toISOString() }, { merge: true });
    }
    await batch.commit();
  }
  if (fresh.length) console.log(`Cached ${fresh.length} cue(s) in exerciseCues.`);
}

// ── Review file ────────────────────────────────────────────────────────────
const usable = slots.filter((s) => cues.has(norm(s.name)));
const byName = new Map();
for (const s of usable) if (!byName.has(s.name)) byName.set(s.name, { cue: cues.get(norm(s.name)), programs: new Set() });
for (const s of usable) byName.get(s.name).programs.add(s.program);

const lines = [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, v]) =>
  `${name}\n    ${v.cue}\n    (used in: ${[...v.programs].join(', ')})\n`);
writeFileSync('cues-for-review.txt', `${byName.size} cues, covering ${usable.length} exercise slots.\n\n${lines.join('\n')}`);
console.log(`\nWrote cues-for-review.txt — ${byName.size} cues covering ${usable.length} slots. Read it before applying:\n  less cues-for-review.txt`);

const noCue = [...new Set(slots.filter((s) => !cues.has(norm(s.name))).map((s) => s.name))];
if (noCue.length) console.log(`\n${noCue.length} name(s) got no cue (too vague to teach, or a failed batch):\n  ${noCue.join(', ')}`);

if (!apply) {
  console.log(`\nDRY RUN — nothing written to the programs. Re-run with --apply when the text reads right.\n`);
  process.exit(0);
}

// ── Apply ──────────────────────────────────────────────────────────────────
let written = 0;
for (const s of usable) { s.ex.notes = cues.get(norm(s.name)); s.entry.dirty = true; written++; }
const dirty = [...docs.values()].filter((d) => d.dirty);
for (let i = 0; i < dirty.length; i += 400) {
  const batch = db.batch();
  for (const d of dirty.slice(i, i + 400)) batch.set(d.ref, d.data);
  await batch.commit();
}
console.log(`\nWrote ${written} cue(s) into ${dirty.length} program document(s).`);
console.log(`Members see them on their next session load. Re-run scripts/program-quality.mjs to see coverage move.\n`);
process.exit(0);
