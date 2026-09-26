# Auth data, storage, and costs

This project is designed so login is optional. Local mode works without any identity provider, hosted backend, or payment method.

## Where data is stored

| Data | No login / local mode | Optional Supabase Auth mode |
| --- | --- | --- |
| Collections, folders, history, requests | Browser IndexedDB database `open-request-workbench` | Still browser IndexedDB today. Sync is not implemented. |
| Active theme, selected environment, default seed flags | Browser localStorage | Browser localStorage |
| Secret variables | Browser IndexedDB, visually masked, excluded from normal collection export | Same today |
| Supabase URL and anon key | Not used | `.env.local` during development or public frontend build variables in hosting |
| Browser session | Not used | Supabase access and refresh tokens in browser storage |
| Email/password credentials | Not currently exposed | When the complete signup/recovery flow is added, credentials will be sent over HTTPS to Supabase Auth and not stored by this frontend |
| Password storage | Not currently used by the UI | A future complete password flow would rely on Supabase's salted password hashes in `auth.users.encrypted_password`, never plaintext frontend storage |
| Email and user identity metadata | Not used | Supabase Auth database `auth` schema |
| Google/GitHub OAuth secrets | Not used | Stored in Supabase/provider configuration, not in this frontend repository |
| SMTP provider credentials | Not used | Supabase hosted project settings or self-hosted server environment |

Supabase documents that browser sessions use access and refresh tokens, and its JavaScript client persists sessions in localStorage by default. See [Supabase sessions](https://supabase.com/docs/guides/auth/sessions) and the [Supabase JavaScript auth reference](https://supabase.com/docs/reference/javascript/auth).

## What is not protected yet

The current `0.x` app masks secret values in the UI, but it does not encrypt browser storage at rest. That means local device access, browser compromise, malicious extensions, or an XSS bug could expose local API secrets. Use test credentials or short-lived credentials until encrypted workspaces are implemented.

Signing in does not upload existing local collections. It only creates an account session.

## Phone OTP cost

Yes, phone OTP can still cost money.

Supabase Auth can support phone login, but reliable SMS/voice/WhatsApp delivery normally requires a messaging provider, phone number configuration, rate limits, CAPTCHA/abuse protection, and operational monitoring. Even if the auth server is free or self-hosted, message delivery is usually metered.

NIST also treats PSTN-based out-of-band authentication as restricted and calls out SIM swap, number porting, and related risks: <https://pages.nist.gov/800-63-3/sp800-63b.html>.

Recommended order for this project:

1. Local mode, no auth.
2. GitHub/Google OAuth for convenience.
3. Email/password or email magic link/code.
4. Passkeys/WebAuthn or TOTP as future stronger low-cost options.
Phone/SMS OTP is intentionally excluded from the OpenRequest UI because it cannot be offered reliably without delivery cost and abuse controls.

## Could inbound messages avoid OTP cost?

Not cleanly.

The idea would be: show the user a challenge, ask them to send that code to your number/account, and authenticate when your system receives the message. It can prove that someone can send from a channel that claims to be their phone number, but it does not remove the hard parts:

- You still need a receiving number or WhatsApp/business account, webhooks, provider APIs, and abuse controls.
- Inbound SMS/WhatsApp can also be metered or tied to a paid number.
- Sender phone numbers are not a strong secret and remain exposed to SIM swap, forwarding, reassignment, and spoofing/provider quirks.
- Manual checking does not scale and creates privacy/retention responsibility.
- A secure version still needs one-time challenge generation, expiry, replay prevention, rate limits, audit logs, and recovery rules.

So inbound messaging is not a good default login method for an open-source API workbench. If phone-number ownership is mandatory for a deployment, make it an operator-configured feature and document the provider cost.

## Where to put credentials

Safe in the frontend repository:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Never put these in frontend variables, GitHub Pages variables, or committed files:

- Supabase service-role key
- OAuth client secret
- SMTP password
- Database password
- Private signing keys

For self-hosting Supabase, keep private values in server-side environment files or your secret manager. For hosted Supabase, configure them in the Supabase dashboard.

## Future sync rule

When sync is added, workspace content should be encrypted on the client before upload. The server should store ciphertext, revision metadata, and account/device records, not raw API keys or request secrets.
