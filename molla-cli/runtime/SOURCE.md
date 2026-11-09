# Runtime source

The direct CLI runtime contains project-owned domain, policy, memory, ontology, draft and Android modules copied from this workspace's `molla-app/server` on 2026-11-09. They are a packaged snapshot, not a runtime import from the web app. The CLI persistence, atomic approval and execution claim implementation is in `lib/store.mjs`, `lib/client.mjs`, and `lib/execute.mjs`.

No HTTP entry point, web UI, cloud LLM SDK, external repository or secret configuration is included here. Update these modules deliberately with matching CLI tests when project behavior changes.
