const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MAGIC = Buffer.from('BBMAP1');

function keyFromSecret(secret) {
  if (!secret || String(secret).length < 16) {
    throw new Error('MAP_SEED_KEY must be at least 16 characters');
  }
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest();
}

function seal(rows, secret) {
  const key = keyFromSecret(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = Buffer.from(JSON.stringify(rows), 'utf8');
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, enc]);
}

function open(buf, secret) {
  const key = keyFromSecret(secret);
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.length < MAGIC.length + 12 + 16) throw new Error('Corrupt map seed');
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Bad map seed magic');
  let o = MAGIC.length;
  const iv = buf.subarray(o, o + 12); o += 12;
  const tag = buf.subarray(o, o + 16); o += 16;
  const enc = buf.subarray(o);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]]) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function requireSeedKey() {
  loadDotEnv();
  const key = process.env.MAP_SEED_KEY;
  if (!key) throw new Error('Set MAP_SEED_KEY in .env (or the environment)');
  return key;
}

module.exports = { seal, open, keyFromSecret, loadDotEnv, requireSeedKey, ROOT, MAGIC };
