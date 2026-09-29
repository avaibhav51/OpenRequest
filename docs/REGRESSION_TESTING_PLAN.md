# Reusable browser regression testing plan

## Status

Foundation implemented. The Vitest suite covers pure request-processing logic, while Playwright now drives the production build in Chromium, WebKit, and a mobile Chromium profile. The deterministic suite verifies the `/OpenRequest/` deployment path, bundled logo/default collection, URL/Params synchronization, request/response flow, response clearing, persistent multi-request editor tabs, formatted JSON cURL import, IndexedDB persistence, theme persistence, PWA manifest, and Chromium service-worker registration.

Responsive regressions also exercise empty tablet/mobile portrait workspaces, assert that the document does not exceed the visible viewport, verify that the closed sidebar casts no shadow into the workspace and its opened footer remains reachable, and confirm keyboard resizing of the stacked request/response divider.

Minimum-pane coverage verifies that the editor tab strip can horizontally reveal the selected Scripts tab and that the Before Request/After Response editors never overlap when the request pane is resized to its minimum height; the editor content scrolls internally instead.

URL-details coverage verifies that no persistent duplicate URL consumes editor space, while focus/hover or the touch-accessible details button reveals protocol, host/port, path-parameter placeholder, endpoint, query-key, and query-value segmentation. It also confirms that light/dark palettes differ and the original editable URL remains unchanged.

Theme coverage verifies persistent switching, WCAG-readable primary and secondary light-mode contrast, coordinated page/panel/reading surfaces, restrained light-only panel depth, and preservation of the flat dark-mode surface treatment.

The test-only Node server mounts `dist` at `/OpenRequest/` and provides same-origin JSON and XML fixture APIs. Regression coverage confirms theme-aware tokens in the formatted response, an unchanged uncolored Raw payload, and persistence of the metadata-only sync outbox after reload—without depending on public APIs, accounts, email delivery, or Supabase. GitHub Actions installs the browsers, runs the suite, and retains the HTML report plus failure screenshots, video, and traces.

The database-security CI job installs the repository's locked npm dependencies before running the public Data API isolation script because that script imports the checked-in `@supabase/supabase-js` dependency. The SQL-only pgTAP step does not require Node packages, but both checks intentionally run in the same prepared job.

Saved-request coverage verifies that editing or sending an unsaved draft creates no outbox entry, the first explicit save queues one request, repeated saves coalesce by request identity, a second saved request remains independent, a saved request filed in a collection queues both objects, and a never-synchronized empty collection remains browser-private. A separately gated real-Supabase test verifies encrypted transport between two browser profiles.

## Synchronization expectation audit

| User expectation | Current status | Automated evidence / missing work |
| --- | --- | --- |
| Trusted existing browser normally restores its account session | Partially implemented | Supabase client requests the persisted session, but mocked browser lifecycle and real disposable-project tests are still missing. |
| Unsaved edited requests stay local | Implemented | Browser regression proves edits and sends do not enter the outbox. |
| Only an explicit save becomes sync-eligible | Implemented | Browser regression proves the request outbox entry appears only after Save; the two-profile suite proves it then uploads. |
| Repeated saves of one request do not create competing local entries | Implemented locally | Unit and browser tests prove stable-key outbox coalescing. |
| Different request IDs never conflict | Implemented | Object-scoped outbox and revision identities are independent locally and remotely. |
| Never-synchronized empty collections stay private to one browser | Implemented | Desktop, WebKit, and mobile browser regression proves collection creation does not enter the outbox. |
| Same-request conflicts resolve by server order, with bounded undo | Partially implemented | Server identity sequence determines latest-wins and immutable older revisions remain stored. A user-facing version-history/undo control is still missing. |
| Changes synchronize automatically across alternating devices | Implemented for the single-owner flow | A real two-profile Chromium test proves encrypted upload/download, saved-only behavior, server-sequenced latest-wins, and collection tombstones against local Supabase. Extended retry/offline coverage remains. |
| A new device can unlock an existing encrypted workspace once | Implemented with a sync passphrase | The two-profile suite creates on device one and unlocks once on device two. Passkey/device transfer remains later. |
| Alice cannot read or mutate Bob's data | Implemented and tested | pgTAP and public Data API suites exercise RLS; the PWA transport uses the same owner-scoped tables. |
| Sign-out/account switching cannot leak one local workspace into another account | Implemented guard | Enable/unlock creates an immutable owner binding; a mismatched account pauses before transport. Additional browser UI coverage remains. |

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

### Local multi-user RLS security

The checked-in `supabase/tests/database/sync_rls.test.sql` suite runs against the free local Supabase stack and uses 23 pgTAP checks to impersonate anonymous, Alice, and Bob sessions. It validates owner access, cross-user denial, append-only permissions, idempotency, concurrent client sequences, encryption algorithm/nonce/payload constraints, and server-owned timestamps. `npm run test:db:api` additionally signs in two disposable local users through Supabase Auth and verifies owner isolation through the public Data API. Run both after `supabase start`; CI runs the same suites in disposable containers on every push and pull request.

This suite is separate from browser regression on purpose: browser tests prove UI/local persistence, while database tests prove authorization at the storage boundary. Once encrypted transport exists, add an integration layer that uploads/downloads through the public client API as two users; keep the direct RLS suite as the lower-level security regression.

## Implementation sequence

1. **Done:** Add Playwright and a `test:e2e` command.
2. **Done:** Build and mount the production output at the GitHub Pages subpath on a test port.
3. **Done:** Use accessible roles/labels and add an accessible mobile-menu/save-dialog name where required.
4. **Done:** Cover a critical request happy path and persistence after reload.
5. **Started:** Add a mobile project; mocked error and edge cases remain.
6. **Done:** Add a GitHub Actions job with report/trace/screenshot/video artifacts on failure.
7. **Started:** Add local two-user database/RLS tests; encrypted client integration remains pending.
8. Introduce a separately gated live-auth project.

Next additions should cover cURL import, authorization/body combinations, variables/scripts, collection export/import, offline reload, keyboard/accessibility checks, and mocked Auth contract states. Live Supabase tests remain separately gated.

## Completion criteria

- **Met:** One command runs deterministic regression tests locally.
- **Met:** Pull requests test the production build in Chromium and WebKit.
- **Met:** Failures retain useful reports, traces, screenshots, and video.
- **Met:** Deterministic tests require no personal account or manual clicks.
- External-provider tests are isolated, clearly configured, and optional for contributors.
