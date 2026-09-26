# Open Request Workbench

Open Request Workbench is a local-first, open-source API workbench for REST exploration, collections, variables, scripts, cURL import, and browser/PWA use. It is meant to feel closer to Postman, HTTPie, and Hoppscotch, but with a hard rule: useful local mode must work without signup, a server, or a paid account.

Created by [Vaibhav Agarwal](https://avaibhav51.github.io).

The current app is a React/Vite PWA. It stores data in your browser by default and can optionally enable login through a hosted or self-hosted Supabase Auth project.

## What you can do today

- Send REST requests through the browser Fetch API.
- Copy the visible response body or headers and clear the current response without changing the request.
- Inspect formatted JSON/XML, safe image previews, raw text/base64, binary metadata, and response headers.
- Use query params, headers, JSON/raw, URL-encoded form, and multipart text-field bodies with common HTTP methods.
- Configure No Auth, Bearer/JWT, Basic Auth, or API Key authorization per request, including environment-variable values.
- Paste a URL or cURL command into the URL bar and let the app fill the request, including Bearer/Basic authorization and form fields.
- Keep URL query parameters and the Params editor synchronized in both directions.
- See generated Content-Type/Auth values and authorization conflicts before sending.
- Keep drafted bodies when switching methods while clearly preventing GET/HEAD from sending them.
- Save local collections, nested folder paths, and recent history.
- Start with the bundled public API example collection.
- Use environment-tagged variables with isolated values, `{{variable}}` substitution, built-ins, and secret masking.
- Run basic safe scripts for assertions, temporary request changes, and response capture.
- Export collections/subcollections as versioned JSON.
- Install the production build as a PWA on supported desktop and mobile browsers. The normal Vite development server is not an installability test.
- Switch dark/light theme.
- Enable optional Google, GitHub, or email-link login when auth is configured. Password login remains deferred until complete recovery support exists.

## Install locally

Prerequisites:

- Node.js `22.12+` recommended. Vite also supports `20.19+`.
- npm, included with Node.js.
- Git, only if you are cloning from GitHub.

From this workspace:

```bash
cd /Users/VaibhavAgarwal/AI
npm install
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
git clone git@github-personal:avaibhav51/OpenRequest.git
cd OpenRequest
npm install
npm run dev
```

Useful commands:

```bash
npm test
npm run build
npm run preview
```

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

You can publish the static PWA for free on services such as GitHub Pages or Cloudflare Pages. The app still stores each user's data in their own browser unless optional sync is built later.

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

Then configure the providers in Supabase Auth and restart the dev server. Adding the URL and public key connects the frontend to the project; it does not automatically configure Google/GitHub OAuth, production email delivery, redirects, CAPTCHA, or future collection sync.

For hosted builds, the deployer supplies these two public values once as hosting build variables; individual users do not provide them. Self-hosters who want their own independent login/sync service supply values from their own Supabase project. The official OpenRequest deployment intentionally omits these variables for now, so it remains local-only and exposes no shared Supabase project to misuse. The current login adapter is experimental and does not upload local data.

Read:

- [Optional authentication setup](docs/AUTH_SETUP.md)
- [Auth data, storage, and costs](docs/AUTH_DATA_AND_COSTS.md)

Important short version:

- Google, GitHub, and email auth can usually be tested on free tiers.
- Phone/SMS OTP is intentionally not included because reliable delivery normally needs a paid provider and abuse controls.
- Password login is not exposed yet; it remains deferred until signup, recovery, expired-link handling, and regression tests ship together. When enabled later, passwords will be handled by Supabase Auth rather than stored in this frontend.
- The Supabase URL and publishable/anon key are public application identifiers, not administrator credentials. Protect future database tables with Row Level Security and never expose a secret/service-role key.
- API secrets that you type into variables are currently only browser-local and masked, not encrypted at rest.

## Request authorization

Open a request's **Auth** tab and choose:

- **No Auth** — adds no credential.
- **Bearer Token / JWT** — sends `Authorization: Bearer …`.
- **Basic Auth** — safely encodes a username and password as an HTTP Basic header.
- **API Key** — adds a custom key to either a request header or query parameter.

Every credential field supports `{{variableName}}`. Prefer secret environment variables instead of saving a literal credential inside a request, especially before exporting a collection. Copying a request as cURL includes its configured authorization.

## Project docs

- [Product research and prioritized roadmap](docs/PRODUCT_PLAN.md)
- [Architecture and security boundaries](docs/ARCHITECTURE.md)
- [Technology decisions and future Java backend](docs/TECHNOLOGY_DECISIONS.md)
- [Future local companion service for CORS and native protocols](docs/COMPANION_SERVICE_PLAN.md)
- [Future API performance and load-testing support](docs/PERFORMANCE_LOAD_TESTING_PLAN.md)
- [Request editor synchronization priorities](docs/REQUEST_EDITOR_SYNC_PLAN.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Auth data, storage, and costs](docs/AUTH_DATA_AND_COSTS.md)
- [Future encrypted synchronization and RLS](docs/ENCRYPTED_SYNC_PLAN.md)
- [Reusable browser regression testing plan](docs/REGRESSION_TESTING_PLAN.md)
- [Personal GitHub setup without global Git changes](docs/PERSONAL_GITHUB.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE). This protects the community from hosted proprietary forks while allowing personal, organizational, and commercial use under the license terms. Revisit the choice with counsel before accepting major outside contributions.
