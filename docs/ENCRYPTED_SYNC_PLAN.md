# Future encrypted synchronization and RLS

## Status and reminder

This is a prioritized future use case, not a current capability. When selecting suggested work after the local client is stable, surface these two items together:

1. test Supabase Auth without storing application data;
2. design and implement encrypted synchronization with Row Level Security before claiming login backs up user work.

The current login creates only a Supabase Auth session. Collections, requests, environments, variables, scripts, and history remain in the current browser's IndexedDB.

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

## Staged delivery

1. Auth-only automated tests, with no application tables.
2. RLS policy prototype using disposable test users; prove cross-user denial.
3. Versioned collection model and local outbox, still without cloud upload.
4. Client-side encryption test vectors and recovery design review.
5. Single-user encrypted collection sync, excluding secrets.
6. Offline/conflict/deletion and multi-device testing.
7. Security review, deletion/export documentation, quota behavior, and opt-in beta.
8. Package reproducible self-host assets: migrations, RLS/policy tests, local seed/config, upgrade/rollback, backup/restore, and a deployment verification command.

Before sync is offered to ordinary users, authentication must provide at least one complete recoverable login path. Email/password is the preferred straightforward fallback when implemented according to [Auth setup](AUTH_SETUP.md#deferred-emailpassword-implementation); OAuth and magic-link availability must not be the user's only route back into encrypted synchronized data.

Do not add shared workspaces until single-user encrypted sync is demonstrably correct.

## Definition of done

- The server cannot read workspace plaintext.
- Tests prove one account cannot access another account's rows.
- Losing the cloud service does not prevent local use or export.
- Sync never uploads excluded secrets.
- Conflicting edits and deletions cannot silently lose or resurrect data.
- Users understand recovery, deletion, retention, and metadata limitations.
