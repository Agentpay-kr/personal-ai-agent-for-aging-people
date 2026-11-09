import { now, log } from './core.mjs';

export const activeStatuses = ['created', 'planned', 'awaiting_approval', 'approved', 'executing', 'verifying', 'running'];
export const executingStatuses = ['executing', 'verifying', 'running'];
export function transition(state, task, status, reason) {
  task.status = status;
  task.history ??= [];
  task.history.push({ status, at: now(), ...(reason ? { reason } : {}) });
  log(state, task.owner, `task.${status}`, task.id);
  return task;
}
export function enableLifecycle(state, task) {
  task.lifecycleVersion = 1;
  task.history = [];
  for (const status of ['created', 'planned', 'awaiting_approval']) transition(state, task, status);
  return task;
}
export function interruptTask(state, task, reason) {
  if (!activeStatuses.includes(task.status)) return;
  task.result = reason;
  transition(state, task, task.externalEffectStartedAt && task.action.execution.startsWith('android-') ? 'needs_verification' : 'cancelled', reason);
}
export function recoverDurableTasks(state) {
  for (const task of state.tasks) {
    if (['approved', ...executingStatuses].includes(task.status)) {
      task.result = '실행 중 서버가 다시 시작되었어요. 기기에서 확인해 주세요. 자동으로 다시 실행하지 않아요.';
      transition(state, task, task.executionStartedAt ? 'needs_verification' : 'cancelled', 'server_restart');
    }
  }
  for (const receipt of state.requests ?? []) if (receipt.status === 'pending') receipt.status = 'interrupted';
}
