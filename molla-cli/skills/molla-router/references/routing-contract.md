# Routing contract v1

Runtime: Node.js 24+, existing Molla API, host-provided session. Transport is local-only HTTP at `127.0.0.1` / `localhost`. Production OAuth, cross-host transport and service-account delegation are not implemented. An external person or agent selects operations and supplies verified context; this package does not contain an LLM routing loop.

Direct command words map to dots: `task create` → `task.create`, `vm compose plan` → `vm.compose.plan`.

| Operation | Arguments | Meaning |
|---|---|---|
| health / identity.get | none | API readiness / current identity |
| family.list / family.invite / family.join | name for invite; code for join | Visible family, demo invitation; join changes demo identity |
| task.create | text, owner?, draft?, contactId? | Request awaiting owner approval |
| task.list / task.get | status? / id | Current owner's tasks / exact action + approval_hash |
| task.decide | id, decision | approve / reject / cancel |
| memory.list / memory.search | query? for search | Owner's memories |
| memory.remember / memory.correct | text; id for correct | Owner-authored memory |
| memory.forget | id | Delete owner's memory |
| memory.shared / memory.share / memory.revoke | id, grantee for share/revoke | Item-level sharing |
| contact.list / contact.add / contact.remove | name, relation, phone for add; id for remove | Owner's contacts |
| ontology.get | none | Owner's relationship/permission graph |
| vm.diagnose | none | Check existing device binding |
| vm.compose.plan | contactId, draft | Plan SMS composition screen; never send |
| consent.set | value, ownerConfirmed | active / revoked |

Approval additionally requires `ownerConfirmed: true` and `expectedActionHash` from a fresh `task.get`. The hash is a client consistency check, not a signed approval token or atomic server comparison. Demo identities are not production authentication. Other decisions need neither field. Consent changes require the owner's explicit decision.

`molla capabilities` and `docs/capabilities.json` are the complete argument allowlist; `docs/request.schema.json` defines envelopes. Extra fields including `actor` are rejected. Optional task `owner` chooses a target, not caller identity.

Input:

```json
{"schema_version":"1.0","request_id":"req-001","operation":"task.create","arguments":{"text":"쌀 10kg 주문해줘"}}
```

Output:

```json
{"schema_version":"1.0","ok":true,"operation":"task.create","request_id":"req-001","data":{"task":{"id":"...","status":"awaiting_approval"}}}
```

```json
{"schema_version":"1.0","ok":false,"operation":"task.create","error":{"code":"FORBIDDEN","message":"...","retryable":false,"http_status":403}}
```

`request_id` is correlation only. The wrapper never retries. Mutation timeouts may have `outcome: "unknown"`; inspect state first. Logs go to stderr; session cookies are not printed. Exit codes: 0 success, 2 usage/config, 3 session required, 4 forbidden/owner decision, 5 API/network/protocol. Help/version are human-readable exceptions.

Task flow: `awaiting_approval → running → prepared | needs_verification | failed`; rejected/cancelled are terminal. `completed` is legacy state, not proof of a new transaction. Prepared carries a local draft artifact. Needs verification requires human inspection. Require actual execution evidence before reporting external success.

Server operators configure `MOLLA_PHONE_BINDINGS` per owner. The CLI cannot assign/rent VMs, select arbitrary ADB serials, log into another user's app or send automatically. Phone Harness Cloud authentication and saved-device provisioning remain operator setup.
