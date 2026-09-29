# Encrypted synchronization and RLS

## Status and reminder

Single-owner encrypted cross-device synchronization is now implemented as an opt-in capability for deployments connected to their own migrated Supabase project. The official deployment remains local-only unless its operator deliberately configures that service.

1. test Supabase Auth without storing application data;
2. design and implement encrypted synchronization with Row Level Security before claiming login backs up user work.

Login alone creates only a Supabase Auth session. Explicitly enabling sync creates a random workspace key, wraps it with a passphrase-derived key, uploads only the wrapped key, and bootstraps saved requests plus referenced collection metadata. Another browser signs in and enters the passphrase once to unlock the same workspace. The outbox processor encrypts and uploads revisions, pulls in server sequence order, applies latest-wins per object, and propagates collection tombstones. History, responses, unsaved drafts, variable values, never-synced empty collections, and active authorization values remain excluded.

## Deployment decision

Implement sync as an opt-in capability that a self-hoster or fork can connect to its own hosted-Free or self-hosted Supabase instance. Do not connect the official OpenRequest Pages deployment to a maintainer-owned Supabase project by default. With no Supabase URL/key in that build, there is no shared Auth/database project for outsiders to consume or abuse, and the account control remains unavailable except for setup guidance.

The repository should eventually ship the client, versioned database migrations, RLS policies, policy tests, local Supabase development configuration, and operator documentation. Enabling it is a deployment decision, not a requirement for local mode. This keeps the feature useful without transferring every installation's quota, user data, email delivery, and incident-response burden to the OpenRequest maintainer.

This reduces central service risk but does not make a self-hosted instance automatically safe. Its operator remains responsible for exposed endpoints, signup abuse, SMTP, backups, upgrades, monitoring, privacy obligations, and compromised-account response.

## Is a zero-cost implementation feasible?

Yes for development, personal use, and a small beta. The existing React PWA can use Web Crypto for client-side encryption, IndexedDB for its local working copy, and a Supabase Free project for Auth plus encrypted revision rows. Local mode and self-hosting remain available without Supabase.

Zero cost is not a permanent scale guarantee. Hosted-project, database, storage, bandwidth, build, and email quotas can change or be exceeded. Production email delivery may require SMTP with its own limits or cost. A custom domain is optional and normally paid. The project must document current quotas and preserve export/self-host migration instead of promising unlimited free cloud service.

## Proposed boundary

- The browser remains the source of plaintext workspace data.
- Generate a random workspace encryption key in the browser.
- Encrypt workspace revisions with authenticated encryption before upload.
- Supabase stores ciphertext, non-secret revision metadata, account/device membership, and deletion markers.
- Secret environment values and active API credentials are excluded by default.
- The Supabase publishable key is public; the user's session and RLS policies authorize rows.
- A `service_role` key never appears in the PWA.

## Candidate data model

- `workspaces`: opaque workspace identity, owner, encrypted metadata, timestamps.
- `workspace_members`: user/workspace relationship and role; sharing is deferred initially.
- `devices`: registered device public keys and revocation state.
- `revisions`: workspace ID, stable object ID, parent/version, ciphertext, nonce, algorithm version, timestamp, author device.
- `tombstones`: encrypted or minimally identifying deletion records that prevent stale-device resurrection.

Every exposed table must enable RLS. Initial policies should restrict all reads and writes to an authenticated user who owns the workspace. Sharing policies come later and require separate adversarial tests.

## Key and recovery decisions required first

- Whether recovery uses a user-held recovery phrase, another trusted device, a passphrase-derived wrapping key, or a combination.
- How a new device receives the workspace key without the server learning it.
- What happens when all devices and recovery material are lost.
- How keys rotate after device revocation or suspected compromise.
- What metadata remains visible even though content is encrypted.

The UI must be explicit that end-to-end encryption can make unrecovered data permanently inaccessible.

## Synchronization rules

- Give every collection/request/environment a stable identifier and schema version.
- Maintain a local outbox so edits remain reliable offline.
- Pull remote revisions, decrypt locally, and apply deterministic merges.
- Never silently choose a winner for incompatible concurrent edits; preserve both versions or present a conflict.
- Propagate deletions with tombstones and retention rules.
- Show separate local-saved, sync-pending, synchronized, conflict, and error states.
- Keep export usable even when the sync service is unavailable.

### Agreed saved-request and device behavior

- A previously trusted browser profile restores its Supabase session and protected local workspace key automatically under normal conditions. Reauthentication is required only after explicit sign-out, session revocation/expiry, account-security changes, cleared site data, private browsing, a new browser profile, or operator policy. A local biometric/PIN lock may be optional but is not required for every launch.
- Only explicitly saved requests participate in synchronization. The current unsaved editor draft remains browser-local even if it is based on a synchronized request; it enters the outbox only when the user selects Save. Responses and run history remain local.
- Synchronization is object-scoped. Changes to different request IDs never conflict and can apply independently.
- For two saved revisions of the same request, use deterministic last-write-wins based on server-assigned revision order, not device timestamps. The later accepted revision becomes current automatically. Retain the displaced revision for a bounded undo/version-history period so automatic resolution does not silently destroy recoverable work.
- An empty collection that has never contained a synchronized request remains local to that browser and does not create a cloud row. When the first request in it is saved for synchronization, upload the collection metadata immediately before that request.
- Once a collection has participated in sync, becoming empty later does not silently make it local-only or erase it remotely. Its existing synchronized identity and deletion state remain until the user explicitly chooses to stop syncing or delete it everywhere.
- After initial trust/unlock, devices push saved changes and pull remote revisions automatically on save, launch, reconnect, focus, and a modest background interval. A manual Sync now control is diagnostic, not part of the normal workflow.

## Staged delivery

1. **Pending:** Auth-only automated tests using an isolated Auth setup and no workspace reads or writes.
2. **Done for v1:** Owner-only RLS plus local two-user pgTAP and public API suites.
3. **Done for v1:** Versioned collection/request/environment model, coalescing outbox, and explicit first-enable bootstrap.
4. **Done for v1:** Client-side encryption and passphrase-wrapped workspace-key recovery.
5. **Done for v1:** Single-owner encrypted saved-request and collection sync, excluding active authorization values.
6. **Started:** Offline/latest-wins/deletion and real two-browser testing are implemented; retry/backoff, bounded undo UI, request deletion UI, key rotation, and larger stress matrices remain.
7. Security review, deletion/export documentation, quota behavior, and opt-in beta.
8. Package reproducible self-host assets: migrations, RLS/policy tests, local seed/config, upgrade/rollback, backup/restore, and a deployment verification command.

Before sync is offered to ordinary users, authentication must provide at least one complete recoverable login path. Email/password is the preferred straightforward fallback when implemented according to [Auth setup](AUTH_SETUP.md#deferred-emailpassword-implementation); OAuth and magic-link availability must not be the user's only route back into encrypted synchronized data.

Do not add shared workspaces until single-user encrypted sync is demonstrably correct.

## Current database prototype

The repository now includes a deliberately narrow owner-only prototype under `supabase/`:

- `sync_workspaces` identifies an authenticated owner;
- `sync_revisions` stores append-only ciphertext, nonce, algorithm/version metadata, and stable object identity;
- anonymous access is revoked;
- authenticated reads/inserts are restricted by RLS to the workspace owner;
- clients cannot update or delete an individual revision, preventing history rewrites; deleting an owned workspace cascades its revisions;
- sharing, members, devices, recovery-key wrapping, transport, and conflict resolution are still absent.

The browser-side AES-GCM envelope is now implemented and tested, but recovery-key wrapping and transport remain absent. The database requires the supported algorithm/envelope version, a standard 12-byte nonce, authenticated ciphertext between 17 bytes and 1 MiB plus its 16-byte tag, unique idempotency per workspace, immutable rows, and server-generated revision timestamps. Revisions may share a client sequence so concurrent offline branches do not overwrite one another; their parent relation is preserved for later conflict handling.

The schema accepting a `bytea` value does **not** prove the value was encrypted safely. Client encryption and fixed test vectors must ship before the app writes to these tables. The migration is currently a testable security boundary, not a live synchronization feature.

### Run the local multi-user security tests

Prerequisites are the open-source Supabase CLI and Docker Desktop, OrbStack, Podman, or another Docker-compatible runtime. No hosted Supabase account, API key, real user, email provider, or paid service is involved.

```bash
supabase start
npm run test:db
npm run test:db:api
supabase stop
```

The pgTAP transaction creates Alice and Bob as disposable local Auth records, seeds one workspace/revision for each, switches the PostgreSQL role and JWT claim between `anon`, Alice, and Bob, and then rolls everything back. Its negative cases cover anonymous reads, cross-user reads, updates/deletes, writing revisions into another owner's workspace, forged ownership, revision rewrites, invalid encryption metadata, duplicate idempotency, oversized payloads, and forged timestamps. The public-API suite separately creates authenticated local sessions and verifies the same owner boundary through PostgREST.

This is the correct multi-user test for the current stage because it exercises PostgreSQL and RLS directly. It does not yet test browser login, encrypted upload/download, two devices, merge conflicts, key recovery, or network failure. Those require the later client transport and encryption stages and must remain separately identified rather than mocked as completed sync.

If `supabase` is not installed, follow the current official local-development installation instructions, then run the commands above. Do not point this suite at production: `supabase test db` is intended for the local stack and the test creates disposable Auth rows.

## Authentication and synchronization dependency audit

This section is the consolidated implementation checklist. “Blocker” means the feature must not be presented as backup/sync until resolved. “Required before beta” may follow the first encrypted round trip but must precede ordinary-user availability. “Later” must not be pulled into the single-user milestone.

### Blockers before the first upload

| Area | Current state / risk | Required implementation and tests |
| --- | --- | --- |
| Auth meaning | **Guardrail implemented:** email sign-in cannot create a user; account creation is a separate explicit action with neutral messages. | Define invite/open-signup operator policy and add configured UI/provider tests for existing, unknown, disabled, and rate-limited users. |
| Local account binding | **Guardrail implemented:** a binding model and fail-closed owner check prevent a future processor from running unbound or after an account switch. No UI creates a binding yet. | Add explicit attach/import UX and test Alice → sign out → Bob in the same browser before transport exists. |
| Encryption envelope | **Foundation implemented:** canonical JSON, AES-GCM-256, random 12-byte nonces, authenticated workspace/object context, envelope versioning, size limits, round-trip/export, and tamper tests. | Add fixed browser interoperability vectors and recovery-key wrapping; keep all transport disabled until then. |
| Key recovery | Auth password/OAuth access is not the workspace encryption key. A new device currently has no way to decrypt. | Choose recovery phrase, passphrase-wrapped key, trusted-device transfer, or a reviewed combination. Document irreversible loss, rotation, device revocation, and recovery verification. |
| Upload scope | **Guardrail implemented:** initial serializer permits collection/environment metadata and hard-blocks requests, so credentials, bodies, and scripts cannot enter a future upload accidentally. | Add explicit request-field review/preview and secret detection before expanding the allow-list. Test that excluded values never reach network mocks or SQL. |
| Revision protocol | **Partially implemented:** immutable revisions now have parent linkage, per-workspace idempotency, concurrent client sequences, and server-owned timestamps. | Define base/hash validation, conflict records, pull cursors, and deterministic resolution. Never rely on client clocks for truth. |
| Deletion | `operation = delete` exists, but retention, tombstone payload, restore, purge, and stale-device behavior are undefined. | Define deletion/tombstone format and retention. Prove an old offline device cannot resurrect deleted objects. Distinguish local removal, cloud removal, workspace deletion, and account deletion. |
| Transport/outbox | **Initial processor implemented:** owner binding, encryption, cross-tab Web Lock, acknowledgement-before-removal, automatic launch/save/focus/reconnect/interval triggers, and pending preservation on failure. | Add exponential backoff/jitter, richer retry classification/visibility, pagination, and crash/flapping-network stress tests. |
| Bootstrap | Existing entities are not automatically in the outbox and may predate sync schema assumptions. | Provide an explicit “Enable sync for this workspace” snapshot after validation/encryption, with progress, cancellation, duplicate detection, and rollback that leaves the local copy intact. |
| End-to-end authorization | **Core path implemented:** a local test creates real Alice/Bob sessions through Auth and verifies owner read/insert and cross-user denial through the public Data API. | Add expired/revoked tokens, wrong audience/project, anonymous operations, and account deletion/session-change cases. |

### Required before an opt-in beta

| Area | Issue to cover |
| --- | --- |
| Auth lifecycle | Session restoration/refresh, revoked and expired sessions, OAuth/magic-link callback cleanup, provider outage, email change, duplicate/linked identities, disabled/deleted accounts, and complete email-password confirmation/recovery if password login is offered. Supabase can associate multiple identities with a user, so provider switching must not create an unexplained second workspace. |
| Browser session security | Tokens are persisted in browser storage for this client-side PWA. Add a restrictive deployable CSP, dependency/security scanning, no third-party runtime scripts, sanitized errors/logs, and a clear “sign out this device/all devices” model where the selected plan supports it. |
| Multi-tab and multi-device | Concurrent editing, duplicate delivery, pull during local edits, offline queues, conflict presentation, device naming/revocation, and key rotation after a device is lost. |
| Schema/crypto migration | Forward/backward compatibility, unknown-field preservation, migration of local schema and encrypted envelopes, minimum supported client version, and rollback/export before destructive upgrades. |
| Quota and abuse | Individual ciphertext is now constrained to a 1 MiB plaintext ceiling plus the AES-GCM tag. Still add per-workspace/revision growth limits, rate limits, signup/email abuse protection, retry-storm control, compaction, quota-exceeded UI, and safe read-only/export behavior. |
| Metadata privacy | Document what remains visible to the operator: account identifiers, workspace/revision/object IDs, object type, operation, timestamps, sizes, IP/service logs, and access patterns. Encrypt names/descriptions and minimize stable metadata where practical. |
| Lifecycle and deletion | Reauthentication/confirmation for destructive cloud deletion, account deletion workflow, cascading data behavior, backups and retention, export-before-delete, recovery/grace policy, and verification that deletion eventually reaches replicas/backups according to operator policy. |
| Operations | Migration/rollback verification, backup/restore drills, SMTP and OAuth secret rotation, monitoring without plaintext, incident response, project pause/outage behavior, region/privacy disclosures, and upgrade compatibility for self-hosters. |
| User experience | Never use one ambiguous “Saved” state. Show local saved, sync disabled, pending, uploading, synchronized, conflict, paused/auth-required, quota exceeded, and failed—with export always available. |
| Test matrix | Chromium/WebKit/mobile; two users; two devices; two tabs; slow/offline/flapping network; corrupted ciphertext; wrong/revoked key; concurrent edit/delete; provider/session expiry; database restore; and Supabase-hosted versus local/self-hosted configuration. |

### Explicitly later

- Shared/team workspaces, invitations, roles, and member removal.
- Encrypted public links or review links.
- Passkeys, TOTP/MFA, manual identity linking, and organization SSO.
- Realtime collaboration; pull/push synchronization is sufficient initially.
- A separate Java/Spring backend. Keep the encrypted revision protocol portable, but do not build two servers before one secure single-user flow works.

### Recommended next implementation order

1. Add deterministic Auth contract tests for unconfigured, magic-link, OAuth redirect, callback, session restore, sign-out, and error states; decide whether magic-link creates accounts.
2. Define the provider-neutral encrypted envelope and recovery/key-transfer decision, with Web Crypto test vectors and secret-exclusion tests.
3. Add immutable local workspace identity plus explicit owner/remote binding, including the Alice/Bob same-browser switch test.
4. Amend the database revision protocol for parent/idempotency/conflict and payload limits; extend pgTAP and public-API integration tests.
5. Implement one-way encrypted bootstrap/upload behind an experimental opt-in, then download into a clean second browser profile.
6. Add acknowledgements, retries, multi-tab leadership, tombstones, conflicts, device/recovery UX, deletion/export, and operational verification before beta language appears.

## Definition of done

- The server cannot read workspace plaintext.
- Tests prove one account cannot access another account's rows.
- Losing the cloud service does not prevent local use or export.
- Sync never uploads excluded secrets.
- Conflicting edits and deletions cannot silently lose or resurrect data.
- Users understand recovery, deletion, retention, and metadata limitations.
