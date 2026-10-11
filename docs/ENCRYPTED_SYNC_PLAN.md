# Encrypted synchronization and RLS

Last reconciled with the repository: 11 October 2026. This document describes current code and remaining release work, not proof that any hosted deployment is configured or that its CI is green.

## Current status

| Area | Implemented in this repository | Verification / limits |
| --- | --- | --- |
| Optional Auth | Supabase client, Google/GitHub OAuth initiation, separate email sign-in/account-creation links, persisted sessions | Provider, redirect and SMTP configuration is operator-owned. Complete browser Auth lifecycle coverage remains pending. |
| Encrypted transport | Single-owner saved-request and referenced-collection push/pull through Supabase | Gated two-profile Chromium tests now cover manual transport and automatic alternating-device behavior. Updated scenarios await real execution; normal CI skips them. |
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
- Automatic attempts run when the signed-in enabled app opens, its local pending count changes, it regains focus/visibility/connectivity, and every 30 seconds. Mobile/background throttling means this is not instantaneous or a guaranteed background service. Sync now is also available.
- Only explicit Save updates the saved request and sync outbox. Unsaved tabs remain local and are preserved during pulls. Remote changes update saved records, not already-open editor copies; use confirmed Revert to load the current saved copy when appropriate.
- One browser profile currently has one local database/owner binding. Signing into a different account does not reassign it; binding checks refuse a mismatched owner. Separate profiles are the current way to keep accounts independent. Sign-out stops automatic sync but does not erase local data or the remembered key.
- No pause/disable-sync, cloud-workspace/account deletion, passphrase rotation or device-transfer UI is currently provided.

## What is uploaded, excluded, and still sensitive

Saved requests include their URL, parameters, body, scripts and organizational metadata, encrypted before transport. Referenced collection metadata is encrypted too. Never-synchronized empty collections remain local; a collection that already participated in sync retains its synchronized identity if it becomes empty.

The transport supports environment metadata rows, but the current environment UI does not queue their creation/deletion and bootstrap does not include them. Do not promise synchronized environment tags. Variable values are always local in this version.

Known credential filtering in `src/lib/syncPayload.ts` blanks:

- values of Authorization, Proxy-Authorization, Cookie, Set-Cookie, X-API-Key and API-Key headers;
- the Bearer token, Basic password, and Auth-helper API-key value.

This is not general secret detection. Basic usernames, arbitrary/custom headers, URL/query credentials, JSON passwords, bodies and scripts are not automatically sanitized. Known credential fields are blanked even if they contained variable references; users may need to configure them again on another browser. Pulls apply sanitized request records locally, so keeping credential values in environment variables and reviewing saved/exported content is important.

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

The processor pushes pending objects, acknowledges before removing the matching outbox entry, then pulls pages of 500 revisions and chooses the highest server sequence per object. It currently re-reads the full log on each run, not an incremental cursor. Pending local objects are skipped during pull. Same-object saves resolve automatically by server order, not device clocks; older encrypted rows remain without a bounded retention policy or restore UI.

In-flight attempts share a local promise; Web Locks serialize browser tabs where supported. Without Web Locks, that cross-tab guarantee is absent. Failed attempts preserve pending entries; there is no exponential retry/backoff or comprehensive crash/network-flapping coverage yet.

Collection deletion removes the collection and unfiles its local requests. A tombstone is queued for a previously synced collection. This is not “delete all its requests everywhere.” Individual request deletion UI, full stale-device resurrection protection, compaction, purge and account deletion are still unfinished. Keep independent exports.

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

`e2e/encrypted-sync.spec.ts` uses two Chromium profiles with a real session provisioned through local Supabase Auth. It seeds that session into the browsers rather than automating login UI. The original case uses Sync now, verifies saved/unsaved behavior and a database collection tombstone, and now separately asserts saved-record updates, preserved editor contents and confirmed Revert. A second case avoids Sync now: it waits for automatic pull, alternates saves in both directions, preserves unsaved edits, and exercises focus/online handlers (synthetic events where needed for headless consistency). Neither case proves all session/network failure modes, simultaneous conflicts, second-device deletion cleanup or physical-device behavior.

**Verification pending:** both scenarios are updated and discovered by Playwright. Real execution of these updated cases requires the disposable local Supabase stack; Docker was unavailable during this update. Do not treat discovery/TypeScript checks as successful transport verification.

Run the updated scenarios with a disposable migrated local stack and its public key, not a production project:

```bash
OPENREQUEST_SYNC_E2E=1 OPENREQUEST_E2E_PORT=4175 \
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY=YOUR_LOCAL_PUBLIC_KEY \
npm run test:e2e -- --project=chromium --grep 'encrypted cross-device'
```

Keep a separate unused port/build for this configured test. Normal CI does not set `OPENREQUEST_SYNC_E2E`, so it skips this integration. Check CI run results separately; documentation is not a green-check certificate.

## Remaining work, prioritized

1. **P0 verification:** execute the updated draft-preservation and automatic alternating-device tests against local Supabase. Add owner switching during an in-flight run and second-device deletion coverage.
2. **Before wider beta:** complete Auth contract/lifecycle tests (session expiry/refresh/sign-out, email and OAuth callbacks, rate limits and disabled accounts). Email/password must ship signup, confirmation, forgot/reset-password and tests together; see [deferred Auth work](AUTH_SETUP.md#deferred-emailpassword-implementation).
3. **Sync reliability:** retry/backoff/jitter, incremental cursors, atomic application/recovery, duplicate-delivery/crash/flapping-network stress cases, concurrent edit/delete rules and stale-device resurrection prevention.
4. **Scope and consent:** explicit attach/import/merge preview, useful credential-exclusion previews, recovery for partially failed first-enable/bootstrap, selectable sync/pause behavior, clear pending/error/quota states, environment-tag decision.
5. **Recovery/lifecycle:** passphrase/key rotation, device revocation/transfer, version-history/restore UI, bounded retention/compaction, account/workspace deletion and export-before-delete.
6. **Operations/security:** independent security review, dependency scanning, rate/signup/email abuse limits, quota-exceeded handling, migration/rollback and backup/restore drills, metadata/privacy disclosures and incident response.

Sharing/team roles, public links, passkeys/TOTP, realtime collaboration and a Java sync backend remain later. No new central proxy or maintainer-operated database is required for local use.

## Release acceptance criteria (not all met)

- Ciphertext-only cloud content with honest local-key and metadata limitations.
- Current tests prove owner isolation and actual two-browser saved-request transport.
- Unconfigured/offline local use and exports remain available.
- Secret filtering is explicitly scoped; users can review what is uploaded/exported.
- Concurrent edits/deletions have tested recovery rules and cannot silently resurrect data.
- Users understand unlock, irreversible loss, deletion and operator responsibilities.
