# Reusable browser regression testing plan

## Status

Coverage reconciled against checked-in tests on 11 October 2026. “Test exists” does not mean the current hosted build or latest CI run passed. The default suite skips real encrypted transport; the two gated scenarios now cover saved-record/draft preservation and automatic alternating-device sync. Real execution of the updated scenarios is pending until the local Docker/Supabase stack is available. See [exact sync coverage and follow-up](ENCRYPTED_SYNC_PLAN.md#test-suites-and-honest-coverage).

Foundation implemented. The Vitest suite covers pure request-processing logic, while Playwright now drives the production build in Chromium, WebKit, and a mobile Chromium profile. The deterministic suite verifies the `/OpenRequest/` deployment path, bundled logo/default collection, URL/Params synchronization, request/response flow, response clearing, persistent multi-request editor tabs, formatted JSON cURL import, IndexedDB persistence, theme persistence, PWA manifest, and Chromium service-worker registration.

Responsive regressions also exercise empty tablet/mobile portrait workspaces, assert that the document does not exceed the visible viewport, verify that the closed sidebar casts no shadow into the workspace and its opened footer remains reachable, and confirm keyboard resizing of the stacked request/response divider.

Minimum-pane coverage verifies that the editor tab strip can horizontally reveal the selected Scripts tab and that the Before Request/After Response editors never overlap when the request pane is resized to its minimum height; the editor content scrolls internally instead.

URL-details coverage verifies that no persistent duplicate URL consumes editor space, while focus/hover or the touch-accessible details button reveals protocol, host/port, path-parameter placeholder, endpoint, query-key, and query-value segmentation. It also confirms that light/dark palettes differ and the original editable URL remains unchanged.

Theme coverage verifies persistent switching, WCAG-readable primary and secondary light-mode contrast, coordinated page/panel/reading surfaces, restrained light-only panel depth, and preservation of the flat dark-mode surface treatment.

The test-only Node server mounts `dist` at `/OpenRequest/` and provides same-origin JSON and XML fixture APIs. Regression coverage confirms theme-aware tokens in the formatted response, an unchanged uncolored Raw payload, and persistence of the metadata-only sync outbox after reload—without depending on public APIs, accounts, email delivery, or Supabase. GitHub Actions installs the browsers, runs the suite, and retains the HTML report plus failure screenshots, video, and traces.

The database-security CI job installs the repository's locked npm dependencies before running the public Data API isolation script because that script imports the checked-in `@supabase/supabase-js` dependency. The SQL-only pgTAP step does not require Node packages, but both checks intentionally run in the same prepared job.

Saved-request coverage verifies that editing or sending an unsaved draft creates no outbox entry, the first explicit save queues one request, repeated saves coalesce by request identity, a second saved request remains independent, a saved request filed in a collection queues both objects, and a never-synchronized empty collection remains browser-private. The separately gated real-Supabase two-profile test is a transport integration, not part of default regression; its saved-record/open-tab expectations have been updated, and a no-Sync-now automatic scenario added; execution remains pending.

## Synchronization expectation audit

Open-tab preservation coverage verifies that reopening a saved request retains unsaved URL edits, creates no duplicate tab or sync mutation, and preserves the draft after reload. Saving a renamed/filed request updates its persistent editor copy as well as the saved entity. Background hydration preserves live editor state, and an asynchronous save completion does not switch the selected tab.

Draft UX coverage checks content-based unsaved indicators (ignoring timestamps/placeholder-row IDs), close confirmation cancellation/acceptance, no prompt for untouched empty tabs, and confirmed Revert persistence without a sync mutation. Unsaved work remains browser-local; Save is still the explicit synchronization boundary.

Response ownership coverage runs two gated requests concurrently, completes them out of order, and switches tabs while one is busy. Each tab retains its own response/error/running state; clearing one response does not clear another. History stores the resolved send-time URL, method, body, and pre-request headers even if the editor changes while awaiting a response. Post-response scripts and captured-variable environments are frozen at Send time. Repeated Enter while running does not start another request. Closing and reopening a saved tab ignores the old tab's late completion but still records its run in local history. Results are in-memory only; cancellation is a separate pending enhancement.

Store unit tests additionally cover run identity guards, independent busy states, per-tab clearing, obsolete completions, closed-tab cleanup, immutable history snapshots, and refusal to store captures in an environment deleted during the run. The route-gated browser tests disable service workers only within their own group so mocked API calls cannot bypass Playwright; PWA registration tests remain enabled separately.

Safe-script delay coverage uses fake timers to verify `sleep 3000`, command order, zero delay/comments, invalid values, and the aggregate 30-second limit (including repeated sleeps). Browser coverage verifies a three-second delay before network dispatch, an interactive UI during the wait, and response ownership after switching tabs. This is a pre-request command only; cancellation remains pending.

Script-discovery tests cover phase-filtered snippets, current-line replacement, variable-name deduplication and closing-brace handling. Browser regression covers keyboard insertion/dismissal, mobile-friendly Insert command, preserving existing script lines, variable names without values, and no execution during insertion.

Script-split coverage checks preference validation, keyboard/pointer resizing, minimum editor heights, reload persistence, double-click/Home reset, unchanged script contents, suggestions in a minimized section, short tablet viewports, and hidden divider with accessible stacked editors on narrow phones.

Expanded script coverage verifies typed equality/inequality and numeric ordering, JSON field/array-index access, text/array containment, case-insensitive header checks, network-duration assertions, variable expectations, missing fields, invalid/binary JSON, malformed commands, and rejection of arbitrary JavaScript. Physical post-response line numbers and all assertion results survive failures; later captures still run. Logging tests verify double-quoted messages, no template expansion into secrets, and masking known variable/authorization/captured values. Browser tests check mixed pass/fail results, expandable details, local capture persistence, logs, and the updated script placeholders/Quick reference. Redaction is best-effort, not a guarantee against deliberately logging unknown secrets.

The editor becomes available only after initial IndexedDB hydration finishes, preventing startup from replacing fast edits with its earlier database snapshot. Storage-opening errors offer Retry without deleting data. Background hydration still preserves already-open editor state.

Script-mutation coverage verifies ordered persistent environment set/unset/capture effects, temporary scope updates, masking even after unset, query duplicate replacement/removal and fragment preservation, typed JSON object updates, unchanged source drafts, missing-removal no-ops, and rejection of GET/HEAD/raw/invalid/array/prototype paths. Browser tests check actual outgoing URL/body, environment isolation despite mid-run tag switching, unset without affecting another tag, reload persistence, no outbox entry, and no pre-script write when a later command fails. Persistent writes use an IndexedDB transaction over environments/variables to fail safely if the original environment is deleted. JSON schemas, conditional/request chaining, array/form/multipart body scripting, and cancellation remain deferred in Product plan.

| User expectation | Current status | Automated evidence / missing work |
| --- | --- | --- |
| Trusted existing browser normally restores its account session | Partially implemented | Supabase client requests the persisted session, but mocked browser lifecycle and real disposable-project tests are still missing. |
| Unsaved edited requests stay local | Implemented | Browser regression proves edits and sends do not enter the outbox. |
| Only an explicit save becomes sync-eligible | Implemented | Deterministic regression verifies outbox eligibility. Real upload is covered by the gated test definition, pending execution of the updated scenarios. |
| Repeated saves of one request do not create competing local entries | Implemented locally | Unit and browser tests prove stable-key outbox coalescing. |
| Different request IDs never conflict | Implemented | Object-scoped outbox and revision identities are independent locally and remotely. |
| Never-synchronized empty collections stay private to one browser | Implemented | Desktop, WebKit, and mobile browser regression proves collection creation does not enter the outbox. |
| Same-request conflicts resolve by server order, with bounded undo | Partially implemented | Server identity sequence determines latest-wins and immutable older revisions remain stored. A user-facing version-history/undo control is still missing. |
| Changes synchronize automatically across alternating devices | Triggers implemented; gated scenario added, run pending | The new two-profile case never clicks Sync now, polls automatic pull and tests both save directions with preserved edits and focus/online handlers. Synthetic events do not prove physical-device background behavior or real offline recovery. |
| A new device can unlock an existing encrypted workspace once | Implemented with a sync passphrase | Recovery unit tests and a gated first/second-profile flow exist; updated integration execution remains needed. Passkey/device transfer is later. |
| Alice cannot read or mutate Bob's data | Implemented and tested | pgTAP and public Data API suites exercise RLS; the PWA transport uses the same owner-scoped tables. |
| Sign-out/account switching cannot leak one local workspace into another account | Implemented guard | Enable/unlock creates an immutable owner binding; a mismatched account pauses before transport. Additional browser UI coverage remains. |

## Recommended framework

Use Playwright Test. It is open source, runs Chromium, Firefox, and WebKit, supports mobile viewport/device profiles, network mocking, persisted browser contexts, screenshots/traces, and GitHub Actions. It can test the built Vite preview and therefore catch differences that the development server hides.

No paid service is required for local execution or public-repository GitHub Actions within the available allowance. Hosted cross-browser device farms remain optional.

## Suites

### Deterministic local regression

Current deterministic coverage runs on pull requests without external accounts. The wider target matrix includes:

- first launch and default collection;
- URL/cURL paste and request-editor synchronization;
- request authorization/body combinations;
- collection save (covered); export round-trip/restore tests await the import feature;
- IndexedDB persistence after reload;
- variables and scripts;
- response copy/clear and responsive layout;
- light/dark mode;
- manifest, service-worker registration and `/OpenRequest/` base path (covered); explicit offline reload/eviction recovery is not yet tested;
- scoped keyboard/accessibility checks (covered); comprehensive screen-reader/audit coverage remains.

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
- hosted/self-hosted deployment conformance and RLS cross-user denial (local database/API equivalents already exist).

Keep live credentials in protected CI secrets, never in source or browser-facing `VITE_` variables except the expected publishable key. Delete created users/data after a run. Live-provider failures should not make ordinary local pull requests flaky.

### Local multi-user RLS security

The checked-in `supabase/tests/database/sync_rls.test.sql` suite runs against the free local Supabase stack and uses 23 pgTAP checks to impersonate anonymous, Alice, and Bob sessions. It validates owner access, cross-user denial, append-only permissions, idempotency, concurrent client sequences, encryption algorithm/nonce/payload constraints, and server-owned timestamps. `npm run test:db:api` additionally signs in two disposable local users through Supabase Auth and verifies owner isolation through the public Data API. Run both after `supabase start`; CI runs the same suites in disposable containers on every push and pull request.

This suite is separate from browser regression on purpose: browser tests exercise UI/local persistence, while database tests exercise the storage authorization boundary. A gated single-user/two-profile encrypted transport test now exists; full two-account browser transport and account-switch lifecycle coverage remains separate work. Keep direct RLS regression too. CI runs on main pushes and pull requests; actual results must be checked separately.

## Implementation sequence

1. **Done:** Add Playwright and a `test:e2e` command.
2. **Done:** Build and mount the production output at the GitHub Pages subpath on a test port.
3. **Done:** Use accessible roles/labels and add an accessible mobile-menu/save-dialog name where required.
4. **Done:** Cover a critical request happy path and persistence after reload.
5. **Started:** Add a mobile project; mocked error and edge cases remain.
6. **Done:** Add a GitHub Actions job with report/trace/screenshot/video artifacts on failure.
7. **Implemented:** Local two-user database/API tests and a separately gated two-profile transport test; draft semantics are reconciled and a no-manual-sync scenario is added; execute both before counting them as current-version verification.
8. Introduce a separately gated live-auth project.

Next additions should extend existing cURL/variables/scripts coverage with authorization/body matrices, collection export/import round trips, explicit offline reload, broad accessibility and mocked Auth lifecycle states. Auth option/error helper unit tests exist, but complete provider/callback/session UI coverage does not. Physical Android/iOS testing is not replaced by desktop WebKit/mobile Chromium simulations.

## Completion criteria

- **Met:** One command runs deterministic regression tests locally.
- **Met:** Pull requests test the production build in Chromium and WebKit.
- **Met:** Failures retain useful reports, traces, screenshots, and video.
- **Met:** Deterministic tests require no personal account or manual clicks.
- External-provider tests are isolated, clearly configured, and optional for contributors.
