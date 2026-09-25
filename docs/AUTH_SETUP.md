# Optional authentication setup

Authentication is optional. The PWA, local collections, environments, scripts, history, import, and export work indefinitely without an account. Signing in currently creates an account session; encrypted collection sync is a later milestone.

The reference adapter uses the official open-source `@supabase/supabase-js` client. It works with Supabase's hosted Free plan or a self-hosted Supabase deployment. This app exposes passwords, email magic links, and Google/GitHub social providers; see the [official Auth overview](https://supabase.com/docs/guides/auth).

For the full storage and cost map, including where passwords, sessions, and OAuth secrets live, read [Auth data, storage, and costs](AUTH_DATA_AND_COSTS.md).

## Fastest local setup

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
7. For GitHub Pages, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as GitHub **Actions repository variables**, then rerun the Pages workflow.

This enables authentication, not collection synchronization. Test email/password first, then magic links, then each OAuth provider independently.

The anon/publishable key is designed for frontend use with Row Level Security. Never place a service-role key, OAuth provider secret, or SMTP password in a `VITE_` variable. `.env.local` is ignored by this repository.

## Why the public key can be visible

The project URL and publishable/anon key identify the Supabase project and allow browser requests; they do not grant administrator access. They are embedded in the built JavaScript and every user can inspect them. Security therefore cannot depend on concealing them.

For future sync tables, enable Row Level Security and add policies that only allow an authenticated user to read or change rows whose `user_id` equals `auth.uid()`. With RLS enabled, the public key plus Alice's session can access Alice's permitted rows, not Bob's. A secret or `service_role` key bypasses these policies and belongs only in a protected server environment—never in this PWA, GitHub variables used by Vite, source control, logs, or screenshots.

RLS protects database rows; it does not by itself stop automated account creation, login attempts, or email abuse. Before public launch, disable unused providers, configure redirect allow-lists, review Auth rate limits, enable CAPTCHA where appropriate, and configure dependable SMTP if email links/confirmation are promised. Free-tier quotas and inactive-project policies still apply.

The app currently creates no sync tables and performs no database reads or writes. Consequently, RLS is not yet needed for application data, and exposing the publishable key currently enables only the configured Auth endpoints. RLS becomes mandatory when sync storage is introduced.

## Email

Email/password is enabled by default on hosted Supabase projects. Email verification, magic links, codes, and password recovery require working email delivery. The built-in development mailer is rate-limited; production should use a configured SMTP provider. See [password-based Auth](https://supabase.com/docs/guides/auth/passwords).

The current UI supports:

- email/password sign-in and registration;
- email magic-link request;
- session persistence and sign-out.

Username profiles are not yet implemented. Do not treat a display name as an authentication identifier.

## Google and GitHub

Enable each provider in the Supabase Auth provider settings, then create the corresponding OAuth application with Google/GitHub. Use the callback URL displayed by Supabase for the provider and allow the PWA's local and deployed URLs as application redirects. Google requires its own consent-screen and OAuth client configuration; follow the [official Google provider guide](https://supabase.com/docs/guides/auth/social-login/auth-google).

Provider client secrets belong in Supabase/provider configuration—not in this frontend repository.

## Excluded paid-delivery methods

Phone/SMS OTP is deliberately not exposed by the app. Reliable delivery requires a messaging provider and introduces metered cost and abuse controls. Deployments that need phone verification should maintain it as their own downstream integration rather than making it a default OpenRequest dependency.

## Self-hosting

Supabase documents Docker as its recommended self-hosting path, and states that the self-hosted stack does not phone home or collect telemetry. See [Self-Hosting](https://supabase.com/docs/guides/self-hosting) and [self-hosted Auth configuration](https://supabase.com/docs/guides/self-hosting/auth/config).

Self-hosting transfers responsibility for updates, backups, SMTP, OAuth secrets, abuse prevention, availability, and security monitoring to the operator. It removes a mandatory SaaS dependency, but it is not zero-effort hosting.

## Current boundary

Login does not upload or synchronize existing local collections. Before sync is enabled, the project must implement client-side workspace encryption, key recovery/device pairing, ciphertext revision storage, deletion semantics, and conflict handling. The interface states this explicitly to avoid implying that authentication is already a backup service.

The main synchronization challenges are:

- defining stable IDs, versions, migrations, and an export-compatible server format;
- encrypting request bodies, variables, and credentials before upload while supporting recovery and additional devices;
- deciding which secrets never sync by default;
- merging edits made offline on two devices without silently losing data;
- propagating deletions and preventing an old device from restoring deleted content;
- enforcing per-user access with RLS and testing that one account cannot read another account's rows;
- handling quotas, backups, account deletion, provider outages, and export away from Supabase;
- communicating sync state and errors so “saved” never falsely implies “uploaded.”

A safe first sync milestone should cover collections and non-secret environments, use per-workspace encrypted revision records, exclude secret values by default, provide a recovery/export path, and leave local-only mode fully functional.
