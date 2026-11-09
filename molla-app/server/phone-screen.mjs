import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DomainError, member } from './core.mjs';
import { PolicyEngine } from './policy.mjs';
import { adbPath, phoneBinding } from './phone.mjs';
import { runtimePhoneEnv } from './cloud-vm.mjs';

const run = promisify(execFile);
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Frames exist in memory for this request only. Clients cannot choose a serial or owner. */
export class PhoneScreenService {
  constructor({ load, env = process.env, runner = run }) { Object.assign(this, { load, env, runner }); this.pending = new Set(); this.lastCapture = new Map(); }
  binding(actor) {
    const state = this.load();
    new PolicyEngine(state).request(actor, actor, 'phone');
    const device = phoneBinding(actor, runtimePhoneEnv(state, this.env));
    if (!device) throw new DomainError('내 Android를 시작하고 연결 상태를 확인해 주세요.', 409);
    return { device, policyVersion: member(state, actor).policyVersion };
  }
  async capture(actor, authorize = () => {}) {
    authorize();
    const initial = this.binding(actor);
    if (this.pending.has(actor) || Date.now() - (this.lastCapture.get(actor) || 0) < 2000) throw new DomainError('화면을 가져오고 있어요. 잠시 후 다시 확인해 주세요.', 429);
    this.pending.add(actor); this.lastCapture.set(actor, Date.now());
    try {
      const { stdout } = await this.runner(adbPath(this.env), ['-s', initial.device.serial, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024, timeout: 12000, windowsHide: true });
      // Do not release a captured private screen after permission, identity or session changes.
      authorize();
      if (JSON.stringify(this.binding(actor)) !== JSON.stringify(initial)) throw new DomainError('Android 연결이나 도움 권한이 변경되었어요.', 403);
      const png = Buffer.from(stdout);
      if (png.length < 24 || png.length > 4 * 1024 * 1024 || !png.subarray(0, 8).equals(signature) || png.toString('ascii', 12, 16) !== 'IHDR') throw new DomainError('Android 화면을 읽지 못했어요.', 502);
      const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
      if (width < 1 || height < 1 || width > 4096 || height > 4096) throw new DomainError('지원하지 않는 화면 크기예요.', 502);
      return { dataUrl: `data:image/png;base64,${png.toString('base64')}`, width, height, capturedAt: new Date().toISOString(), refreshAfterMs: 3000 };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError('Android 화면 연결을 확인해 주세요. 기기가 잠겨 있거나 연결이 끊겼을 수 있어요.', 502);
    } finally { this.pending.delete(actor); }
  }
}
