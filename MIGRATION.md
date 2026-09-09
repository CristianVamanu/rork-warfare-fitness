# Moving this app to another server

Written to be followed at 11pm on the night the old host dies, by someone who
did not write it. Every command is meant to be pasted as-is.

**Time:** about an hour, most of it waiting on `npm ci` and the build.
**Downtime:** zero, if you follow the order below — the new box is built and
serving before anything is pointed at it.

---

## What actually lives on the server

This is the part that makes the migration easy, and it is worth understanding
before you start.

**Almost nothing.** The app is stateless. Everything a user has ever created
lives in services outside the VPS:

| Thing | Where it lives | Migrates? |
|---|---|---|
| Users, workouts, programs, progress, subscriptions | **Firestore** | Nothing to do |
| Images, videos, uploads | **Cloudflare R2** | Nothing to do |
| Payments, customers, subscriptions | **Stripe** | Nothing to do |
| Auth accounts and password hashes | **Firebase Auth** | Nothing to do |
| The code | **GitHub** | `git clone` |

So the VPS holds exactly **four** things you cannot recreate from GitHub:

1. **`.env`** — every secret the app has. Not in git, by design.
2. **`backups/`** — the nightly Firestore exports (`/backups/` is gitignored).
3. **The crontab** — recreated automatically by `deploy.sh`, see step 7.
4. **nginx config + TLS** — recreated in step 8.

Of those, **`.env` is the one that matters**. If you have it, you can rebuild
this server from scratch. If you lose it, you lose the `ENCRYPTION_KEY`, and
anything already encrypted with it becomes permanently unreadable — a new key
does not undo that. Back it up to your password manager before you touch
anything else.

---

## Before you start

You need, in hand:

- [ ] The contents of `/root/rork-warfare-fitness/.env` from the old server
- [ ] Access to your Cloudflare DNS
- [ ] The GitHub repo (`CristianVamanu/rork-warfare-fitness`)
- [ ] The new server's IP address, root SSH access, Ubuntu 24.04

If the old server is still alive, grab the two things that only exist there:

```bash
# On the OLD server
cd /root/rork-warfare-fitness
gpg -c --cipher-algo AES256 -o /root/env-backup.gpg .env   # asks for a passphrase
tar czf /root/backups.tar.gz backups/
```

Then pull both to your laptop:

```bash
# On YOUR machine
scp root@OLD_IP:/root/env-backup.gpg .
scp root@OLD_IP:/root/backups.tar.gz .
```

> Never commit `.env`, never paste it into a chat or an email, and do not put
> the unencrypted file anywhere that syncs to a cloud service.

If the old server is already gone and you have no `.env` backup, skip to
**"If you lost the .env"** at the bottom. It is recoverable, with one painful
exception.

---

## 1. Base packages on the new server

```bash
ssh root@NEW_IP

apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -   # Node 20 LTS — what CI builds against
apt install -y nodejs git nginx certbot python3-certbot-nginx
npm install -g pm2

node -v    # expect v20.x
```

Node 20 is deliberate: `.github/workflows` builds on 20, so it is the version
this code is actually tested on. Node 22 will very likely work — just do not
find that out during a migration.

## 2. Clone the code

```bash
cd /root
git clone https://github.com/CristianVamanu/rork-warfare-fitness.git
cd rork-warfare-fitness
git checkout claude/vercel-installer-stuck-gtqub3
```

The deploy branch is `claude/vercel-installer-stuck-gtqub3`, not `main`. That
is what `deploy-webhook/webhook.js` deploys from (`DEPLOY_BRANCH`) and what the
live site runs.

## 3. Restore the .env

```bash
# from your laptop
scp env-backup.gpg root@NEW_IP:/root/

# on the new server
cd /root/rork-warfare-fitness
gpg -d -o .env /root/env-backup.gpg
chmod 600 .env
rm /root/env-backup.gpg
```

Then check one value before going further:

```bash
grep NEXT_PUBLIC_APP_URL .env
```

If you are keeping the same domain, leave it alone. If the domain is changing,
update `NEXT_PUBLIC_APP_URL` now — several things read it, including the cron
setup in step 7 and the URLs in outgoing emails.

## 4. Restore the backups directory

```bash
cd /root/rork-warfare-fitness
tar xzf /root/backups.tar.gz     # after scp'ing it over
ls backups | tail -3
```

Not strictly required to serve the site, but these are your point-in-time
Firestore exports and they exist nowhere else. See `RESTORE.md` for how they
are used.

## 5. Build and start

```bash
cd /root/rork-warfare-fitness
npm ci
npm run build
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup          # prints a command — run the command it prints
```

`ecosystem.config.js` runs the app in **cluster mode with 2 instances** on port
3000, so `pm2 reload` can restart them one at a time and deploys stay
zero-downtime. `pm2 save` + `pm2 startup` is what makes the app come back by
itself after a reboot — skip it and the site stays down after the next restart.

Confirm it is actually serving before you point anything at it:

```bash
curl -s http://localhost:3000/api/health; echo
```

Expect `{"status":"ok",...}` with a commit sha.

## 6. Start the deploy webhook listener

This is what makes `git push` deploy automatically.

```bash
cd /root/rork-warfare-fitness/deploy-webhook
WEBHOOK_SECRET="$(grep -E '^WEBHOOK_SECRET=' ../.env | cut -d= -f2-)" \
  pm2 start webhook.js --name webhook-listener
pm2 save
```

It listens on port **4001** and verifies GitHub's HMAC signature, so the secret
must match the one configured on the GitHub webhook. If `WEBHOOK_SECRET` is not
in your `.env`, the listener refuses to start on purpose — get the value from
the GitHub webhook settings (Settings → Webhooks) or set a new one in both
places.

## 7. Install the cron jobs

**You do not do this by hand.** `deploy.sh` writes the crontab itself, reading
`CRON_SECRET` and `NEXT_PUBLIC_APP_URL` out of your `.env`:

```bash
cd /root/rork-warfare-fitness
./deploy.sh
crontab -l
```

You should see four entries, all calling **localhost**, not your public domain
(going out through Cloudflare and back adds failure points, and Cloudflare cuts
origin requests off at ~100s — long enough to break a growing backup export):

| When (UTC) | What |
|---|---|
| hourly, :00 | `/api/notifications/process` — sends queued notifications |
| 03:22 | `/api/admin/backup` — nightly full Firestore export |
| 04:17 | `/api/admin/reconcile-subscriptions` — Stripe safety net |
| 08:05 | `/api/admin/error-digest` — daily unresolved-error email |

If `crontab -l` is empty, `deploy.sh` will have said
`skipped — CRON_SECRET or NEXT_PUBLIC_APP_URL not set` — fix `.env` and re-run.

The reconcile job matters more than it looks: Stripe stops retrying a failed
webhook after ~3 days, and without this a cancelled subscription keeps full
paid access forever with nothing anywhere that notices.

## 8. nginx + TLS

```bash
cat > /etc/nginx/sites-available/warfare-fitness <<'NGINX'
server {
    listen 80;
    server_name YOUR_DOMAIN;

    # Uploads go through the app to R2 — the 1MB nginx default rejects
    # anything but a thumbnail.
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    # GitHub push -> auto-deploy. Keep this path secret-ish; the listener
    # verifies the HMAC signature regardless.
    location /deploy-hook {
        proxy_pass http://localhost:4001;
        proxy_set_header Host $host;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/warfare-fitness /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Replace `YOUR_DOMAIN` in both places first. **If you copied the old server's
nginx config across, use that instead** — it is the known-good one.

For TLS: if you use Cloudflare's proxy with SSL mode **Full (strict)**, you
still need a valid cert on the origin:

```bash
certbot --nginx -d YOUR_DOMAIN
```

Certbot needs port 80 reachable from the internet, which means **temporarily
turning the Cloudflare proxy off** (grey cloud) for that DNS record, or using a
DNS-01 challenge. Turn it back on afterwards.

## 9. Cut over the DNS

Only now. The new box is already serving.

1. Cloudflare → DNS → the `A` record for your domain
2. Change the IP from the old server to the new one
3. Leave the proxy (orange cloud) exactly as it was

Because you are behind Cloudflare, this propagates in seconds and visitors
never see the IP change. Watch it land:

```bash
# on the NEW server
tail -f /var/log/nginx/access.log
```

Real traffic appearing there means the cutover worked.

## 10. Repoint the webhooks

Only needed **if the domain changed**. If you kept the same domain, both of
these already point at the right place and there is nothing to do.

- **GitHub** → repo Settings → Webhooks → payload URL →
  `https://YOUR_DOMAIN/deploy-hook`
- **Stripe** → Developers → Webhooks → endpoint URL →
  `https://YOUR_DOMAIN/api/stripe/webhook`

> Stripe's signing secret is per-endpoint. If you create a **new** endpoint
> rather than editing the existing one, you get a **new** `STRIPE_WEBHOOK_SECRET`
> and must update `.env` and restart, or every payment event silently fails
> signature verification.

## 11. Verify, then decommission

```bash
curl -s https://YOUR_DOMAIN/api/health; echo
pm2 list                     # warfare-fitness (2, online) + webhook-listener
crontab -l | wc -l           # 4
cat .deploy-status.json      # ok:true, recent
```

Then, end to end:

- [ ] Log in as a real user
- [ ] Open a program, start a session
- [ ] An image loads (proves R2 credentials came across)
- [ ] Admin panel opens
- [ ] `git push` a trivial commit and watch it auto-deploy
- [ ] A test Stripe checkout completes and the account gets access
  (Stripe test mode — this is the one worth not skipping)

**Leave the old server running for a week.** It costs a few pounds and it is
the only rollback you have: if something turns out to be broken, you point the
DNS back and you are live again in seconds. Only destroy it once you have seen
a full billing cycle and a nightly backup succeed on the new box.

---

## If you lost the .env

Recoverable, in this order:

| Variable | Where to get it again |
|---|---|
| `FIREBASE_*` | Firebase console → Project settings → Service accounts → generate a new private key |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys (roll it) |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → your endpoint → reveal signing secret |
| `R2_*` | Cloudflare → R2 → Manage API tokens → create new |
| `OPENAI_API_KEY` | OpenAI dashboard → new key |
| `RESEND_API_KEY` | Resend dashboard → new key |
| `CRON_SECRET`, `WEBHOOK_SECRET` | Invent new ones (`openssl rand -hex 32`), update GitHub webhook to match |
| **`ENCRYPTION_KEY`** | **Not recoverable.** |

`ENCRYPTION_KEY` is the exception and the reason this file nags about backups.
It is not an API key you can reissue — it is the key that already-stored
ciphertext was encrypted with. Generate a new one and the app runs fine, but
every value encrypted under the old key is permanently unreadable. There is no
support ticket that fixes it.

Which is the whole argument for the first instruction in this document: put
`.env` in your password manager, today, and re-do it whenever it changes.
