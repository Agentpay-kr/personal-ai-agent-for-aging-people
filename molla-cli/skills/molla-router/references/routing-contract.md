# Direct CLI routing contract v0.2

Runtime: Node.js 24+, local DB and host-provided local session file. No HTTP, cookies, web server or browser dependency. Local demo profiles are not production authentication.

Input remains schema version 1.0. `molla capabilities` and `docs/capabilities.json` enumerate operation arguments; `docs/request.schema.json` validates envelopes. Extra arguments including actor are rejected. Direct command words map to dots, e.g. `task execute` → `task.execute`.

| Operation | Purpose |
|---|---|
| health / identity.get | Direct runtime health / current profile |
| family.list / invite / join | Family membership and pending invitations |
| task.create / list / get | Plan and inspect owner-scoped tasks |
| task.decide | Approve, reject or cancel; approval needs ownerConfirmed and expectedActionHash |
| task.execute | Atomically claim and execute an approved task |
| task.recover | After expired execution lease, mark interrupted work needs_verification |
| memory.list / search / remember / correct / forget | Owner's memory |
| memory.shared / share / revoke | Explicit item sharing |
| contact.list / add / remove | Owner's contact book |
| ontology.get | Owner's relationship/permission graph |
| consent.set / permission.set | Owner-confirmed consent and scopes |
| vm.diagnose / compose.plan / app.plan | Owner-bound ADB checks and allowed action plans |

Input example:

```json
{"schema_version":"1.0","request_id":"req-001","operation":"task.create","arguments":{"text":"쌀 10kg 주문해줘"}}
```

Output is `{schema_version,ok,operation,request_id?,data}` or `{schema_version,ok:false,operation,error:{code,message,retryable:false,status?}}`. Exit codes: 0 command success, 2 invalid input, 3 missing session, 4 authorization/owner decision, 5 runtime/domain failure. Task execution may return ok:true with data.status:failed: always inspect the business state. Logs and Node diagnostics go to stderr. Help/version are plain-text exceptions.

DB and session are process flags, never request fields. Caller identity is resolved from a hashed opaque token in the DB. Target task owner does not change caller. Sessions are bound to a runtime ID and database path. OS filesystem access remains the local trust boundary.

Approval hash comparison and decision occur under BEGIN IMMEDIATE. Execution claims prevent concurrent replay; terminal tasks return existing results. A process interruption leaves durable running state. After its 60-second lease expires, explicit recovery marks needs_verification and never sends again automatically.

Flow: awaiting_approval → running (approved, not executed) → explicit task.execute → prepared / needs_verification / completed / failed. Completed is only used for verified app opening, not general purchase or SMS delivery. Prepared means a local draft artifact; intent_opened needs device inspection.

Android settings come from the operator's MOLLA_PHONE_BINDINGS and MOLLA_ADB. Permissions and allow flags are checked before side effects. Device/recipient/action changes invalidate execution. CLI cannot rent cloud devices, sign into apps, transfer funds, auto-send SMS or auto-pay.

This package contains its runtime source; it does not import from the sibling app. No LLM is required. An external router may use a model to select an operation, but the model cannot supply session authority or bypass owner approval.
