# Reusable browser regression testing plan

## Status

Foundation implemented. The Vitest suite covers pure request-processing logic, while Playwright now drives the production build in Chromium, WebKit, and a mobile Chromium profile. The deterministic suite verifies the `/OpenRequest/` deployment path, bundled logo/default collection, URL/Params synchronization, request/response flow, response clearing, IndexedDB persistence, theme persistence, PWA manifest, and Chromium service-worker registration.

Responsive regressions also exercise empty tablet/mobile portrait workspaces, assert that the document does not exceed the visible viewport, verify that the mobile sidebar footer remains reachable, and confirm keyboard resizing of the stacked request/response divider.

Minimum-pane coverage verifies that the editor tab strip can horizontally reveal the selected Scripts tab and that the Before Request/After Response editors never overlap when the request pane is resized to its minimum height; the editor content scrolls internally instead.

URL-details coverage verifies that no persistent duplicate URL consumes editor space, while focus/hover or the touch-accessible details button reveals protocol, host/port, path-parameter placeholder, endpoint, query-key, and query-value segmentation. It also confirms that light/dark palettes differ and the original editable URL remains unchanged.

The test-only Node server mounts `dist` at `/OpenRequest/` and provides same-origin JSON and XML fixture APIs. Regression coverage confirms theme-aware tokens in the formatted response and an unchanged, uncolored Raw payload, without depending on public APIs, accounts, email delivery, or Supabase. GitHub Actions installs the browsers, runs the suite, and retains the HTML report plus failure screenshots, video, and traces.

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

1. **Done:** Add Playwright and a `test:e2e` command.
2. **Done:** Build and mount the production output at the GitHub Pages subpath on a test port.
3. **Done:** Use accessible roles/labels and add an accessible mobile-menu/save-dialog name where required.
4. **Done:** Cover a critical request happy path and persistence after reload.
5. **Started:** Add a mobile project; mocked error and edge cases remain.
6. **Done:** Add a GitHub Actions job with report/trace/screenshot/video artifacts on failure.
7. Introduce a separately gated live-auth project.

Next additions should cover cURL import, authorization/body combinations, variables/scripts, collection export/import, offline reload, keyboard/accessibility checks, and mocked Auth contract states. Live Supabase tests remain separately gated.

## Completion criteria

- **Met:** One command runs deterministic regression tests locally.
- **Met:** Pull requests test the production build in Chromium and WebKit.
- **Met:** Failures retain useful reports, traces, screenshots, and video.
- **Met:** Deterministic tests require no personal account or manual clicks.
- External-provider tests are isolated, clearly configured, and optional for contributors.
