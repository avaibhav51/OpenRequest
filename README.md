# Open Request Workbench

Open Request Workbench is a local-first, open-source API workbench for REST exploration, collections, variables, scripts, cURL import, and browser/PWA use. It is meant to feel closer to Postman, HTTPie, and Hoppscotch, but with a hard rule: useful local mode must work without signup, a server, or a paid account.

Created by [Vaibhav Agarwal](https://avaibhav51.github.io).

The current app is a React/Vite PWA. It stores data in your browser by default and can optionally enable login through a hosted or self-hosted Supabase Auth project.

Optional single-owner encrypted cross-device synchronization is implemented. It only runs in a build connected to an operator-configured, migrated Supabase project after the user signs in and explicitly enables/unlocks sync. Without that configuration, local use is unchanged and no Supabase client is initialized.

| Status | What it means |
| --- | --- |
| Implemented | Saved-request/referenced-collection push/pull, passphrase-based new-browser unlock, AES-GCM revisions, server-ordered latest-wins and collection tombstones. |
| Tested / test limits | Unit and deterministic browser tests cover local behavior; database/API suites cover two-user RLS. Gated real two-profile tests cover draft preservation and automatic alternating-device sync without Sync now. They are skipped by normal CI; the updated scenarios still need a local-Supabase execution. |
| Deployment required | Public Supabase URL/key, all checked-in migrations, provider/redirect/email configuration and operator abuse/quota/backup controls. Login alone does not upload work. |
| Remaining | Auth lifecycle tests, retry/backoff, version restore, deletion/recovery hardening and key rotation; no stable-release or independent-audit claim. |

Known credential fields are blanked before encryption, not every possible secret. Request URLs/bodies/scripts/custom headers may still contain sensitive data. Unsaved drafts, responses, history and variable values stay local. The remembered workspace key and other local data are not encrypted at rest. See [current encrypted sync status and limits](docs/ENCRYPTED_SYNC_PLAN.md).

## What you can do today

- Send REST requests through the browser Fetch API.
- Copy the visible response body or headers and clear the current response without changing the request.
- Resize the request/response split horizontally on desktop or vertically on tablet/mobile; drag the divider, use arrow keys, or double-click/press Home to reset it.
- Inspect formatted, theme-aware syntax-highlighted JSON/XML, safe image previews, raw text/base64, binary metadata, and response headers.
- Use query params, headers, JSON/raw, URL-encoded form, and multipart text-field bodies with common HTTP methods.
- Configure No Auth, Bearer/JWT, Basic Auth, or API Key authorization per request, including environment-variable values.
- Paste a URL or cURL command into the URL bar and let the app fill the request, including Bearer/Basic authorization and form fields.
- Keep multiple unsaved requests open in local, persistent editor tabs. Imported JSON is formatted when valid; JSON username/password fields remain request payload rather than being incorrectly converted to HTTP Auth.
- Reopening a saved request focuses its existing tab and preserves unsaved edits. Save updates both the saved request and the persistent tab; background synchronization preserves open drafts.
- A dot marks unsaved tab changes; these drafts stay in this browser and are not synchronized. Closing an edited tab asks before discarding it. Revert restores the last saved copy (with confirmation); closing an untouched empty tab does not prompt. Only an explicit Save updates the collection and sync queue.
- Responses, request errors, and running state belong to the sending tab. Tabs can run independently, and switching tabs keeps each result until cleared or the tab is closed. Closing a running tab hides its eventual result but does not cancel the network request yet. Responses are memory-only and reset on page reload. Local history records the send-time snapshot after variable/pre-request processing, not subsequent editor changes; it may contain resolved secrets and is never synced. Script captures use the environment selected at Send time.
- Inspect protocol, host/port, path, endpoint, recognized path placeholders, and query keys/values through a subtle theme-aware URL-details popover shown on field hover/focus or from its details button.
- Keep URL query parameters and the Params editor synchronized in both directions.
- See generated Content-Type/Auth values and authorization conflicts before sending.
- Keep drafted bodies when switching methods while clearly preventing GET/HEAD from sending them.
- Save local collections and recent history. Nested folders inside a collection are deferred until the sidebar can display and manage the hierarchy; the misleading save field is hidden in the meantime.
- Start with the bundled public API example collection.
- Use environment-tagged variables with isolated values, `{{variable}}` substitution, built-ins, and secret masking.
- Run basic safe scripts for assertions, temporary request changes, and response capture. Pre-request `sleep 3000` waits three seconds without blocking the UI. Use non-negative whole milliseconds; combined sleeps may not exceed 30000 ms per run. Sleep is not supported after a response and is excluded from the displayed network duration. Closing a tab does not cancel its pending delay/request yet. Arbitrary JavaScript is not supported; see the in-app Quick reference for commands.
- Post-response checks support typed scalar comparisons (`==`, `!=`, `<`, `<=`, `>`, `>=`), JSON field/header existence, text/array `contains`, and network-duration checks. Individual pass/fail results appear in expandable Script details; failures do not stop later checks or captures. `log "message"` works in both phases with best-effort known-secret masking and redacted variable references. Do not write secrets directly into log messages.
- Export a collection or all saved collections/requests as versioned OpenRequest JSON. Nested-folder export and JSON import/backup restoration are not implemented; exports are not yet an in-app round-trip restore workflow.
- Install the production build as a PWA on supported desktop and mobile browsers. The normal Vite development server is not an installability test.
- Switch between tuned dark and light themes with persistent preference, a subtle paper-like light reading surface, and readable response syntax colors in both.
- Keep the empty workspace and mobile sidebar within the visible PWA viewport, with panel/sidebar content scrolling internally when needed.
- Enable optional Google, GitHub, or email-link login when auth is configured. Password login remains deferred until complete recovery support exists.

### Safe script examples

On desktop/tablet (above 600 px wide), drag the subtle separator line between Before request and After response to resize them; its transparent hit area is wider than the visible line. Focus it and use Up/Down arrows; Home or double-click restores an equal split. Both editors keep a minimum height and remain scrollable, including command suggestions. The split is remembered in this browser only, not synced. Narrow phones retain equally stacked editors without a drag handle.

Discover commands directly in the Scripts tab: type a command prefix for suggestions, or choose **Insert command** (also usable on phones). **Ctrl+Space** opens the menu; arrow keys and Enter select, Escape dismisses. Typing `{{` suggests enabled variable names from the active environment and built-ins, never their values. Suggestions differ between Before request and After response. They only insert editable examples, never run them; adapt field paths/values before sending. Persistent commands are labeled as local environment changes. Empty-editor examples and Quick reference remain available. Response-path autocomplete and inline syntax validation are not yet implemented.

Example **After response** script (adapt field names to your API):

```text
assert status == 200
assert durationMs < 2000
assert header Content-Type contains "application/json"
assert json.success == true
assert json.data.id exists
capture userId = json.data.id
log "Response checked"
```

Comparison values are JSON scalars or bare single-word strings; quote strings containing spaces. Environment and request-local variables can be used on the right side, for example `assert json.data.id == "{{expectedId}}"`. Equality does not coerce types, ordering requires numbers, and missing fields fail even `!=`. Dot paths support array indexes (`json.items.0.id`), not arbitrary JSONPath expressions. Header checks can only see headers exposed to browser Fetch by CORS. Body text checks are case-sensitive; binary/base64 bodies do not support text/JSON assertions. Sleep/temporary variable/header/query/body commands are pre-request only; schema validation, conditional control flow, and request chaining remain future work.

Persistent variable commands work in **either phase**, scoped to the environment selected when Send was pressed:

```text
environment-set token = {{newToken}}
environment-unset staleToken
```

Values are browser-local, enabled, and marked secret (masked, not encrypted at rest); they never enter the sync queue. Set creates or replaces a same-name variable; unset removes all same-name variables in that environment and is harmless if absent. Later commands see the new value or its removal. Pre-script writes are transactional and staged until the full script and request substitution succeed, then stored before network dispatch—even if the network subsequently fails. Post-script valid writes/captures apply in command order even if an assertion fails; a storage failure rolls back that phase's variable changes. Switching environments mid-run does not change the destination; deleting the original environment causes the writes to fail safely.

Outgoing field updates, **Before request only**:

```text
query page = 2
query-remove obsolete
body data.name = "example"
body count = 3
body-remove deprecated
```

Query set replaces enabled/disabled duplicates of the literal, case-sensitive key, preserving other keys and URL fragments; values accept plain text, quoted strings, and variable substitutions. Body commands require a valid JSON object in JSON body mode and a method other than GET/HEAD. They support scalar values and named dot-separated object paths, create missing parent objects for set, and reject array indexes, non-object parents, and prototype-related keys. These commands modify only the outgoing copy recorded in local history, not the draft/saved request. Auth-generated API-key query values still take precedence over manual/script query fields of the same name.

## Install locally

Prerequisites:

- Node.js `22.12+` recommended. Vite also supports `20.19+`.
- npm, included with Node.js.
- Git, only if you are cloning from GitHub.

From your cloned repository directory:

```bash
cd OpenRequest
npm ci
npm run dev
```

Open `http://localhost:5173`.

`npm run dev` is optimized for development and does not enable this project's production service worker. To test PWA installation locally, use the production build instead:

```bash
npm run build
npm run preview
```

Open the localhost URL printed by Vite. In Chrome or Edge, look for the install icon in the address bar or use the browser menu. Safari on macOS uses **File -> Add to Dock** on supported versions. If no install choice appears, reload once after the production build has registered its service worker and check the browser's developer-tools manifest/service-worker panels.

For a fresh clone later:

```bash
git clone https://github.com/avaibhav51/OpenRequest.git
cd OpenRequest
npm ci
npm run dev
```

Useful commands:

```bash
npm test
npm run build
npm run preview
npx playwright install chromium webkit  # once per development machine
npm run test:e2e
npm run test:db                 # optional local Supabase/RLS suite
npm run test:db:api             # while the local Supabase stack is running
```

`test:e2e` builds the production PWA at the same `/OpenRequest/` subpath used by GitHub Pages, starts a deterministic local fixture server, and runs Chromium, WebKit, and a mobile Chromium profile. It does not call public demo APIs or require Supabase credentials. Failure artifacts are written to the ignored `playwright-report/` and `test-results/` directories.

The optional database suites start from the checked-in Supabase migrations. `test:db` runs 23 pgTAP policy/schema checks; `test:db:api` provisions disposable confirmed Alice/Bob users through the local admin API, signs both in through normal public password Auth, and repeats owner-isolation checks through the public Data API. Deterministic provisioning avoids signup/email throttling in CI while authorization assertions still use ordinary user sessions. They need the free Supabase CLI and a Docker-compatible local runtime, and never use a hosted project or real email addresses. Setup and exact coverage are in [Encrypted synchronization and RLS](docs/ENCRYPTED_SYNC_PLAN.md#local-two-user-databaseapi-isolation).

Local app data is stored in the current browser profile, mainly in IndexedDB database `open-request-workbench`. Clearing site data removes it, so export anything important.

## Use from a phone or another laptop

For quick testing on the same Wi-Fi network:

```bash
npm run dev -- --host 0.0.0.0
```

Find your laptop IP:

```bash
ipconfig getifaddr en0
```

Then open `http://YOUR_LAPTOP_IP:5173` on the phone or second laptop.

Notes:

- Local network HTTP is good for testing, but it is not a secure public deployment.
- Installable PWA behavior requires HTTPS, or local development on `localhost` / `127.0.0.1`. MDN documents this requirement in its [PWA installability guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
- On Android, use Chrome's install/add-to-home-screen option when available.
- On iOS, open in Safari and use Share -> Add to Home Screen.

## Use without hosting it yourself

Use the [public OpenRequest site](https://avaibhav51.github.io/OpenRequest/) without running a local server, or publish your own static build. Data stays in each browser unless that deployment is configured for optional sync and the user enables it. A PWA installation is a browser-managed app shortcut/cached shell, not a backend or automatic cross-device backup.

For local development/LAN access, the computer's server must keep running to serve the page. A deployed HTTPS site does not require your computer to stay on. An already-cached production PWA can open offline, but API calls and synchronization still require network access; browser cache/storage eviction can remove offline data.

Recommended free paths:

- GitHub Pages: best when the code is already on personal GitHub.
- Cloudflare Pages: good static hosting, custom domains optional.
- Any static host: serve the `dist/` folder after `npm run build`.

Full instructions are in [Deployment](docs/DEPLOYMENT.md).

## Login and auth

Login is optional. Without auth, the app works locally and stores data in the browser.

To enable the sign-in modal, copy `.env.example` to `.env.local` and set:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

Then apply the checked-in Supabase migrations, configure the providers in Supabase Auth, and restart the dev server. Adding the URL and public key connects the frontend to the project; it does not automatically configure the database schema, Google/GitHub OAuth, production email delivery, redirects, CAPTCHA, or abuse controls.

For hosted builds, the deployer supplies these two public values once as hosting build variables; individual users do not provide them. Self-hosters who want their own independent login/sync service supply values from their own Supabase project and apply the checked-in migrations. The public reference deployment policy is to omit these variables until an operator is ready; verify the actual deployed build separately. An unconfigured build exposes no shared Supabase project through this app. In a configured deployment, signing in still uploads nothing until the user explicitly enables encrypted sync and creates or enters a sync passphrase.

Read:

- [Optional authentication setup](docs/AUTH_SETUP.md)
- [Auth data, storage, and costs](docs/AUTH_DATA_AND_COSTS.md)
- [Deferred operator checklist for enabling sync](docs/AUTH_SETUP.md#deferred-operator-checklist-enable-sync-later)

Important short version:

- Google, GitHub, and email auth can usually be tested on free tiers.
- Phone/SMS OTP is intentionally not included because reliable delivery normally needs a paid provider and abuse controls.
- Password login is not exposed yet; it remains deferred until signup, recovery, expired-link handling, and regression tests ship together. When enabled later, passwords will be handled by Supabase Auth rather than stored in this frontend.
- The Supabase URL and publishable/anon key are public application identifiers, not administrator credentials. The checked-in sync tables use Row Level Security; never expose a secret/service-role key.
- API secrets that you type into variables are currently only browser-local and masked, not encrypted at rest.

## Request authorization

These helpers authorize the target API; they are separate from optional Google/GitHub/email login to OpenRequest. OAuth authorization-code/token refresh for arbitrary target APIs is not implemented.

Open a request's **Auth** tab and choose:

- **No Auth** — adds no credential.
- **Bearer Token / JWT** — sends `Authorization: Bearer …`.
- **Basic Auth** — safely encodes a username and password as an HTTP Basic header.
- **API Key** — adds a custom key to either a request header or query parameter.

Every credential field supports `{{variableName}}`. Prefer secret environment variables instead of saving a literal credential inside a request, especially before exporting a collection. Copying a request as cURL includes its configured authorization.

## Current limits

- Browser Fetch must obey CORS, mixed-content, VPN/network reachability and browser-managed headers/cookies. There is no built-in proxy/companion yet; `no-cors` cannot provide readable responses.
- GraphQL can be sent manually as an ordinary HTTP JSON request to a compatible endpoint, but there is no dedicated editor/introspection. Native gRPC, WebSocket/SSE session tools, collection/performance/load runners and full multipart file uploads are planned.
- Cancellation/configurable timeout, individual request deletion/duplicate/move/search, nested-folder management and collection JSON import/restore remain pending. Some ordinary request-name editing already exists; the full management workflow does not.
- Installing/self-hosting the frontend alone does not synchronize devices. Optional sync needs the configured service and explicit unlock; cached offline use is not a backup guarantee.

## Project docs

- [Product research and prioritized roadmap](docs/PRODUCT_PLAN.md)
- [Architecture and security boundaries](docs/ARCHITECTURE.md)
- [Technology decisions and future Java backend](docs/TECHNOLOGY_DECISIONS.md)
- [Future local companion service for CORS and native protocols](docs/COMPANION_SERVICE_PLAN.md)
- [Future API performance and load-testing support](docs/PERFORMANCE_LOAD_TESTING_PLAN.md)
- [Request editor synchronization priorities](docs/REQUEST_EDITOR_SYNC_PLAN.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Auth data, storage, and costs](docs/AUTH_DATA_AND_COSTS.md)
- [Encrypted synchronization: current status, security and remaining work](docs/ENCRYPTED_SYNC_PLAN.md)
- [Reusable browser regression testing plan](docs/REGRESSION_TESTING_PLAN.md)
- [Personal GitHub setup without global Git changes](docs/PERSONAL_GITHUB.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE). This protects the community from hosted proprietary forks while allowing personal, organizational, and commercial use under the license terms. Revisit the choice with counsel before accepting major outside contributions.
