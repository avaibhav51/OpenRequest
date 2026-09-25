# Optional authentication setup

Authentication is optional. The PWA, local collections, environments, scripts, history, import, and export work indefinitely without an account. Signing in currently creates an account session; encrypted collection sync is a later milestone.

The reference adapter uses the official open-source `@supabase/supabase-js` client. It works with Supabase's hosted Free plan or a self-hosted Supabase deployment. This app exposes passwords, email magic links, and Google/GitHub social providers; see the [official Auth overview](https://supabase.com/docs/guides/auth).

For the full storage and cost map, including where passwords, sessions, and OAuth secrets live, read [Auth data, storage, and costs](AUTH_DATA_AND_COSTS.md).

## Fastest local setup

1. Create a Supabase project, or run Supabase locally/self-hosted.
2. Copy `.env.example` to `.env.local`.
3. From the project settings, copy the project URL and frontend anon/publishable key:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
   ```

4. In Auth → URL Configuration, set the Site URL to `http://localhost:5173` for local development and add it to the allowed redirect URLs. Add the final production URL before deployment. Supabase documents the redirect allow-list behavior in its [Redirect URLs guide](https://supabase.com/docs/guides/auth/redirect-urls).
5. Restart `npm run dev`. The top-bar **Sign in** button will enable the configured methods.

The anon/publishable key is designed for frontend use with Row Level Security. Never place a service-role key, OAuth provider secret, or SMTP password in a `VITE_` variable. `.env.local` is ignored by this repository.

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
