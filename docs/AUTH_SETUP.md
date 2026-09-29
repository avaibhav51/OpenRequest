# Optional authentication setup

Authentication is optional. The PWA, local collections, environments, scripts, history, import, and export work indefinitely without an account. A configured deployment can additionally offer opt-in encrypted synchronization of saved requests and referenced collections.

The reference adapter uses the official open-source `@supabase/supabase-js` client. It works with Supabase's hosted Free plan or a self-hosted Supabase deployment. The current UI exposes email magic links and Google/GitHub social providers; see the [official Auth overview](https://supabase.com/docs/guides/auth). Password login is deliberately hidden until signup and recovery ship as one tested flow.

For the full storage and cost map, including where passwords, sessions, and OAuth secrets live, read [Auth data, storage, and costs](AUTH_DATA_AND_COSTS.md).

## Fastest local setup

The official OpenRequest Pages deployment intentionally leaves Supabase unconfigured because it has no operated sync backend. The following setup is for maintainers and for self-hosters/forks using their own Supabase project. With both `VITE_SUPABASE_*` values absent, no Supabase client is created and no Auth or sync request is sent.

1. Create a Supabase account and a Free-plan project, or run Supabase locally/self-hosted. Choose and safely retain the database password even though this frontend never receives it.
2. In the Supabase dashboard, open **Project Settings -> API** (or the current **Connect/API keys** screen) and copy the project URL and publishable key. A legacy `anon` key also works with the current variable name; never copy a secret or `service_role` key.
3. Copy `.env.example` to `.env.local` and set:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
   ```

4. In **Authentication -> URL Configuration**, set the Site URL to `http://localhost:5173` while developing and add `http://localhost:5173/**` to allowed redirects. Add the exact final GitHub Pages URL (including the repository path) and its `/**` form before deployment. Supabase documents the redirect allow-list behavior in its [Redirect URLs guide](https://supabase.com/docs/guides/auth/redirect-urls).
5. In **Authentication -> Providers**, leave Email enabled. Configure Google and GitHub separately only if wanted; each requires an OAuth app/client with that provider and the callback URL shown by Supabase.
6. Restart `npm run dev`. The top-bar experimental account button will enable the configured methods.
7. For a fork or independently hosted GitHub Pages site, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as GitHub **Actions repository variables**, then rerun the Pages workflow. Do not add them to the official deployment until its operator deliberately accepts the abuse, email, quota, backup, privacy, and incident-response responsibilities.

Apply the checked-in migration with `supabase db push` (or the equivalent reviewed migration workflow) before exposing the sync control. The frontend values enable authentication; the migrated tables and policies enable encrypted synchronization. Test magic links first, then each OAuth provider and the two-device sync flow independently.

The anon/publishable key is designed for frontend use with Row Level Security. Never place a service-role key, OAuth provider secret, or SMTP password in a `VITE_` variable. `.env.local` is ignored by this repository.

## Deferred operator checklist: enable sync later

Nothing in this section is required for local-only use. Return to it when you are ready to operate Auth and encrypted synchronization for your deployment.

### 1. Create and migrate the Supabase project

Create a hosted Free-plan Supabase project, or choose a self-hosted Supabase instance. From the OpenRequest repository run:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Review the listed migrations before confirming the push. They create the owner-only workspace and append-only encrypted-revision tables, wrapped-key fields, server ordering, constraints, indexes, and Row Level Security policies. Run the checked-in local security tests separately before schema changes are released:

```bash
npx supabase start
npm run test:db
npm run test:db:api
npx supabase stop --no-backup
```

These tests use disposable local users and Docker; do not point them at production.

### 2. Configure authentication and redirects

In Supabase Authentication:

1. Keep only the providers you intend to support.
2. Add `http://localhost:5173/**` for local development.
3. Add the complete deployed URL and wildcard, for example `https://avaibhav51.github.io/OpenRequest/**`.
4. Configure Google/GitHub OAuth applications only when needed.
5. Review signup policy, email rate limits, SMTP, CAPTCHA/abuse controls, and free-tier quotas before allowing public signup.

Provider client secrets and SMTP credentials stay in Supabase/provider configuration. They never belong in this repository or a `VITE_` variable.

### 3. Connect a local build

Create `.env.local` from `.env.example` and add only the public browser values:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

Restart the development server after changing these values:

```bash
npm run dev
```

### 4. Connect GitHub Pages

In the GitHub repository open **Settings -> Secrets and variables -> Actions -> Variables** and add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Use repository **variables**, not secrets, because these two values are intentionally embedded in the frontend. Never add the database password, Supabase secret/service-role key, OAuth secret, or SMTP password. Rerun the Pages workflow or push a new commit so Vite rebuilds with the values.

### 5. Enable the first browser

1. Open the rebuilt OpenRequest deployment and sign in.
2. Open **Account and encrypted sync**.
3. Choose a unique sync passphrase of at least 12 characters.
4. Select **Enable / unlock sync** and wait for the synchronized result.
5. Store the passphrase in a password manager. Do not reuse the Supabase/account password.

The browser generates the workspace key. The sync passphrase wraps that key locally; neither the passphrase nor plaintext workspace key is uploaded. Supabase stores the wrapped key and encrypted revisions. Existing saved requests are bootstrapped; unsaved drafts, responses, history, variables, active authorization values, and never-synchronized empty collections remain local.

### 6. Add another phone or computer

1. Open the same deployment and sign into the same Supabase account.
2. Open **Account and encrypted sync**.
3. Enter the same sync passphrase once and select **Enable / unlock sync**.
4. Confirm that a saved test request appears.
5. Save a harmless change on one device and confirm it appears on the other after focus/reconnect or **Sync now**.

The unlocked workspace key is retained in that browser profile. Normal launches restore the account session and local key; another unlock is needed after clearing site data, using private browsing/a new profile, session revocation, or losing the browser storage.

### 7. Operational checks

- Test with non-sensitive requests before relying on the workspace.
- Verify Alice/Bob isolation and the deployed redirect list.
- Keep JSON collection exports as independent backups.
- Monitor Supabase database, bandwidth, Auth/email quotas, and project-pausing policies.
- Document who handles migrations, backups, incidents, account deletion, and provider-secret rotation.
- Remember that passphrase rotation, device revocation/key rotation, and a revision-history/undo UI are not implemented yet.

If every trusted browser and the sync passphrase are lost, the encrypted cloud workspace cannot currently be recovered.

## Why the public key can be visible

The project URL and publishable/anon key identify the Supabase project and allow browser requests; they do not grant administrator access. They are embedded in the built JavaScript and every user can inspect them. Security therefore cannot depend on concealing them.

The checked-in sync migration enables Row Level Security and policies that only allow the authenticated owner to access a workspace. With RLS enabled, the public key plus Alice's session can access Alice's permitted rows, not Bob's. A secret or `service_role` key bypasses these policies and belongs only in a protected server environment—never in this PWA, GitHub variables used by Vite, source control, logs, or screenshots.

RLS protects database rows; it does not by itself stop automated account creation, login attempts, or email abuse. Before public launch, disable unused providers, configure redirect allow-lists, review Auth rate limits, enable CAPTCHA where appropriate, and configure dependable SMTP if email links/confirmation are promised. Free-tier quotas and inactive-project policies still apply.

The PWA now supports opt-in encrypted synchronization when the operator applies the checked-in `sync_workspaces` and `sync_revisions` migration. The user must sign in and explicitly enable or unlock sync with a separate sync passphrase. RLS is mandatory and tested, and the official unconfigured deployment remains local-only.

## Email

Email/password is enabled by default on hosted Supabase projects. Email verification, magic links, codes, and password recovery require working email delivery. The built-in development mailer is rate-limited; production should use a configured SMTP provider. See [password-based Auth](https://supabase.com/docs/guides/auth/passwords).

The current UI supports email magic-link requests, session persistence, and sign-out. It does **not** expose email/password signup or sign-in because password authentication without a complete forgot-password flow is an incomplete feature.

Email-link sign-in and account creation are now separate actions. Sign-in sends `shouldCreateUser: false`; only the explicit “Create account with email” action permits user creation. Both return a neutral success message and provider errors are reduced to safe categories. Each operator must still choose open signup versus invite-only access, configure abuse/rate controls, and test existing, unknown, disabled, and rate-limited addresses before public Auth is enabled.

When password authentication is implemented, signup, sign-in, email confirmation, forgot-password, recovery-session handling, new-password entry, expired/used-link errors, and regression coverage must ship together. Supabase sends recovery mail with `resetPasswordForEmail`; after the redirect returns to OpenRequest, the app must recognize the recovery session and let the user choose a new password with `updateUser`.

### Deferred email/password implementation

Email/password is a prioritized future fallback for synchronized accounts, but it must remain optional for local use. Ship signup, confirmation, sign-in, forgot/reset password, recovery, and session handling as one release:

1. Create an account without disclosing whether an unrelated address already exists.
2. Confirm email through an allow-listed OpenRequest callback; handle expired, used, invalid, and resend states.
3. Sign in with generic invalid-credential errors and restore valid sessions.
4. Request password recovery with a neutral response such as “If an account exists, a recovery link has been sent.”
5. Recognize the Supabase recovery session rather than treating its callback as an ordinary login.
6. Accept and confirm a new password through `updateUser`, then retire the recovery state.
7. Handle expiry, refresh failure, password change, sign-out, and revoked sessions without losing local data.

Expected Supabase operations are `signUp`, `signInWithPassword`, `resetPasswordForEmail`, recovery auth-state handling, `updateUser`, and `signOut`. Confirmation and recovery URLs must use Vite's base path and appear in the deployment's Supabase redirect allow-list.

Required UI states are create account, confirmation pending/resend, sign in, forgot password, choose new password, recovery complete, invalid/expired/used link, and expired/revoked session. All must make clear that account failure does not remove local collections.

Security and operator requirements:

- never store, log, export, or persist plaintext passwords;
- send credentials only over HTTPS, except trusted localhost development;
- use Supabase's password hashing rather than frontend hashing;
- support password managers, generated long passwords, paste, and correct `autocomplete` attributes;
- use generic recovery/signup responses where needed to reduce account enumeration;
- configure SMTP, sender/domain, templates, redirects, rate limits, and CAPTCHA/abuse controls;
- keep SMTP, OAuth, database, Supabase secret, and `service_role` credentials out of `VITE_` variables;
- use a captured-email tool such as Mailpit for local Supabase development.

The account password must not directly become the workspace encryption key. Resetting an account password must not destroy or falsely recover end-to-end encrypted workspaces; workspace-key recovery needs its own user-held recovery material and/or trusted-device design.

Before password fields return to the UI, mocked browser tests must cover the complete lifecycle, error/link states, session restoration, localhost and `/OpenRequest/` redirects, accessibility, mobile layout, password-manager semantics, and preservation of IndexedDB data. A separately gated disposable Supabase environment must verify the real signup-confirmation-login-reset-login lifecycle without making normal pull requests depend on external email delivery.

Password login is releasable only when all these paths work together and the operator responsibilities are documented. A free SMTP allowance may support a small deployment, but permanently free reliable email delivery cannot be guaranteed.

Username profiles are not yet implemented. Do not treat a display name as an authentication identifier.

## Google and GitHub

Enable each provider in the Supabase Auth provider settings, then create the corresponding OAuth application with Google/GitHub. Use the callback URL displayed by Supabase for the provider and allow the PWA's local and deployed URLs as application redirects. Google requires its own consent-screen and OAuth client configuration; follow the [official Google provider guide](https://supabase.com/docs/guides/auth/social-login/auth-google).

Provider client secrets belong in Supabase/provider configuration—not in this frontend repository.

An OAuth application is the registration that tells Google or GitHub which product is requesting identity and which callback URL is trusted:

- **GitHub:** GitHub Settings -> Developer settings -> OAuth Apps -> New OAuth App. Use the OpenRequest deployment as the homepage and the Supabase callback shown under the GitHub provider as the authorization callback URL. Copy the resulting client ID and client secret into Supabase Authentication -> Providers -> GitHub.
- **Google:** create/configure a Google Cloud project and OAuth consent screen, create a Web application OAuth client, and add the Supabase callback shown under the Google provider as an authorized redirect URI. Copy its client ID and client secret into Supabase Authentication -> Providers -> Google.

The provider first returns to Supabase at a URL shaped like `https://YOUR_PROJECT.supabase.co/auth/v1/callback`. Supabase validates the provider response, creates the Supabase session, and then returns the browser to the local or deployed OpenRequest URL from the allowed redirect list. OpenRequest now derives that final URL from Vite's base path, so a project deployment returns to `/OpenRequest/` rather than the portfolio root.

## Magic-link redirects

When OpenRequest calls `signInWithOtp`, it supplies its current base URL as `emailRedirectTo`. Supabase puts that destination into the email flow. The user opens the link, Supabase verifies its one-time token, and the browser is redirected back to OpenRequest with enough information for the Supabase client to establish the session.

For local testing, allow `http://localhost:5173/**`. For the current Pages deployment, allow `https://avaibhav51.github.io/OpenRequest/**`. The destination must be allow-listed; otherwise Supabase falls back to the configured Site URL. Links expire and should be treated as credentials. Public production use also needs reviewed rate limits, bot protection, and dependable SMTP.

## Excluded paid-delivery methods

Phone/SMS OTP is deliberately not exposed by the app. Reliable delivery requires a messaging provider and introduces metered cost and abuse controls. Deployments that need phone verification should maintain it as their own downstream integration rather than making it a default OpenRequest dependency.

## Self-hosting

Supabase documents Docker as its recommended self-hosting path, and states that the self-hosted stack does not phone home or collect telemetry. See [Self-Hosting](https://supabase.com/docs/guides/self-hosting) and [self-hosted Auth configuration](https://supabase.com/docs/guides/self-hosting/auth/config).

Self-hosting transfers responsibility for updates, backups, SMTP, OAuth secrets, abuse prevention, availability, and security monitoring to the operator. It removes a mandatory SaaS dependency, but it is not zero-effort hosting.

There are two independent self-host choices:

1. **Self-host OpenRequest, use a personal Supabase project:** deploy the static PWA anywhere, apply the checked-in migrations, and inject that project's URL/publishable key at build time. Supabase runs Auth and encrypted sync storage.
2. **Self-host both OpenRequest and Supabase:** run the PWA plus the Supabase Docker stack. Configure the public API URL/key, JWT/server secrets, database, backups, SMTP, redirect URLs, OAuth provider secrets, TLS/reverse proxy, upgrades, logs, rate limits, and disaster recovery yourself.

The sync distribution includes versioned SQL migrations, RLS policies, verification tests, and configuration examples. Backup/restore drills, key rotation, and a guided migration/export path remain required before a stable release.

## Current boundary

Login alone does not upload anything. Enabling encrypted sync creates or unlocks a client-side workspace key, queues an initial snapshot of saved requests and referenced collections, and starts automatic push/pull. A new browser signs in and enters the sync passphrase once; the unlocked key is then retained in that browser's IndexedDB.

The main synchronization challenges are:

- defining stable IDs, versions, migrations, and an export-compatible server format;
- encrypting request bodies, variables, and credentials before upload while supporting recovery and additional devices;
- deciding which secrets never sync by default;
- merging edits made offline on two devices without silently losing data;
- propagating deletions and preventing an old device from restoring deleted content;
- enforcing per-user access with RLS and testing that one account cannot read another account's rows;
- handling quotas, backups, account deletion, provider outages, and export away from Supabase;
- communicating sync state and errors so “saved” never falsely implies “uploaded.”

The initial sync milestone covers saved requests and referenced collections, uses per-workspace encrypted revision records, strips known active authorization values, provides passphrase-based new-browser unlock, and leaves local-only mode fully functional. Variables, responses, history, and unsaved drafts remain local.

One browser profile has one shared IndexedDB database regardless of which Supabase account is signed in. Enabling/unlocking sync creates an immutable owner binding, and the processor fails closed if another account signs in. Sign-out stops network synchronization without deleting local data; switching accounts never silently reassigns or merges the local workspace.

A trusted browser should not ask the user to sign in on every launch. Supabase persists and refreshes the browser session, and OpenRequest will restore its locally protected workspace key. Sign-in/unlock returns only when the session is signed out, revoked or expired, site data is cleared, the user opens a private/new browser profile, or a configured security policy requires reauthentication.
