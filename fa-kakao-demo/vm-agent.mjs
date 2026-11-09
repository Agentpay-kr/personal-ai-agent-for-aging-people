export const DEMO_VM_BINDINGS = Object.freeze({ mom: 'vm-mom', dad: 'vm-dad', son: 'vm-son' });

export const DEMO_SUBSCRIPTIONS = Object.freeze([
  Object.freeze({ id: 'tving', name: '티빙', price: '월 13,500원', match: /티빙|tving/i }),
  Object.freeze({ id: 'melon', name: '멜론', price: '월 10,900원', match: /멜론|melon/i }),
  Object.freeze({ id: 'naver', name: '네이버플러스', price: '월 4,900원', match: /네이버|naver/i }),
]);

const INITIAL_SUBSCRIPTIONS = {
  mom: ['tving', 'melon', 'naver'],
  dad: ['melon'],
  son: ['tving', 'naver'],
};
const JOB_FIELDS = ['schema_version', 'request_id', 'operation', 'actor', 'owner', 'vm_id', 'arguments', 'authorization'];

function hasFields(value, fields) {
  return value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function validId(value) {
  return typeof value === 'string' && value.length <= 128 && value.trim().length > 0;
}

function validJob(job) {
  if (!hasFields(job, JOB_FIELDS) || job.schema_version !== '1.0' || !validId(job.request_id)) return false;

  const { actor, owner, vm_id: vmId, operation, arguments: args, authorization } = job;
  if (typeof owner !== 'string' || !Object.hasOwn(DEMO_VM_BINDINGS, owner) || DEMO_VM_BINDINGS[owner] !== vmId) return false;
  if (typeof actor !== 'string' || !Object.hasOwn(DEMO_VM_BINDINGS, actor)) return false;

  if (operation === 'subscriptions.list') {
    return hasFields(args, []) && hasFields(authorization, ['type'])
      && authorization.type === (actor === owner ? 'owner' : 'read-grant');
  }

  return operation === 'subscriptions.cancel'
    && hasFields(args, ['service_id']) && DEMO_SUBSCRIPTIONS.some(({ id }) => id === args.service_id)
    && hasFields(authorization, ['type', 'approval_id'])
    && authorization.type === 'owner-approval' && validId(authorization.approval_id);
}

function publicSubscription({ id, name, price }) {
  return { id, name, price };
}

export function createDemoVmAgent() {
  const subscriptions = Object.fromEntries(
    Object.entries(INITIAL_SUBSCRIPTIONS).map(([owner, ids]) => [owner, new Set(ids)]),
  );
  const executions = new Map();

  return {
    execute(job) {
      if (!validJob(job)) throw new Error('Invalid VM job.');
      const { request_id: requestId, operation, actor, owner, vm_id: vmId, arguments: args, authorization } = job;
      const signature = JSON.stringify([operation, actor, owner, vmId, args.service_id, authorization.type, authorization.approval_id]);
      const previous = executions.get(requestId);
      if (previous) {
        if (previous.signature !== signature) throw new Error('VM request ID conflict.');
        return structuredClone(previous.result);
      }

      const active = subscriptions[owner];
      const result = { request_id: requestId, status: 'simulated' };
      if (operation === 'subscriptions.list') {
        result.subscriptions = DEMO_SUBSCRIPTIONS.filter(({ id }) => active.has(id)).map(publicSubscription);
      } else {
        if (!active.delete(args.service_id)) throw new Error('VM subscription unavailable.');
        result.subscription = publicSubscription(DEMO_SUBSCRIPTIONS.find(({ id }) => id === args.service_id));
      }
      executions.set(requestId, { signature, result });
      return structuredClone(result);
    },
  };
}
