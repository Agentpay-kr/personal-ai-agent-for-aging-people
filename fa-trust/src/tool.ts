/** Glue for the FA LLM (Claude tool use): the model proposes, FamilyTrust decides. */
import type { ActionKind, ActionRequest, MemberId } from './policy';

export const ACTION_KINDS: ActionKind[] = [
  'read',
  'link_account',
  'order',
  'cancel_subscription',
  'transfer',
  'loan',
  'open_account',
  'buy_gift_card',
  'buy_crypto',
  'install_remote_app',
  'share_id_document',
  'share_otp',
  'change_phone',
];

export const PROPOSE_ACTION_TOOL = {
  name: 'propose_action',
  description: [
    "Propose an action on a family member's account or VM. You never execute anything yourself.",
    'The FA trust gate decides: it may run it, ask the owner or another family member to approve,',
    'hold it as a suspected scam, or block it. Propose forbidden actions too (loans, gift cards,',
    'remote-control apps, sharing ID/OTP) so the gate can block them and warn the family.',
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Member id whose account/VM is affected, e.g. "mom".' },
      kind: { type: 'string', enum: ACTION_KINDS },
      summary: { type: 'string', description: 'Short Korean label shown in chat, e.g. "넷플릭스 해지".' },
      service: { type: 'string', description: 'Linked service id, e.g. "netflix", "coupang".' },
      amountKRW: { type: 'number' },
      payee: { type: 'string', description: 'Recipient account or name for transfers.' },
      payeeOwner: { type: 'string', description: 'Member id if the recipient account belongs to a family member.' },
      llmRiskScore: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Your estimate (0..1) that this request is a scam or made under coercion.',
      },
    },
    required: ['owner', 'kind', 'summary'],
  },
} as const;

/**
 * Build the request from the model's tool input. The raw chat text and recent outside messages
 * come from the app, not from the model, so the model cannot drop the evidence the gate scans.
 */
export function toActionRequest(
  input: Record<string, unknown>,
  app: { text?: string; context?: string[] } = {},
): Omit<ActionRequest, 'requester' | 'id'> {
  const kind = String(input.kind) as ActionKind;
  if (!ACTION_KINDS.includes(kind)) throw new Error(`unknown action kind: ${String(input.kind)}`);
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
  return {
    owner: String(input.owner) as MemberId,
    kind,
    summary: str(input.summary),
    service: str(input.service),
    amountKRW: num(input.amountKRW),
    payee: str(input.payee),
    payeeOwner: str(input.payeeOwner),
    llmRiskScore: num(input.llmRiskScore),
    text: app.text,
    context: app.context,
  };
}
