# Security policy

This project handles API credentials and request data, so security reports should not begin as public issues. Until a dedicated address exists, use GitHub's private vulnerability reporting feature after the repository is published.

The current `0.x` prototype is not yet suitable for storing production secrets. It keeps data in browser IndexedDB and has not received an independent security audit. Export non-sensitive test collections, use short-lived credentials, and avoid placing long-lived secrets in request history.

Environment values marked secret are visually masked and excluded from collection exports, but they are not yet encrypted at rest. The basic script language is declarative and does not execute arbitrary JavaScript.

Optional login uses public frontend configuration only. Do not commit Supabase service-role keys, OAuth client secrets, SMTP passwords, SMS provider credentials, database passwords, or signing keys. See [Auth data, storage, and costs](docs/AUTH_DATA_AND_COSTS.md).

The browser Auth session contains access and refresh tokens. Treat XSS prevention, a restrictive Content Security Policy on supported hosts, dependency review, safe redirect handling, and avoiding tokens in logs/errors as release gates for public accounts. Optional sync encrypts revisions in the browser and relies on owner-only RLS; it remains an opt-in `0.x` feature without an independent audit. Do not reuse an account password as the sync passphrase or include long-lived production credentials in synchronized request bodies/scripts.

The Supabase operator can see account/workspace/object identifiers, revision types, ordering, timestamps, ciphertext sizes, network/service logs, and access patterns. Database or service-role access can copy, delete, reorder, or corrupt ciphertext, but does not by itself provide the plaintext workspace key, sync passphrase, or decrypted request content. A user needs both the correct account session and the sync passphrase when unlocking a new browser.

This protection assumes the served OpenRequest JavaScript is trustworthy. A compromised deployment, malicious dependency, XSS payload, browser extension, or unlocked device can capture plaintext or the passphrase before encryption. End-to-end encryption protects stored cloud content from passive database access; it does not make a hostile frontend safe.

The static app now ships a CSP meta fallback, and its Caddy deployment adds CSP plus referrer, content-type, frame, and permissions headers. `connect-src` must allow user-selected HTTP(S)/WebSocket API destinations because OpenRequest is an API client; CSP cannot act as a destination allow-list without breaking the core use case. Browser mixed-content and CORS rules still apply. No third-party runtime scripts are allowed.

The project will publish a threat model before optional sync, scripting, or the localhost bridge is considered stable.
