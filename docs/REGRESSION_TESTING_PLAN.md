# Reusable browser regression testing plan

## Status

Near-future priority. The existing Vitest suite covers pure request-processing logic, but it does not drive the application as a user or verify browser storage, deployment paths, PWA metadata, and authentication flows.

## Recommended framework

Use Playwright Test. It is open source, runs Chromium, Firefox, and WebKit, supports mobile viewport/device profiles, network mocking, persisted browser contexts, screenshots/traces, and GitHub Actions. It can test the built Vite preview and therefore catch differences that the development server hides.

No paid service is required for local execution or public-repository GitHub Actions within the available allowance. Hosted cross-browser device farms remain optional.

## Suites

### Deterministic local regression

Run on every pull request without external accounts:

- first launch and default collection;
- URL/cURL paste and request-editor synchronization;
- request authorization/body combinations;
- collection save/export/import;
- IndexedDB persistence after reload;
- variables and scripts;
- response copy/clear and responsive layout;
- light/dark mode;
- manifest, service-worker registration, offline shell, and `/OpenRequest/` base path;
- accessibility smoke checks and keyboard navigation.

Mock API responses with Playwright routing or start a tiny local fixture server. Do not depend on public demo APIs for deterministic CI.

### Auth contract tests

Mock Supabase HTTP responses to cover UI states without secrets or email delivery:

- unconfigured and configured states;
- signup/sign-in/sign-out;
- invalid credentials and expired session;
- magic-link and OAuth redirect construction;
- session restoration;
- forgot-password and recovery UI when implemented.

### Live Supabase integration

Run manually or on a protected schedule against a dedicated disposable Supabase project:

- real email/password signup, confirmation, sign-in, recovery, and changed-password lifecycle when that complete feature is implemented;
- magic-link delivery when a test inbox is available;
- OAuth callback smoke tests where provider automation is permitted;
- redirect allow-list behavior;
- future RLS cross-user denial tests.

Keep live credentials in protected CI secrets, never in source or browser-facing `VITE_` variables except the expected publishable key. Delete created users/data after a run. Live-provider failures should not make ordinary local pull requests flaky.

## Implementation sequence

1. Add Playwright and a `test:e2e` command.
2. Start the production preview automatically on a test port.
3. Add stable accessible selectors only where role/label queries are insufficient.
4. Cover one critical happy path and persistence after reload.
5. Add mocked error/edge cases and mobile projects.
6. Add a GitHub Actions job with trace/screenshot artifacts on failure.
7. Introduce a separately gated live-auth project.

## Completion criteria

- One command runs deterministic regression tests locally.
- Pull requests test the production build in at least Chromium and WebKit.
- Failures retain useful traces/screenshots.
- Tests require no personal account or manual clicks.
- External-provider tests are isolated, clearly configured, and optional for contributors.
