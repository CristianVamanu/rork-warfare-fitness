#!/usr/bin/env node
/**
 * Read-only: prints every program a member can actually see, with the fields
 * marketing needs (name, level, goal, length, days, equipment, description).
 * Writes nothing.
 *
 *   node --env-file=.env.production scripts/catalog-export.mjs
 *
 * Live = database programs that are public, plus built-in programs that an
 * admin has not deleted, purged or hidden and that no database copy overrides.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Run from /root/rork-warfare-fitness with: node --env-file=.env.production scripts/catalog-export.mjs');
  process.exit(1);
}
initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

const src = readFileSync(new URL('../src/lib/programs.ts', import.meta.url), 'utf8');
const field = (block, k) => (block.match(new RegExp(`^ {4}${k}: (?:'((?:[^'\\\\]|\\\\.)*)'|(\\d+))`, 'm')) || [])[1] ?? (block.match(new RegExp(`^ {4}${k}: (\\d+)`, 'm')) || [])[1];
const seeds = src.split(/\n  \{\n/).slice(1).map((b) => ({
  id: field(b, 'id'), name: field(b, 'name'), level: field(b, 'level'), goal: field(b, 'goal'),
  weeks: Number(field(b, 'weeks')), daysPerWeek: Number(field(b, 'daysPerWeek')),
  description: (field(b, 'description') || '').replace(/\\n/g, ' ').replace(/\\'/g, "'"),
})).filter((s) => s.id && s.name);

const read = async (id) => new Set(((await db.collection('config').doc(id).get()).data()?.ids) ?? []);
const [deleted, purged, hidden] = await Promise.all([read('deletedMocks'), read('purgedMocks'), read('hiddenMocks')]);
const snap = await db.collection('programs').get();
const dbProgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const dbIds = new Set(dbProgs.map((p) => p.id));

const live = [];
for (const s of seeds) {
  if (deleted.has(s.id) || purged.has(s.id) || hidden.has(s.id) || dbIds.has(s.id)) continue;
  live.push({ ...s, source: 'built-in' });
}
for (const p of dbProgs) {
  if (p.isPublic === false || p.trainerId) continue;
  if (deleted.has(p.id) || purged.has(p.id) || hidden.has(p.id)) continue;
  live.push({
    id: p.id, name: p.name, level: p.level, goal: p.goal, weeks: p.weeks, daysPerWeek: p.daysPerWeek,
    equipment: p.suitableEquipment ?? p.equipmentTier ?? null, gender: p.targetGender ?? 'anyone',
    premium: !!p.isPremium, description: String(p.description ?? ''), source: 'database',
  });
}
live.sort((a, b) => String(a.name).localeCompare(String(b.name)));
console.log(`\n${live.length} programs live\n`);
for (const p of live) {
  console.log(`### ${p.name}`);
  console.log(`id ${p.id} · ${p.level} · goal ${p.goal} · ${p.weeks} weeks · ${p.daysPerWeek} days/week${p.equipment ? ` · equipment ${[].concat(p.equipment).join('/')}` : ''}${p.gender && p.gender !== 'anyone' ? ` · for ${p.gender}` : ''} · ${p.source}`);
  console.log(p.description.replace(/\s+/g, ' ').slice(0, 420));
  console.log('');
}
process.exit(0);
