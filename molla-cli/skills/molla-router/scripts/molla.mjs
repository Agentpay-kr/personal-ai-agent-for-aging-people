#!/usr/bin/env node
// Router-facing launcher. A model chooses the operation inside the JSON on stdin; it does
// not choose commands, files or identities. So this launcher only allows:
//   capabilities | health | route --input -
// The DB and session come from MOLLA_CLI_DB / MOLLA_SESSION_FILE set by the host (absolute
// paths), never from arguments. Owner-only secrets are removed from the child environment.
import { existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';

const fail = (code, message, exit = 2) => {
  process.stdout.write(JSON.stringify({ schema_version: '1.0', ok: false, operation: 'launcher', error: { code, message, retryable: false } }) + '\n');
  process.exit(exit);
};

const candidate = process.env.MOLLA_CLI || resolve(import.meta.dirname, '../../../bin/molla.mjs');
if (!isAbsolute(candidate) || !existsSync(candidate)) fail('CONFIG', 'Set MOLLA_CLI to the absolute path of molla-cli/bin/molla.mjs.');

const argv = process.argv.slice(2);
const allowed = [['capabilities'], ['health'], ['route', '--input', '-']];
if (!allowed.some((a) => a.length === argv.length && a.every((v, i) => v === argv[i]))) {
  fail('LAUNCHER_FORBIDDEN', 'The router launcher only runs: capabilities | health | route --input -. DB and session paths come from the host environment.', 4);
}

const env = { ...process.env };
if (argv[0] !== 'capabilities') {
  for (const name of ['MOLLA_CLI_DB', 'MOLLA_SESSION_FILE']) {
    if (!env[name] || !isAbsolute(env[name])) fail('CONFIG', `The host must set ${name} to an absolute path.`);
  }
}
// The router must never hold owner proof material or test-only switches.
for (const name of ['MOLLA_OWNER_KEY', 'MOLLA_ALLOW_DEMO_LOGIN']) delete env[name];

const child = spawn(process.execPath, [candidate, ...argv], { stdio: 'inherit', windowsHide: true, env });
child.on('error', () => process.exit(5));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 5));
