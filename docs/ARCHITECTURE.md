# Architecture and security boundaries

## System shape

```text
                       optional, never required
  PWA / browser  ──────────────────────────────────► sync service
       │       local encrypted state                  ciphertext + revisions
       │
       ├── Fetch / WebSocket / SSE ─────────────────► CORS-enabled APIs
       │
       ├── File System Access / import-export ──────► user-owned collection files
       │
       └── paired localhost connection ─────────────► optional local bridge
                                                       native HTTP/gRPC/TLS
```

The PWA is independently useful. The local bridge is a capability extension, not a relay through infrastructure run by the project. Sync is an adapter and can be absent at build time.

## Current modules

- `src/lib/request.ts`: browser Fetch transport and plain-language error mapping.
- `src/lib/curl.ts`: deliberately small cURL importer/exporter. It must become a fixture-driven parser before claiming broad compatibility.
- `src/db.ts`: versioned Dexie/IndexedDB schema.
- `src/store.ts`: UI state and persistence operations.
- `src/types.ts`: the current internal data contract.
- `src/App.tsx`: first vertical-slice UI; split into feature modules as Phase 1 begins.

## Target boundaries

```text
packages/
  collection-model/    schema, migrations, OpenCollection adapters
  protocol-core/       transport-independent requests/responses
  importers/           cURL, Postman, OpenAPI, HAR
  scripting/           isolated worker runtime and capability API
  runner/              deterministic collection execution
apps/
  web/                  PWA
  bridge/               loopback-only native companion
  cli/                  CI and terminal runner
services/
  sync-reference/       optional Java/Spring Boot ciphertext/revision store
```

Do not start a monorepo migration until the second consumer (CLI or bridge) exists.

### Optional backend implementation

There is intentionally no backend in the current milestone. When account-based sync or hosted collaboration becomes real work, the default reference implementation will use Java 25 LTS, Spring Boot 4.x, Maven Wrapper, PostgreSQL, Flyway, Spring Security, and Testcontainers. These are mature, open-source technologies with good Java documentation and local Docker support. See `TECHNOLOGY_DECISIONS.md` for the trigger criteria and dependency rules.

## Browser constraints

- CORS is enforced by browsers. `mode: no-cors` is not a solution because the response becomes opaque. The API must allow the web origin, support gRPC-Web, or the user must opt into a local bridge.
- Native gRPC cannot be implemented faithfully through normal browser APIs. Browser gRPC means gRPC-Web with server/proxy support and no client/bidirectional streaming today.
- Browser TLS client-certificate and raw socket control is inadequate for a general API client.
- iOS supports installing PWAs from the Share menu on iOS 16.4+ ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)), but install prompts and file APIs vary. Always keep visible import/export fallbacks.
- IndexedDB can store substantial structured data ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)), but quota and eviction are browser-controlled. Persistence requests and backups reduce, not eliminate, risk.

## Security model

### Local secrets

- Mark variable values as public or secret.
- Secret values are excluded from ordinary collection exports, UI search previews, history, logs, and crash reports.
- “Encrypting” IndexedDB with a key stored beside it does not protect against XSS; prioritize a strict CSP, dependency review, no remote scripts, and short-lived in-memory secret access.
- Optional vault encryption should derive a key from a user passphrase or platform credential and clearly explain the recovery trade-off.

### Local bridge

- Listen on `127.0.0.1`/`::1` only, never all interfaces by default.
- Pair each browser profile using a high-entropy one-time code; keep a revocable origin allowlist.
- Require authentication on every request; defend DNS rebinding; validate `Origin` and `Host`.
- Expose capability grants (network ranges, filesystem paths, client certificates) explicitly.
- Ship signed releases with reproducible build instructions and an update mechanism that verifies signatures.
- Never accept arbitrary remote bridge connections or automatically disable TLS validation.

### Scripts

- The current milestone uses a small declarative interpreter rather than JavaScript. Supported commands set temporary variables/headers, assert response status/JSON paths, and capture response values into the active environment.
- The interpreter has no DOM, storage, network, or bridge access. Captures pass through the application store and are marked secret by default.
- If JavaScript compatibility is added later, run it in isolated workers with time and memory limits and expose only a narrow capability API. Do not execute request scripts through `eval`, `Function`, or the page's global context.
- Pin a documented compatibility surface instead of emulating all Postman globals indefinitely.

### Variable isolation

- Every variable belongs to exactly one environment tag; only the active environment participates in substitution.
- Secret variables are masked in the UI and remain separate from collection exports and history.
- Built-ins currently include `$timestamp`, `$isoTimestamp`, and `$randomUUID`.
- Missing variables fail before network transmission with a specific error rather than sending unresolved placeholders.

### Optional sync

- Authenticate the user, but encrypt workspace content on the client with a separate key.
- Prefer an append-only encrypted change log, per-device keys, deterministic conflict records, and exportable recovery material.
- The server must not receive active API credentials unless a user explicitly creates a shared secret.
- Publish threat model, deletion semantics, backup retention, breach response, and metadata leakage before beta.

## Data format requirements

The export envelope already includes `format` and `version`. Before compatibility promises:

- publish JSON Schema;
- preserve unknown fields during round trips;
- separate secret references from values;
- use stable IDs and deterministic serialization;
- define folder subtree export and dependency behavior for inherited auth/environments;
- add golden fixtures for every importer and migration;
- make CLI and PWA read the same model package.

## Deployment

The PWA builds to static files and can use GitHub Pages, Cloudflare Pages, Netlify, a local web server, or any container/static host. Runtime configuration must not contain private keys. OAuth public client IDs are not secrets; provider client secrets belong only in an optional backend.
