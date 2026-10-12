# Encrypted synchronization and RLS

Last reconciled with the repository: 11 October 2026. This document describes current code and remaining release work, not proof that any hosted deployment is configured or that its CI is green.

## Current status

| Area | Implemented in this repository | Verification / limits |
| --- | --- | --- |
| Optional Auth | Supabase client, Google/GitHub OAuth initiation, separate email sign-in/account-creation links, persisted sessions | Provider, redirect and SMTP configuration is operator-owned. Complete browser Auth lifecycle coverage remains pending. |
| Encrypted transport | Single-owner saved-request and referenced-collection push/pull through Supabase | Database-security CI runs the two-profile Chromium integration against its disposable stack. Local expanded scenario execution requires Docker; actual CI results must be checked. |
| Encryption and unlock | AES-GCM revisions; PBKDF2/SHA-256 passphrase-wrapped workspace key; unlock on another browser | Crypto, recovery, tamper and account-binding unit tests exist. Remembered local keys are not encrypted at rest. |
| Database authorization | Owner-only RLS, immutable revisions, per-workspace idempotency, server ordering | pgTAP and two-user public Data API tests are configured in CI. Check actual run results separately. |
| Local/offline mode | IndexedDB, local drafts/history/variables and coalescing metadata outbox | No Supabase configuration is required. Offline API calls still need a reachable network/API. |
| Stable release readiness | Not complete | See the remaining-work checklist below; no independent security audit or production availability guarantee. |

Login alone does not upload work. On first enable, the browser creates a random workspace key, wraps it using a separate sync passphrase (minimum 12 characters), creates the remote owner workspace, and queues existing saved requests plus their referenced collections. When joining an existing remote workspace, it unwraps that workspace's key instead of creating another one. Existing local pending entries may also upload on that join; this is not a clean replacement/import wizard.

The public reference deployment is intended to remain unconfigured/local-only. This is a deployment policy, not something source files can prove about the current live build. Forks/self-hosters may opt into their own hosted or self-hosted Supabase project.

## Setup and normal user behavior

Follow [Auth setup's operator checklist](AUTH_SETUP.md#deferred-operator-checklist-enable-sync-later) for migrations, providers, SMTP/redirects, public build variables, first enable and second-browser unlock. Merely setting two frontend values does not configure the service.

- Each installation uses its operator's Supabase URL and public publishable/anon key; users sign in individually.
- Both browsers must connect to the same Supabase project/account. Using the same frontend deployment is the simplest supported setup; separate origins have separate local data, sessions and trust.
- An existing browser normally restores its session and remembered key. Signing in again does not normally require another passphrase in that same profile; cleared data/new profiles need another unlock.
- Enable/unlock requires a secure context for Web Crypto: HTTPS or trusted localhost. Plain LAN HTTP on a phone is not equivalent to localhost.
- Automatic attempts run on opening, pending changes, focus/visibility/connectivity and roughly every 30 seconds while healthy. Failures retry with exponential backoff/jitter (24–30 seconds initially, capped at five minutes); focus respects the retry window, restored connectivity permits an immediate attempt. Mobile/background throttling means this is not instantaneous or a guaranteed background service. Sync now remains an explicit retry. Sign-out disposes subsequent automatic refresh work.
- Save and confirmed saved-request management actions update saved records and the sync outbox. Unsaved tabs remain local and are preserved during pulls. Remote updates change saved records, not open editor content; use confirmed Revert to load the current saved copy. Remote deletion is the exception: its open copy receives a new local-only draft ID, preserving content without implicitly undoing the tombstone.
- One browser profile currently has one local database/owner binding. Signing into a different account does not reassign it; binding checks refuse a mismatched owner. Separate profiles are the current way to keep accounts independent. Sign-out stops automatic sync but does not erase local data or the remembered key.
- No pause/disable-sync, cloud-workspace/account deletion, passphrase rotation or device-transfer UI is currently provided.

## What is uploaded, excluded, and still sensitive

Saved requests include their URL, parameters, body, scripts and organizational metadata, encrypted before transport. Referenced collection metadata is encrypted too. Never-synchronized empty collections remain local; a collection that already participated in sync retains its synchronized identity if it becomes empty.

The transport supports environment metadata rows, but the current environment UI does not queue their creation/deletion and bootstrap does not include them. Do not promise synchronized environment tags. Variable values are always local in this version.

Known credential filtering in `src/lib/syncPayload.ts` blanks:

- values of Authorization, Proxy-Authorization, Cookie, Set-Cookie, X-API-Key and API-Key headers;
- the Bearer token, Basic password, and Auth-helper API-key value.

This is not general secret detection. Basic usernames, arbitrary/custom headers, URL/query credentials, JSON passwords, bodies and scripts are not automatically sanitized. Safe variable placeholders remain portable; literal credential values stay local, and matching local saved secrets survive pull. A new browser still needs its own environment values or local credentials. Review saved/exported content.

Responses, history, unsaved drafts, variable values and local layout preferences are not uploaded. Local history records the resolved sent request and may contain credentials. Collection exports contain literal request fields, including inline credentials, although the separate variable table is not exported.

## Encryption and threat boundary

Revisions use AES-GCM-256, random 12-byte nonces and authenticated workspace/revision/object/operation context. Workspace-key wrapping uses PBKDF2/SHA-256 (310,000 iterations), a random salt, AES-GCM and workspace-bound context. The passphrase and unwrapped key are not uploaded.

To avoid repeat unlock on a trusted browser, `syncSecrets.encodedWorkspaceKey` stores the unwrapped key as base64 in IndexedDB. Base64 is not encryption. Browser-local requests, variables, history, Auth tokens and remembered workspace keys are not protected at rest by the sync passphrase. This convenience is not a biometric lock or an encrypted local vault.

A passive database operator can see account identifiers, workspace/object/revision IDs, types, operations, ordering/timestamps, ciphertext sizes and service/access metadata. Database access alone does not decrypt request content. Strong unique passphrases matter because a copied wrapped key permits offline password guessing. A hostile frontend, XSS, extension or unlocked device can read plaintext or keys before/after encryption; end-to-end encryption does not protect against those threats.

RLS independently prevents ordinary users from accessing other owners' rows. A service-role key bypasses RLS and must never be shipped in the frontend. See [Security policy](../SECURITY.md) and [Auth data/storage](AUTH_DATA_AND_COSTS.md).

If every remembered key and the passphrase are lost, the cloud content cannot currently be recovered. Account recovery does not recover the separate encryption key.

## Revision and deletion behavior

The checked-in migrations create `sync_workspaces` and `sync_revisions`:

- one workspace per owner, with optional wrapped-key fields;
- anonymous access revoked; owner-only workspace access and revision read/insert;
- append-only revisions: users cannot rewrite/delete an individual revision; deleting an owned workspace at the database layer cascades its revisions;
- version/algorithm/nonce/payload constraints, idempotency keys and server-generated order/timestamps;
- parent/device columns exist, but the current client does not populate a revision graph or register/revoke devices.

The processor pushes pending objects and acknowledges only the matching revision identity. It then fetches keyset pages of 500 revisions after its committed local cursor, retaining the latest revision/object in a bounded 20-page batch. Subsequent runs continue the batch. Pending objects are skipped, including a transaction-time recheck; the cursor does not advance if anything was deferred or decryption/application failed. Replaying committed pages after a crash is safe. A new logical save/delete gets a fresh identity while unchanged retries retain it. Same-object saves resolve by server order, not device clocks. The October 12 migration assigns sequence numbers after acquiring a workspace lock, preventing a later commit with a smaller sequence from being skipped. The app refuses transport unless authenticated `sync_protocol_version()` returns 2. Apply all migrations before deploying a configured build.

Upload filters literal known Auth/header credentials, retaining only validated variable placeholders with standard auth prefixes/separators. Pull merges matching local credentials; changed server origins, unparseable changed URLs and changed Basic usernames/API-key identities do not inherit unrelated secrets. New browsers get references but not secret values. Credential removal is browser-local; redaction cannot instruct another device to erase its private secret. Unknown URL/body/script/custom-header secrets are still not detected.

**Explicit retention and recovery:** Account → Clean up old sync revisions asks for confirmation and invokes an owner-authorized RPC. It keeps at least the latest 20 revisions per object, including latest tombstones and referenced parent revisions; current clients do not create parent chains. There is no automatic cloud purge or hard total-storage quota. Request ⋯ → View encrypted versions decrypts up to 20 uploaded upserts and opens a selected version as a new local unsaved copy. It does not overwrite the current saved request, execute scripts, restore variables, or automatically upload the recovered copy. Versions removed by cleanup cannot be restored. Export important work first. Physical-device and hosted migration validation remain operator responsibilities.

In-flight attempts share a promise only for the same owner; a different-owner call is refused. Web Locks serialize tabs where supported. Without Web Locks, that cross-tab guarantee is absent. Failed attempts preserve pending entries and automatic attempts back off. Comprehensive crash/network-flapping stress coverage remains later.

Collection deletion removes the collection and unfiles its local requests, clearing saved folder paths and updating matching open-tab metadata while preserving content edits. A tombstone is queued for a previously synced or pending-upload collection so an in-flight upsert cannot leave an undeleted remote collection. This is not “delete all its requests everywhere.” Individual request deletion is now implemented: request/draft/marker/outbox changes commit transactionally; a pending upsert may already be in flight, so it is replaced by a distinct tombstone rather than discarded. Never-queued/never-synced requests need no remote mutation. Tombstones remove saved records, and browser hydration remembers a canonical replacement draft ID for any open copy. Recovered edits remain local; later Save creates a separate request. History is not purged. Full stale-device resurrection protection, concurrent offline edit/delete rules, compaction, purge and account deletion remain unfinished. Keep independent exports.

Folders are optional collection metadata (`folders`) and saved-request path arrays (`folderPath`), not a new cloud entity/table. Metadata for a never-synced empty collection stays local; creating a folder in an already queued/synced collection queues its encrypted collection revision. Saving/moving a request includes its collection metadata. Empty paths are preserved in backups and older saved request paths infer parents. Collection metadata uses the same server-ordered latest-wins policy; folder-merge/rename/delete semantics and real two-device folder verification remain future work. No operator cloud-schema migration is needed for these fields.

New deterministic processor tests run real encryption with mocked transport/storage and cover in-flight delete/save races, unchanged-entry retries, remote request tombstones and missing upsert entities. Browser tests exercise local CRUD/deletion rollback and simulate the database result of a remote tombstone to verify cold-start draft recovery. The gated real two-profile scenario now additionally covers request deletion, preservation of second-device edits and explicit re-save under a new ID; this updated live case has not run because Docker is stopped. Do not interpret mocked/deterministic results as live Supabase verification.

## Test suites and honest coverage

### Unit and deterministic browser regression

```bash
npm ci
npm test -- --maxWorkers=2
npx playwright install chromium webkit
npm run test:e2e
```

Unit tests cover envelope round trips/tampering, passphrase unlock/wrong-key context, owner binding, outbox coalescing and known-field filtering. Normal browser regression covers local saved-only eligibility, empty collections, draft/response ownership and PWA behavior. It does not require Supabase; it does not prove actual cloud transport.

### Local two-user database/API isolation

Use the Supabase CLI and a Docker-compatible runtime. No hosted account, real email, or delivery provider is needed.

```bash
npm ci
npx supabase start
npx supabase test db
npm run test:db:api
npx supabase stop
```

pgTAP exercises anonymous/Alice/Bob roles and owner boundaries, revision immutability, metadata constraints, idempotency, payload limits and forged timestamps. The API suite provisions disposable confirmed users and signs in through normal public Auth before checking PostgREST isolation. Its admin key is test-only and must never be built into the app. SQL fixtures roll back, but the public-API and browser integration scripts leave created users/rows in the disposable stack; cleanup/reset automation remains work. Do not run these against a shared/hosted project. These suites do not prove browser OAuth/email delivery or device recovery.

### Gated real transport test

`e2e/encrypted-sync.spec.ts` provisions real local sessions and seeds them once, rather than automating login providers. Cases cover manual and automatic alternating-device updates, saved/unsaved separation, collection/request tombstones and fresh-ID recovery. The expanded audit case covers folder placement/rename propagation, portable Auth references, uploaded-version copies, offline saves/reconnection, owner cleanup, sign-out and refusing transport after switching to another account in a bound profile. These expanded cases await local execution with Docker and are now wired into database-security CI. They do not prove external OAuth/email delivery, every token-refresh failure, simultaneous offline conflicts or physical-device background behavior.

**Verification pending:** both scenarios are updated and discovered by Playwright. Real execution of these updated cases requires the disposable local Supabase stack; Docker was unavailable during this update. Do not treat discovery/TypeScript checks as successful transport verification.

Run the updated scenarios with a disposable migrated local stack and its public key, not a production project:

```bash
OPENREQUEST_SYNC_E2E=1 OPENREQUEST_E2E_PORT=4175 \
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY=YOUR_LOCAL_PUBLIC_KEY \
npm run test:e2e -- --project=chromium --grep 'encrypted cross-device'
```

Keep a separate unused port/build for this configured test. Default local browser regression skips this integration, but the database-security CI job runs `node scripts/test-sync-browser.mjs`: it reads local status without logging the admin key, supplies only the public frontend key, and executes the configured suite on port 4175. Check actual CI results; documentation is not a green-check certificate.

## Remaining work, prioritized

1. **P0 verification:** execute the updated draft-preservation and automatic alternating-device tests against local Supabase. Add owner switching during an in-flight run and second-device deletion coverage.
2. **Before wider beta:** complete Auth contract/lifecycle tests (session expiry/refresh/sign-out, email and OAuth callbacks, rate limits and disabled accounts). Email/password must ship signup, confirmation, forgot/reset-password and tests together; see [deferred Auth work](AUTH_SETUP.md#deferred-emailpassword-implementation).
3. **Sync reliability:** incremental cursor and backoff/jitter implemented; remaining work is expanded crash/flapping stress, concurrent edit/delete rules and stale-device resurrection prevention. Run the new migration/RPC/database cases before a wider sync release.
4. **Scope and consent:** explicit attach/import/merge preview, useful credential-exclusion previews, recovery for partially failed first-enable/bootstrap, selectable sync/pause behavior, clear pending/error/quota states, environment-tag decision.
5. **Recovery/lifecycle:** version-copy recovery and confirmed per-object retention implemented; passphrase/key rotation, device revocation/transfer, automatic retention policy and account/workspace deletion remain future work.
6. **Operations/security:** independent security review, dependency scanning, rate/signup/email abuse limits, quota-exceeded handling, migration/rollback and backup/restore drills, metadata/privacy disclosures and incident response.

Sharing/team roles, public links, passkeys/TOTP, realtime collaboration and a Java sync backend remain later. No new central proxy or maintainer-operated database is required for local use.

## Release acceptance criteria (not all met)

- Ciphertext-only cloud content with honest local-key and metadata limitations.
- Current tests prove owner isolation and actual two-browser saved-request transport.
- Unconfigured/offline local use and exports remain available.
- Secret filtering is explicitly scoped; users can review what is uploaded/exported.
- Concurrent edits/deletions have tested recovery rules and cannot silently resurrect data.
- Users understand unlock, irreversible loss, deletion and operator responsibilities.
