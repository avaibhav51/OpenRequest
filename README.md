# Open Request Workbench

> Working name. A private, local-first, open-source API workbench that opens instantly in a browser and remains useful without an account or backend.

This repository contains the first vertical slice: an installable PWA with a REST request builder, cURL import/export, browser-local collections and history, nested folder metadata, per-collection export, responsive mobile UI, and dark/light themes.

## Principles

1. **Useful before signup.** Local mode is the product, not a trial.
2. **User-owned data.** Export is always available; the long-term canonical format will be readable, documented, and Git-friendly.
3. **One fast path.** Paste cURL or a URL, press Send, inspect the result.
4. **Honest platform boundaries.** The web app will explain CORS and native gRPC constraints and offer an optional local bridge—not silently proxy secrets through our servers.
5. **No core paywalls.** REST, environments, scripts, runners, import/export, Git workflows, and the local bridge belong in the open-source edition.

## Run it

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Build and verify:

```bash
npm test
npm run build
```

All saved data is in the current browser's IndexedDB database named `open-request-workbench`. Clearing site data removes it, so export important collections until file-backed workspaces land.

## What exists today

- REST requests through the browser Fetch API
- Query parameters, headers, JSON/raw bodies
- Environment-tagged variables with isolated values, secret masking, and `{{variable}}` substitution
- Safe basic pre-request and post-response scripts with assertions and response capture
- Response status, timing, size, headers, and formatted JSON
- cURL import and copy-as-cURL
- Automatic cURL detection when pasted directly into the URL field
- Local collections, folder-path metadata, and recent history
- A bundled public API example collection, seeded once on first use
- Collection export in a versioned JSON envelope
- Offline/installable PWA shell
- Responsive phone/tablet/desktop interface
- Dark/light mode
- Explicit CORS/browser-limit messaging
- In-app quick reference for HTTP methods, variables, scripts, and common workflows
- Optional Google, GitHub, email/password, email link/code, and phone OTP authentication through a configured hosted or self-hosted Supabase Auth instance

## Read next

- [Product research and prioritized roadmap](docs/PRODUCT_PLAN.md)
- [Architecture and security boundaries](docs/ARCHITECTURE.md)
- [Technology decisions and future Java backend](docs/TECHNOLOGY_DECISIONS.md)
- [Personal GitHub setup without global Git changes](docs/PERSONAL_GITHUB.md)
- [Optional authentication setup](docs/AUTH_SETUP.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE). This protects the community from hosted proprietary forks while allowing personal, organizational, and commercial use under the license terms. Revisit the choice with counsel before accepting major outside contributions.
