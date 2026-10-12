# Product plan and market assessment

Research snapshot: 21 September 2026. Features, limits, and prices change; links below are the evidence used for this plan.

Repository implementation/status audit: 11 October 2026. The market snapshot below has not been freshly re-researched. Capability bullets are targets unless explicitly marked implemented; [README](../README.md) lists current user features, and [Encrypted sync](ENCRYPTED_SYNC_PLAN.md) is the current sync/test/deployment boundary.

## Product thesis

The category is crowded, so “another Postman clone” is not enough. The defensible promise is:

> **The zero-account API workbench that starts in a browser, keeps data local, and graduates to files, Git, CLI, or optional encrypted sync without changing formats.**

The primary persona is an individual developer or small team that needs a request tool now, dislikes cloud lock-in, and may later need repeatable tests and Git review. The secondary persona is a learner or mobile developer who wants to inspect an API from a phone without installing a desktop application.

## Evidence and competitor map

| Product | Strongest proposition | What it covers well | Opportunity left open |
|---|---|---|---|
| Postman | Broad API lifecycle platform and ecosystem | Deep testing, mocks, monitoring, documentation, enterprise governance | Product weight, platform complexity, cloud/account distrust, and paid collaboration. Its March 2026 Free plan is single-user and cannot create a team ([official plan docs](https://learning.postman.com/docs/billing/about-plans/)). |
| Hoppscotch | Fast, open, browser-first and self-hostable | REST, GraphQL, WebSocket, Socket.IO, MQTT, SSE, migration, snippets, proxy/interceptor, PWA/desktop/CLI ([official site](https://hoppscotch.com/)) | A stronger portable file/Git story, more reliable self-host onboarding, and a focused “request first” UI. Historic self-host feedback called out Firebase dependence and missing tabs ([community discussion](https://www.reddit.com/r/selfhosted/comments/12jrkjv)). |
| Bruno | Local, plain-text, Git-native collections | Offline ownership, readable files, Git/IDE/CLI workflows ([official site](https://www.usebruno.com/)) | Browser/mobile access and no-install onboarding. Community praise centers on local files; complaints still mention small missing features ([discussion](https://www.reddit.com/r/softwaretesting/comments/16zjldy)). |
| HTTPie | Human-friendly terminal syntax plus a polished GUI | Excellent CLI ergonomics; desktop/web supports offline, no-account work and optional sync ([official site](https://httpie.io/desktop)) | A fully open, browser-first team workflow and broader protocol/test tooling. |
| Insomnia | Focused desktop client with broad protocols | REST, GraphQL, WebSocket, SSE and gRPC; local, Git, or cloud storage ([official repository](https://github.com/Kong/insomnia)) | Less account anxiety and fewer premium boundaries around collaboration/Git. |
| Yaak | Focused local desktop client by Insomnia's original creator | Local files, Git, no account, clean UX | Web/PWA/mobile reach; commercial use is not the same “free for everyone” promise ([author's comparison](https://yaak.app/postman-alternatives)). |
| Editor clients | Stay inside the coding context | `.http` files are tiny, reviewable, and easy to automate | Weak mobile/browser experience and less approachable response inspection. |

Community feedback is consistent even when individual posts are subjective:

- “Fast, offline, no login” is a feature cluster, not three separate nice-to-haves. A 2025 offline-alternative thread strongly favored Hoppscotch and Git-friendly Bruno ([Reddit](https://www.reddit.com/r/sysadmin/comments/1nbgelb/whats_the_best_postman_alternative_that_works/)).
- Users resent core workflows moving behind a paywall, particularly local data-driven collection runs ([Reddit](https://www.reddit.com/r/webdev/comments/1rrsvkd/postman_alternative_for_batch_processing/)).
- Local text collections are repeatedly valued because they fit normal source control rather than requiring a special collaboration service ([Reddit](https://www.reddit.com/r/devops/comments/1mv9dl1/looking_for_offline_postman_alternatives/)).
- “Bloated,” “slow,” forced account/cloud, and maintaining the tool rather than testing APIs are recurring complaints ([Reddit](https://www.reddit.com/r/softwaretesting/comments/1thqqjl/is_it_just_me_or_has_postman_become_bloated_slow/)).

### USP worth building

The differentiator is a **continuity ladder**:

`paste URL/cURL → local browser workspace → install PWA → attach local bridge → open the same collection as files → share through Git → optionally enable encrypted sync`

This is a positioning hypothesis, not a demonstrated exclusive advantage. Files/Git/CLI/bridge stages are still planned, and other products already offer local/no-account workflows. “No setup” and “serious workflow” should be stages of the same product, not opposing editions.

## Prioritization tags

- **[M0 Must]** Required for a trustworthy useful release.
- **[M1 Should]** Important for daily adoption after the core is stable.
- **[M2 Later]** Valuable expansion; do not delay the core.
- **[Bridge]** Impossible or materially restricted in a normal browser; requires an opt-in localhost companion, desktop wrapper, or user-supplied proxy.
- **[Optional service]** Requires infrastructure. Local mode must not depend on it.
- **[Reject]** Conflicts with privacy, cost, or simplicity goals.

## Capability backlog

### Request and response workbench

The immediate editor-consistency workstream is tracked in [Request editor synchronization plan](REQUEST_EDITOR_SYNC_PLAN.md). It prioritizes imported authorization, generated header/parameter visibility, body/content-type synchronization, forms, auth conflicts, method/body compatibility, and safe response representations. URL-removal undo behavior is explicitly deferred until those first picks are complete.

Its deferred-update queue currently contains two scoped items: the complete browser multipart-file lifecycle and committed URL/Params reconciliation with reversible removal. Multipart text fields already work; this queue covers actual user-selected files, safe persistence/export behavior, and parameter-loss protection.

- **[M0 Must]** REST methods, URL, params, headers, JSON/text/form/multipart bodies, redirects, timing, size, searchable formatted/raw response.
- **[M0 Must]** Paste cURL, URL auto-detection, copy cURL, syntax highlighting, JSON validation/formatting.
- **[M0 Must]** Auth helpers: Basic, Bearer, API key, OAuth 2 authorization-code + PKCE; secrets remain local by default.

Basic, Bearer/JWT and API-key helpers are implemented. OAuth for signing into OpenRequest is separate from OAuth authorization for arbitrary target APIs; the latter helper is still planned.
- **[M0 Must]** Environments and `{{variables}}`, with secret values excluded from normal export.
- **[M0 Done subset]** Per-tab cancellation, network/body timeout, final URL/redirect and empty-body diagnostics. Retry, cookie visibility and native TLS diagnostics remain future work; browser network errors cannot reliably identify CORS versus VPN/DNS/TLS.
- **[M0 Must]** Import/export Postman v2.1, OpenAPI 3.x, HAR, cURL, and the project's versioned format.
- **[M1 Should]** GraphQL schema introspection, variables, autocomplete, and operation history.
- **[M1 Should]** WebSocket and SSE sessions.
- **[M1 Should] [Bridge]** Native gRPC with reflection and protobuf import. Browsers cannot directly issue native HTTP/2 gRPC; gRPC-Web supports unary and limited server streaming through a compatible server/proxy, not client/bidirectional streaming ([official grpc-web documentation](https://github.com/grpc/grpc-web)).
- **[M2 Later]** SOAP/WSDL, MQTT, Socket.IO, certificate selection, client TLS, SSH tunnel.

### Collections, files, and automation

- **[M1 Implemented]** Saved-request management, 12-level folder creation/navigation, transactional subtree rename/reparent/delete, folder-aware search and subtree backups. Deleting a folder retains saved requests at collection root. Cross-collection folder moves and concurrent folder-metadata merging remain future work.
- **[M0 Must]** Human-readable documented format with stable IDs, deterministic ordering, semantic diffs, and conversion tools. Evaluate [OpenCollection](https://www.opencollection.com/) before inventing a format.
- **[M0 Must]** File System Access API where supported, plus explicit JSON/YAML import/export fallback on Safari/iOS.
- **[M1 Should]** Pre-request/post-response scripts in a constrained worker sandbox; assertions and reusable snippets.
- **[M1 Should]** Collection runner with iteration data from CSV/JSON, result export, and CLI parity. Never make local data-file runs paid.
- **[M1 Should]** Browser performance smoke runner with conservative sequential limits, assertions, latency summaries, and local export. Label it as a preview rather than a load generator.
- **[M2 Later] [Bridge]** Companion/CLI load testing with concurrency, arrival rates, ramps, percentiles, thresholds, generator-health metrics, comparisons, and CI reports. Keep execution local and apply explicit authorization and safety limits. See the [Performance and load-testing plan](PERFORMANCE_LOAD_TESTING_PLAN.md).
- **[M1 Should]** Git-friendly conflict detection; Git itself remains external at first.
- **[M2 Later]** Local mock server, scheduled runner, generated docs, code snippets, CI reporter formats.

### Onboarding and UX

- **[M0 Must]** Guest/local is the default. No login wall, setup wizard, workspace decision, or consent maze.
- **[M0 Must]** Empty screen accepts a URL or cURL; include safe sample requests and a dismissible 60-second tour.
- **[M0 Must]** Keyboard-first command palette on desktop; thumb-reachable Send and bottom-sheet editors on mobile.
- **[M0 Must]** Theme follows system with explicit dark/light options; accessible contrast, labels, focus, reduced motion.
- **[M1 Should]** Restore tabs/session, request breadcrumbs, response split/overlay controls, global search.
- **[M1 Should]** Explain CORS in plain language and offer bridge installation only after it is needed.
- **[Reject]** AI chat as the default surface. Optional local/provider-key helpers can come later, but should not add cost or obscure basic actions.

### Identity and sync

- **[M0 Must]** No identity in local mode. Device data is usable indefinitely without signup.
- **[M1 Should] [Optional service]** Google and GitHub OAuth; email code/link; complete email/password signup and recovery as one deliverable. Use standards-based adapters so self-hosters can choose their own OpenID Connect provider.
- **[M1 Initial implementation] [Optional service]** End-to-end encrypted workspace sync: encrypt on device; server stores ciphertext; the passphrase-wrapped recovery key belongs to the user. Active authorization values are excluded by default.
- **[M1 Implemented] [Optional service]** Saved-only sync with commit-ordered keyset cursors/backoff, local-secret-preserving pulls and portable variable references. Up to 20 encrypted upserts can be recovered as a new local copy; confirmed owner cleanup retains latest revisions/tombstones. Unsaved drafts, responses, history and variable values remain local.
- **[M2 Later] [Optional service]** Passkeys, device pairing and shared encrypted workspaces. Single-owner revision history, version-copy recovery and explicit per-object cleanup are implemented; automated retention and key/account lifecycle remain later.
- **[Out of scope]** Mobile SMS OTP. Reliable delivery is a metered telecom service and abuse target, so it is deliberately excluded from the reference app. Prefer email links, passkeys/TOTP, or OAuth.

Near-future prerequisites, to surface when choosing the next work item:

- **[M1 Should]** Test Supabase Auth without storing application data: email signup/sign-in/sign-out, confirmation, magic link, password recovery, Google/GitHub callbacks, expired links, invalid redirects, and session restoration.
- **[M1 Should]** Add email/password signup, sign-in, forgot-password/recovery, confirmation/error handling, and tests together; do not expose a partial password flow. Follow the deferred implementation section in [Auth setup](AUTH_SETUP.md#deferred-emailpassword-implementation).
- **[M1 Implemented, verification follow-up] [Optional service]** Encrypted synchronization and RLS are present. The gated tests now cover draft-preserving tabs and automatic alternating-device updates without Sync now, but their updated scenarios await a local-Supabase run; wider device/deletion hardening remains. See [Encrypted sync status](ENCRYPTED_SYNC_PLAN.md).
- **[M0 Done: framework]** Vitest/Playwright and browser/database CI jobs are implemented. Auth lifecycle, offline-reload and broader accessibility coverage remain work; real provider tests stay separately configured.

## Delivery roadmap

### Reliability cleanup priorities

- **[Done: safe script subset]** Environment-scoped persistent set/unset in both phases, outgoing query set/remove, and scalar JSON-object body set/remove before dispatch; per-run scripts never edit the saved request. Variables remain local and secret-marked.
- **[Done: script discovery]** Phase-aware command snippets, keyboard suggestions and a mobile Insert command menu, plus active-environment/built-in variable-name completion without values. Examples are inserted only on selection; persistent writes are labeled. Contextual response-path/header completion and inline validation remain future UX improvements.
- **[Done: script editor split]** Desktop/tablet Before/After divider supports pointer and keyboard resizing, equal-split reset, browser-local persistence and minimum heights; narrow phones use stacked editors. Suggestions and script contents stay accessible in small sections.
- **[Deferred: script enhancements]** JSON schema validation; conditional execution; token-refresh/request chaining. Chaining must be opt-in with allowed destinations, execution/request/depth limits, cancellation/timeout, credential isolation, and no implicit background calls. Body array/form/multipart field scripting and richer path syntax also remain future work.

- **[P0 Done]** Protect edits in open tabs, persist saved tab details, mark unsaved changes, and confirm close/Revert.
- **[P0 Done]** Bind responses, errors, and running state to the originating tab; snapshot history and script/environment context at Send time. Browser regression covers concurrent/out-of-order completions and closed-tab results.
- **[P0 Verify]** Confirm pushed browser/database CI checks are green.
- **[P0 Done: documentation audit]** Reconciled current implementation, test limits, deployment requirements, local-key/secret boundaries and remaining work across existing docs (11 October 2026).
- **[P0 CI wiring implemented, live verification required]** Database-security CI runs configured browser sync scenarios, pgTAP and two-user public API checks against a disposable stack. Default unconfigured browser regression still skips live transport. Docker must be started for local validation; actual CI green checks remain a release requirement.
- **[P1 Done]** Cancel individual runs (including script sleep and tab close), configurable per-request network/body deadlines, final URL/browser redirect details, explicit empty-body states and distinct cancellation/timeout/network errors. Cancellation cannot undo server-side work or already-committed variable writes. See README and Regression testing plan for behavior and evidence.
- **[P1 Done: OpenRequest portability]** Collection/workspace JSON import with whole-file validation, preview, local-only transactional restoration, copy/skip-ID duplicates, older version-1 defaults and export/restore browser tests. Existing data/drafts are never overwritten. Unknown extra fields are discarded; third-party imports and full-workspace/key recovery remain future work.
- **[Later: portability expansion]** Third-party adapters, environment-inclusive encrypted backups, reviewed bulk sync publishing and optional version-replacement/merge preview. Do not add implicit overwrite or automatic imported-script execution.
- **[P1 Implemented: request management]** Saved-request search, rename/move, saved-copy duplication and transactional confirmed deletion. Open edits are preserved; local/remote deletes detach open copies into new browser-local drafts. Fresh revision identities plus revision-based acknowledgements protect saves/deletes made during in-flight uploads. Unit/encrypted-processor and deterministic browser coverage exist; gated live two-profile deletion execution is pending because Docker is stopped. Stronger concurrent/offline delete rules and purge remain P2 hardening.
- **[P1 Next]** Optional local companion MVP; verify deployment/CI and the gated real sync lifecycle before promoting sync broadly.
- **[P2 Implemented subset: folders]** Replaced the native collection-name prompt with an in-app dialog; added visible create controls, nested paths, first-save/move destinations, subtree backups and normalized SVG request actions. Folder creation is local unless its collection is already sync-eligible; placement uses saved-request mutations. Live two-device folder verification remains pending. See README and Regression testing plan.
- **[Implemented: desktop drag/drop]** Saved requests move onto collection roots, folders/subfolders or Unfiled; edge scrolling and delayed hover expansion assist long trees. External drags are ignored. Touch/keyboard use Move. Folder reparenting uses Manage folder, not folder dragging; native touch dragging remains outside scope.

- **[Implemented: October 12 reliability audit]** Patched Vite/transitive advisories, serialized draft persistence with Retry/close warnings, 50-entry database history retention, 10 MiB streamed response cap, modal focus/Escape/restoration, honest sidebar account/sync state and consent-based PWA updates. Offline reopening and worker-update regression are included; physical devices, hostile frontend/XSS review and complete OAuth/email callbacks are not certified by these tests.

### Phase 0 — local core (initial estimate, not a release deadline)

Working PWA shell, REST Fetch with cancellation/timeouts/diagnostics and size caps, cURL import/export, durable draft feedback, saved-request/folder management, variables, scripts, backups and themes. Offline-reload/update and modal-keyboard tests are added. Remaining local-core expansion includes multipart files, third-party import, cross-collection folder moves and physical-device/accessibility review.

**Exit:** Lighthouse installable/offline; no network request on first load except the API the user sends; major workflows have browser tests.

### Phase 1 — credible solo client (4–6 weeks)

Environments, common auth helpers, persistent tabs, folder subtree management and raw/preview responses are implemented. Remaining expansion includes cross-collection folder moves, Postman/OpenAPI/HAR import, response search, WebSocket/SSE, command palette and compatibility/migration hardening.

**Exit:** A developer can replace 80% of routine Postman/HTTPie GUI work without an account.

### Phase 2 — bridge + files + CLI (6–10 weeks)

Java 25 LTS localhost companion, native unrestricted HTTP, native gRPC, certificate store, OpenCollection evaluation/adoption, filesystem workspace, headless collection/performance runner, load-test metrics, and CI output. Bind only to loopback, use an exact origin allowlist and authenticated pairing, and show every privileged capability. See the [Local companion service plan](COMPANION_SERVICE_PLAN.md) and [Performance and load-testing plan](PERFORMANCE_LOAD_TESTING_PLAN.md).

**Exit:** Browser UI can securely handle APIs that CORS or native protocols block; the same collection runs in CI.

### Phase 3 — optional accounts (after local core)

The initial Supabase adapter, optional OAuth/email-link UI, client encryption, passphrase unlock and saved-request revision transport are implemented in parallel with local-core work. Continue with lifecycle/reliability tests, recovery/deletion/restore UX and operator hardening; device pairing and complete email/password are still planned. Add a Java 25/Spring Boot alternative only when a concrete requirement justifies it.

**Exit:** Turning sync off leaves a fully useful application and a complete local export.

### Phase 4 — collaboration, not platform sprawl

Encrypted sharing, review links, Git workflows, mocks, scheduled local runner. Avoid enterprise governance until maintainers and demand justify its security/support burden.

## Zero-cost path and honest caveats

| Need | Zero-cost starting choice | Caveat / safe alternative |
|---|---|---|
| Static PWA hosting | GitHub Pages or Cloudflare Pages. Cloudflare's Free plan currently allows 500 builds/month ([official limits](https://developers.cloudflare.com/pages/platform/limits/)). | Free tiers can change. The built `dist/` is portable to any static host or self-hosted server. A custom domain is not free. |
| Source, issues, CI | Public GitHub repository and GitHub Actions public-repo allowance | Keep workflows portable; contributors can run all checks locally. |
| Local data | IndexedDB now; OPFS/files later | Browser storage may be evicted or manually cleared. Provide prominent export/backups; never claim it is a backup service. |
| Auth/database prototype | Supabase Free supports social OAuth and 50k MAU, but pauses inactive free projects ([official pricing](https://supabase.com/pricing)). | Do not make hosted Supabase the only backend. Provide Docker/self-host config and an OIDC adapter. |
| Email/password | Password auth has no delivery cost; local dev can use Mailpit | Password reset/verification emails need an SMTP provider. Built-in provider limits are unsuitable for production; deliverability is never guaranteed free. |
| Email code/link | User-supplied SMTP or a limited free email tier | Rate-limit and add bot protection. Free quotas and sender requirements change. Password/passkey is the durable no-email fallback. |
| Google/GitHub login | Provider app registration is generally free | OAuth consent configuration, privacy policy, redirect domain, and provider policy compliance are still required. Provider availability is external risk. |
| Phone OTP | None that is reliably free, global, and abuse-resistant | Excluded from the reference app. Prefer passkeys, TOTP, email links, or OAuth. |
| Proxy/bridge | User runs the signed open-source localhost companion | A centrally hosted proxy creates bandwidth bills and sees sensitive traffic. Do not offer it as the default. |
| Monitoring | Local runner + user's GitHub Actions schedule | Hosted always-on schedules consume someone’s compute. Keep the format runnable anywhere. |

## Success measures without surveillance

No product analytics by default. Use opt-in, aggregate release feedback and public issue templates. Product-quality measures should be locally testable:

- cold open to editable request under 1 second on a mid-range phone;
- cURL paste to response in at most two actions;
- 100% of local data exportable without account or network;
- no third-party network requests from the application shell;
- core bundle budget under 250 KB compressed after Phase 1;
- keyboard-only and screen-reader smoke tests in CI;
- import round-trip fixtures cannot silently lose fields.

## Decisions to make before public launch

1. Final project name and trademark/domain search.
2. AGPL vs MPL-2.0 license after contributor/community discussion.
3. Adopt OpenCollection or publish an independent format.
4. Validate the agreed Java 25 bundled-runtime companion with a secure pairing/HTTP-engine spike; revisit language only if measured packaging or transport requirements justify it.
5. Whether maintainers will operate any cloud at all. “Bring your own sync backend” is a valid, lower-liability first release.
