# Restoring from a backup

Written to be followed at 2am by someone who is not thinking clearly.

**Read this once now, while nothing is broken.** Two steps (the hash
parameters, and a rehearsal) can only be done *before* you need them.

---

## What a backup contains

`/api/admin/backup` runs nightly at 03:22 UTC and writes one gzipped JSONL
file to the private R2 bucket `warfare-fitness-backups`, under `backups/`.
The last 30 are kept.

Each line is a self-describing JSON object:

```json
{"c":"__meta","id":"manifest","d":{"version":2,"createdAt":"..."}}
{"c":"users","id":"<uid>","d":{...}}
{"c":"channels","id":"<id>","d":{...,"posts":[{...,"replies":[...]}]}}
{"c":"__authUsers","id":"<uid>","d":{...,"passwordHash":"...","passwordSalt":"..."}}
```

Subcollections are nested onto their parent line: `channels.posts.replies`,
`conversations.messages`, `supportTickets.messages`. `pushSubscriptions`
lines carry a `userId` naming the parent.

### What it does NOT contain

| Not in the backup | Why | How you recover it |
|---|---|---|
| **Password hash parameters** | Storing the lock beside the key defeats the point | Firebase console — **export them today**, see below |
| `system/secrets` | Encrypted API keys; copying them widens where a key can leak | Paste the keys back into Admin → Integrations |
| `.env.production` (incl. `ENCRYPTION_KEY`) | Never leaves the server | **VPS provider snapshot** — without `ENCRYPTION_KEY`, every stored secret is unreadable ciphertext |
| R2 media (photos, PR videos, attachments) | Objects, not documents | Enable R2 object versioning; otherwise they are gone |
| Stripe data | Stripe is the system of record | Nothing to restore — reconciliation re-syncs from Stripe |
| `rateLimits`, `usage`, `twoFactorCodes`, `emailVerifyCodes`, `trustedDevices`, `stripeEvents`, `errorReports` | Short-lived state that *should* expire | Deliberately not restored |

---

## Do these two things now, not during an incident

### 1. Export the password hash parameters

Firebase Console → **Authentication** → **Users** → **⋮** (top-right of the
table) → **Password hash parameters**.

The console prints an unquoted config block. Convert it to real JSON — the
restore script does `JSON.parse`, so quotes are required. Save as
`hash-params.json` (already gitignored, but keep the canonical copy in a
password manager, not on the server):

```json
{
  "algorithm": "SCRYPT",
  "base64_signer_key": "...",
  "base64_salt_separator": "...",
  "rounds": 8,
  "mem_cost": 14
}
```

`rounds` and `mem_cost` stay unquoted numbers; the three string fields need
quotes. `base64_signer_key` is a **secret** — anyone holding it plus a backup
file can verify passwords offline, so treat it like a private key.

**Without this file the password hashes in
every backup are unusable** and your members cannot sign in after a restore.
There is no way to recover it from a backup, because it deliberately isn't in
one.

### 2. Rehearse a restore into a scratch project

Create a second Firebase project (`warfare-fitness-scratch`), download a
service-account key for it, and run the restore below against it. An untested
restore is a file you are hoping about, not a backup.

---

## Restoring

### Step 1 — get the file

```bash
# List what you have (newest last)
npx --yes wrangler r2 object list warfare-fitness-backups --prefix backups/

# Pull one down
npx --yes wrangler r2 object get warfare-fitness-backups/backups/backup-2026-09-06T03-22-00-000Z.jsonl.gz \
  --file ./restore.jsonl.gz
```

Any S3 client works — R2 is S3-compatible. `rclone`, `aws s3 cp` with an R2
endpoint, or the Cloudflare dashboard.

### Step 2 — look inside before you touch anything

```bash
gunzip -c restore.jsonl.gz | head -1                     # manifest: version + date
gunzip -c restore.jsonl.gz | wc -l                       # total documents
gunzip -c restore.jsonl.gz | jq -r .c | sort | uniq -c   # documents per collection
gunzip -c restore.jsonl.gz | jq -r 'select(.c=="__authUsers") | .id' | wc -l   # accounts
```

If the account count is 0, this backup was written to local disk without the
private bucket configured and **cannot restore logins**. Use a different one.

### Step 3 — dry run

Point `GOOGLE_APPLICATION_CREDENTIALS` at a service-account key **for the
target project**. The script refuses to run if the key's project doesn't match
`--project`.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/root/scratch-sa.json

node scripts/restore.mjs --file restore.jsonl.gz --project warfare-fitness-scratch
```

Writes nothing. Prints the manifest and a per-collection document count.
Compare it against Step 2.

### Step 4 — write

```bash
node scripts/restore.mjs \
  --file restore.jsonl.gz \
  --project warfare-fitness-scratch \
  --hash-params hash-params.json \
  --write --yes-really-write-to warfare-fitness-scratch
```

Both flags must name the same project. That is the only way the script writes,
and it is deliberate.

`--only firestore` and `--only auth` restore one half at a time.

### Step 5 — verify

```bash
# Sign in as a real member on the restored project — the actual test
# Then check the counts match Step 2
```

Confirm a member can **log in with their existing password**. That single
check proves the hash parameters, the account import and the Firestore
profile all lined up. Nothing else proves it.

---

## Restoring over production

Don't, unless you have decided that losing everything written since the backup
is better than the current state.

The script uses `set()` without merge, so a restored document **replaces** the
live one. It never deletes, so anything created since the backup survives
untouched — which is usually worse than it sounds, because you end up with a
half-old, half-new database.

Prefer, in order:

1. **Restore into a fresh project**, verify it, then repoint the app
   (`FIREBASE_*` env vars + `NEXT_PUBLIC_FIREBASE_*`, then `./deploy.sh`).
2. **Restore one collection**, if the damage is contained — extract just those
   lines first:
   ```bash
   gunzip -c restore.jsonl.gz | jq -c 'select(.c=="programs")' | gzip > programs-only.jsonl.gz
   ```
3. Full production overwrite — last resort.

After any restore that changes billing state, run reconciliation to re-sync
against Stripe, which is the real source of truth for who is paying:

```bash
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/admin/reconcile-subscriptions?dryRun=1
```

Read the output before running it without `dryRun`.

---

## Gotchas that have already bitten

- **Timestamps.** `JSON.stringify` turns a Firestore `Timestamp` into
  `{_seconds,_nanoseconds}`. Writing that back gives you a plain map where a
  date used to be, and every date query silently stops matching.
  `scripts/restore.mjs` rebuilds them; a hand-rolled restore must too.
- **Cloudflare's 100s limit.** Never call `/api/admin/backup` through the
  public domain — it times out with a 502 while the export keeps running. Use
  `http://localhost:3000`. The cron already does.
- **`collections` in the response** counts collections that *had documents*,
  not collections attempted. A drop from 31 to 18 is empty collections, not
  data loss. `documents` is the number to watch.
- **Auth accounts are skipped entirely** when `R2_BACKUP_BUCKET_NAME` is
  unset, because password hashes must not be written to the app server's own
  disk. The response says `authUsers: null` and carries a `warning`.

---

## Health check

```bash
curl -s https://warfarefitness.com/api/health        # deployed SHA, deploy status
curl -s --max-time 900 -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/admin/backup             # run one now
```

A good result: `location` starting `r2:`, a non-zero `documents`, and
`authUsers` matching your member count.
