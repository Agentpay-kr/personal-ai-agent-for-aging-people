# Terra model configuration

The active Letsur conversation planner uses `gpt-6.1-terra` with
`LETSUR_REASONING_EFFORT=medium`. This follows the product owner's choice to
prioritize response quality while keeping everyday conversations responsive.
The model and reasoning settings belong in the server's private `.env`; the
mobile app receives neither provider credentials nor direct provider access.

The adapter sends `max_completion_tokens=8192`, which is a ceiling for reasoning
and output combined, not a target response length. Replies remain short under
the existing application schema. Older configured models retain their existing
request parameters. There is no automatic model fallback or retry.

Terra supports ordinary text requests through Chat Completions. This planner
returns a JSON plan; it does not use native model tool calls. The app still
requires owner approval before acting. The exact JSON schema is included in the
system instruction as well as `response_format`: the initial gateway probe
returned renamed fields despite requesting structured output. Strict local
validation continues to reject mismatched, truncated, or refused responses.

## Verification — 2026-11-09

- `node --test tests/*.test.mjs`: 68 passing tests, including Terra request
  compatibility, malformed plan rejection, owner isolation, and approvals.
- `node --env-file=.env scripts/verify-letsur-live.mjs`: the native HTTP client
  reached a temporary authenticated Node API and the real Letsur model.
  Greeting, message draft, consent, request deduplication, and family isolation
  passed. The synthetic draft remained awaiting approval.
- The successful smoke run took 9,505 ms in total, including server startup,
  two model requests, assertions, and cleanup. This is not per-message latency.
- Separate greeting probes ranged from approximately 1.9 to 15.2 seconds.
  Earlier requests also failed with a sanitized 502. These small samples are
  not a comparative benchmark or a latency guarantee.
- Evidence is saved in `terra-model-smoke-report.json`. The smoke script's
  default report name is `letsur-model-smoke-report.json`; this run was archived
  separately to retain the earlier model verification history.

This check used synthetic accounts and an isolated database. Android execution
was not included in this model migration check.

Sources: [OpenAI Terra model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-terra),
[Letsur Chat Completions documentation](https://docs.platform.letsur.ai/ai-gateway/api-reference/endpoints/chat-completions).
