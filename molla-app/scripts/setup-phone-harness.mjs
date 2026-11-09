import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repository = 'https://github.com/phone-harness/phone-harness.git';
const revision = '4bebff105af853215fb74c958c2c5e78bc275be2';
const target = resolve(import.meta.dirname, '../../phone-harness');
function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Git operation failed: ${args[0]}. Check Git and network access.`);
  return result.stdout.trim();
}
if (process.argv.includes('--help')) {
  console.log(`Prepare Phone Harness ${revision} at ${target}. Existing checkouts are verified, never reset.`);
} else if (existsSync(target)) {
  const origin = git(['-C', target, 'remote', 'get-url', 'origin']);
  const current = git(['-C', target, 'rev-parse', 'HEAD']);
  if (![repository, repository.slice(0, -4)].includes(origin) || current !== revision || git(['-C', target, 'status', '--porcelain'])) throw new Error('Existing phone-harness differs or has local changes. Review it manually; nothing was overwritten.');
  console.log('Pinned Phone Harness source is already ready.');
} else {
  git(['clone', '--no-checkout', repository, target]);
  git(['-C', target, 'checkout', '--detach', revision]);
  console.log('Pinned Phone Harness source ready. Install Android Platform Tools and sign in separately.');
}
