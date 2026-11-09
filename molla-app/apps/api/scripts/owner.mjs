import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { secureDirectory, digest } from '../src/storage.mjs';

const [command, actor, name = actor] = process.argv.slice(2);
if (!['issue', 'revoke'].includes(command) || !/^[A-Za-z0-9_-]{1,80}$/.test(actor || '')) throw new Error('Usage: node scripts/owner.mjs issue|revoke OWNER_ID [DISPLAY_NAME]');
const dir = resolve(process.env.MOLLA_API_DATA_DIR || resolve(import.meta.dirname, '../.data'));
secureDirectory(dir);
const path = process.env.MOLLA_API_AUTH_FILE || resolve(dir, 'owners.json');
const data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { owners: [] };
for (const record of data.owners.filter(r => r.actor === actor)) record.revoked = true;
if (command === 'issue') {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  data.owners.push({ actor, name, hash: digest(token), expiresAt, revoked: false });
  const output = resolve(dir, `${actor}-access.txt`);
  writeFileSync(output, `${name} 앱 연결 키 (expires ${expiresAt})\n${token}\n`, { mode: 0o600 });
  console.log(`Owner credential saved privately to ${output}. Hand it directly to its owner; never put it in a URL or family chat.`);
}
writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
console.log(`Owner ${actor}: ${command === 'issue' ? 'new credential issued; previous keys revoked' : 'all credentials revoked'}.`);
