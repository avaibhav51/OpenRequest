# Product plan and market assessment

Research snapshot: 21 September 2026. Features, limits, and prices change; links below are the evidence used for this plan.

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

No existing leader makes every step optional while keeping one portable source of truth. “No setup” and “serious workflow” should be stages of the same product, not opposing editions.

## Prioritization tags

- **[M0 Must]** Required for a trustworthy useful release.
- **[M1 Should]** Important for daily adoption after the core is stable.
- **[M2 Later]** Valuable expansion; do not delay the core.
- **[Bridge]** Impossible or materially restricted in a normal browser; requires an opt-in localhost companion, desktop wrapper, or user-supplied proxy.
- **[Optional service]** Requires infrastructure. Local mode must not depend on it.
- **[Reject]** Conflicts with privacy, cost, or simplicity goals.

## Capability backlog

### Request and response workbench

- **[M0 Must]** REST methods, URL, params, headers, JSON/text/form/multipart bodies, redirects, timing, size, searchable formatted/raw response.
- **[M0 Must]** Paste cURL, URL auto-detection, copy cURL, syntax highlighting, JSON validation/formatting.
- **[M0 Must]** Auth helpers: Basic, Bearer, API key, OAuth 2 authorization-code + PKCE; secrets remain local by default.
- **[M0 Must]** Environments and `{{variables}}`, with secret values excluded from normal export.
- **[M0 Must]** Abort, retry, timeout, cookie visibility, TLS/error explanations.
- **[M0 Must]** Import/export Postman v2.1, OpenAPI 3.x, HAR, cURL, and the project's versioned format.
- **[M1 Should]** GraphQL schema introspection, variables, autocomplete, and operation history.
- **[M1 Should]** WebSocket and SSE sessions.
- **[M1 Should] [Bridge]** Native gRPC with reflection and protobuf import. Browsers cannot directly issue native HTTP/2 gRPC; gRPC-Web supports unary and limited server streaming through a compatible server/proxy, not client/bidirectional streaming ([official grpc-web documentation](https://github.com/grpc/grpc-web)).
- **[M2 Later]** SOAP/WSDL, MQTT, Socket.IO, certificate selection, client TLS, SSH tunnel.

### Collections, files, and automation

- **[M0 Must]** Collections → arbitrary nested folders → requests; duplicate, move, search, export at any node.
- **[M0 Must]** Human-readable documented format with stable IDs, deterministic ordering, semantic diffs, and conversion tools. Evaluate [OpenCollection](https://www.opencollection.com/) before inventing a format.
- **[M0 Must]** File System Access API where supported, plus explicit JSON/YAML import/export fallback on Safari/iOS.
- **[M1 Should]** Pre-request/post-response scripts in a constrained worker sandbox; assertions and reusable snippets.
- **[M1 Should]** Collection runner with iteration data from CSV/JSON, result export, and CLI parity. Never make local data-file runs paid.
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
- **[M1 Should] [Optional service]** Google and GitHub OAuth; email/password; email code/link. Use standards-based adapters so self-hosters can choose their own OpenID Connect provider.
- **[M1 Should] [Optional service]** End-to-end encrypted workspace sync: encrypt on device; server stores ciphertext; recovery key belongs to the user. Exclude active secrets by default.
- **[M2 Later] [Optional service]** Passkeys, device pairing, shared encrypted workspaces, append-only revision log.
- **[Not zero-cost]** Mobile SMS OTP. An auth server can be free/self-hosted, but reliable SMS delivery is a metered telecom service and abuse target. Supabase explicitly requires an SMS provider for phone auth ([official docs](https://supabase.com/docs/guides/auth/passwords)); do not promise this free. Offer email OTP, TOTP/passkeys, or user-configured SMS credentials instead.

## Delivery roadmap

### Phase 0 — current repository (1–2 weeks)

Working PWA shell, REST Fetch requests, cURL import/export, IndexedDB collections/history, isolated environment variables, safe basic scripts, collection export, responsive theme, and an in-app quick reference. Close the remaining gaps with form/multipart bodies, abort/timeout, request deletion, collection import, and expanded accessibility tests.

**Exit:** Lighthouse installable/offline; no network request on first load except the API the user sends; major workflows have browser tests.

### Phase 1 — credible solo client (4–6 weeks)

Environments/secrets, auth helpers, nested collection UI, tabs, Postman/OpenAPI/HAR import, request export, response search/raw preview, WebSocket/SSE, command palette, schema/version migrations.

**Exit:** A developer can replace 80% of routine Postman/HTTPie GUI work without an account.

### Phase 2 — bridge + files + CLI (6–10 weeks)

Rust or Go localhost bridge, native unrestricted HTTP, native gRPC, certificate store, OpenCollection evaluation/adoption, filesystem workspace, headless collection runner, CI output. Bind only to loopback, use an origin allowlist and pairing token, show every privileged capability.

**Exit:** Browser UI can securely handle APIs that CORS or native protocols block; the same collection runs in CI.

### Phase 3 — optional accounts (after local core)

Adapter-based auth, client-side encryption, revision sync, device pairing, Google/GitHub/email methods. Build the self-host reference service as a Java 25 LTS/Spring Boot modular monolith, not a microservice fleet. Self-host configuration and migration/export docs ship with cloud beta.

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
| Phone OTP | None that is reliably free, global, and abuse-resistant | Mark experimental/self-configured. Prefer passkeys, TOTP, email code, or OAuth. Never use unofficial SMS gateways. |
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
4. Go vs Rust bridge based on binary size, TLS/gRPC libraries, and signing/release experience.
5. Whether maintainers will operate any cloud at all. “Bring your own sync backend” is a valid, lower-liability first release.
