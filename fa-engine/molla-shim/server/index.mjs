// Stand-in for `molla-app/server/index.mjs`, so Molla's own integration test
// can run against the FA engine:
//
//   cd molla-cli
//   FA_ENGINE_DIR=$PWD/../fa-engine \
//   MOLLA_TEST_APP_DIR=$PWD/../fa-engine/molla-shim \
//   node --test tests/api.integration.test.mjs
//
// The test copies this folder elsewhere, so the engine is located via FA_ENGINE_DIR.

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const dir = process.env.FA_ENGINE_DIR;
if (!dir) {
  console.error('Set FA_ENGINE_DIR to the family-agent-engine folder.');
  process.exit(2);
}
process.env.MOLLA_PORT = 'off';
process.env.FA_MODE ??= 'scripted';
process.env.FA_MEMORY ??= 'off';
process.env.FA_VM_STEP_MS ??= '10';
await import(pathToFileURL(join(dir, 'src', 'server.js')).href);
