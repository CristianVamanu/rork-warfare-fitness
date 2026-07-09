// Minimal GitHub webhook listener — verifies the push signature, then
// runs deploy.sh. No framework dependency, just Node's built-in http/crypto
// so it has nothing extra to install or go out of date.
const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const path = require('path');

const PORT = process.env.WEBHOOK_PORT || 4001;
const SECRET = process.env.WEBHOOK_SECRET;
const BRANCH = process.env.DEPLOY_BRANCH || 'claude/vercel-installer-stuck-gtqub3';
const REPO_DIR = path.join(__dirname, '..');

if (!SECRET) {
  console.error('WEBHOOK_SECRET is not set — refusing to start.');
  process.exit(1);
}

function verifySignature(body, signature) {
  if (!signature) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function runDeploy() {
  console.log(`[${new Date().toISOString()}] Deploying...`);
  exec('bash deploy.sh', { cwd: REPO_DIR, maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Deploy failed:', err.message);
      console.error(stderr);
      return;
    }
    console.log(stdout);
    console.log('Deploy finished successfully.');
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404).end();
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const signature = req.headers['x-hub-signature-256'];
    if (!verifySignature(body, signature)) {
      console.warn('Rejected webhook: bad signature');
      res.writeHead(401).end('bad signature');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400).end('bad payload');
      return;
    }

    const ref = payload.ref; // e.g. "refs/heads/claude/vercel-installer-stuck-gtqub3"
    if (ref !== `refs/heads/${BRANCH}`) {
      console.log(`Ignoring push to ${ref} (watching ${BRANCH})`);
      res.writeHead(200).end('ignored');
      return;
    }

    res.writeHead(200).end('deploying');
    runDeploy();
  });
});

server.listen(PORT, () => {
  console.log(`Webhook listener on port ${PORT}, watching branch "${BRANCH}"`);
});
