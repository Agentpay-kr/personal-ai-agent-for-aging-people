import Ajv from 'ajv';
import { DomainError } from './core.mjs';
export const ajv = new Ajv({ allErrors: false, strict: true });
export const string = (maxLength = 1000) => ({ type: 'string', minLength: 1, maxLength });
export const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
export const choice = values => ({ type: 'string', enum: values });
export const bool = { type: 'boolean' };
const id = string(100), requestId = { type: 'string', pattern: '^[A-Za-z0-9_-]{8,100}$' };
const optionalRequest = props => object({ ...props, requestId }, Object.keys(props));
export const routes = Object.fromEntries(Object.entries({
  '/chat': object({ text: string(), requestId }),
  '/consent': optionalRequest({ value: choice(['active', 'revoked']) }),
  '/ai/consent': optionalRequest({ enabled: bool, includeMemories: bool }),
  '/preferences': optionalRequest({ agentName: string(20), scopes: { type: 'array', maxItems: 5, uniqueItems: true, items: choice(['shopping', 'calendar', 'message', 'phone', 'memory']) } }),
  '/task/decision': object({ id, decision: choice(['approve', 'reject', 'cancel']), expectedActionHash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, requestId }, ['id', 'decision']),
  '/contacts': optionalRequest({ name: string(40), relation: string(20), phone: string(24) }),
  '/contacts/delete': optionalRequest({ id }),
  '/memories': optionalRequest({ text: string(300) }),
  '/memories/delete': optionalRequest({ id }),
  '/memories/correct': optionalRequest({ id, text: string(300) }),
  '/phone/quote': optionalRequest({ durationMinutes: { type: 'integer', minimum: 1, maximum: 5 } }),
  '/phone/start': optionalRequest({ quoteId: id }),
  '/phone/stop': optionalRequest({}),
  '/phone/diagnose': optionalRequest({}),
  '/family/invite': optionalRequest({}),
  '/family/join': optionalRequest({ code: { type: 'string', pattern: '^[A-Fa-f0-9]{24}$' } }),
  '/family/decision': optionalRequest({ id, accept: bool }),
  '/family/request': object({ connectionId: id, text: string(), requestId }),
}).map(([path, schema]) => [path, ajv.compile(schema)]));
export function validateRequest(path, input) {
  if (!routes[path]) throw new DomainError('지원하지 않는 요청이에요.', 404);
  if (!routes[path](input)) throw new DomainError('요청 항목을 확인해 주세요. 사용자·기기·권한을 임의로 지정할 수 없어요.', 400);
}
