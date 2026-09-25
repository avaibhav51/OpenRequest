# Local companion service plan

## Purpose

OpenRequest is a browser-first PWA, so the browser correctly enforces CORS and cannot expose unrestricted sockets, native gRPC, operating-system certificate stores, or arbitrary local files. A future **optional local companion service** will handle those capabilities on the user's own computer without turning OpenRequest into a hosted proxy or requiring an account.

The PWA must remain fully useful without the companion. It should suggest installation only after a request fails because of a browser limitation or the user chooses a bridge-only feature.

## Planned capabilities

### First release

- Send HTTP/1.1 and HTTP/2 requests when browser CORS blocks direct Fetch.
- Preserve methods, headers, query parameters, request bodies, redirects, compression, timing, and response headers.
- Stream large responses instead of buffering everything in the PWA.
- Provide explicit timeout, cancellation, redirect, proxy, and TLS-verification controls.
- Maintain an optional local cookie jar isolated by OpenRequest workspace.
- Return structured network, DNS, TLS, timeout, and connection errors.

### Later releases

- Native gRPC with protobuf import and server reflection, including streaming modes that gRPC-Web cannot provide.
- Client certificates selected through an explicit per-host capability grant.
- Multipart/file request bodies using individually approved file paths.
- WebSocket and SSE handling when browser restrictions prevent the required connection.
- Local collection runner and machine-readable CI reports, sharing the versioned OpenRequest collection model.
- Local performance/load runner with concurrency, ramps, thresholds, percentiles, and CI reports, following the separate [Performance and load-testing plan](PERFORMANCE_LOAD_TESTING_PLAN.md).
- System proxy and custom CA support with prominent security warnings and host-scoped configuration.

## Explicit non-goals

- No public/shared CORS proxy operated by the project.
- No listening on LAN or public interfaces by default.
- No account, collection sync, analytics, telemetry, or cloud dependency.
- No arbitrary shell command execution.
- No silent filesystem access or unrestricted certificate access.
- No global “disable TLS verification” default. Any temporary exception must be visible and host-scoped.
- No automatic forwarding of browser cookies, account sessions, or environment secrets.

## Reference implementation

The reference implementation should use **Java 25 LTS** with an open-source Eclipse Temurin runtime because it matches the project's Java experience and has mature HTTP, TLS, packaging, and gRPC libraries. It is a separate local process, not the future account-sync backend.

Recommended structure:

```text
companion/
  pom.xml
  mvnw + mvnw.cmd + .mvn/
  src/main/java/.../
    bootstrap/       process lifecycle and configuration
    pairing/         origin approval, device keys, revocation
    transport/       loopback HTTP/WebSocket protocol
    http/            outbound HTTP engine and streaming
    grpc/            protobuf, reflection, and streaming
    capability/      host, file, certificate, and proxy grants
    audit/           local redacted event log
```

Candidate maintained dependencies are Java's standard APIs, Spring Boot where its lifecycle and validation support materially help, Java `HttpClient` or Apache HttpComponents 5 after a focused transport spike, and official `grpc-java` libraries. Keep the dependency set small and document every addition. Use Maven Wrapper so contributors do not need to install Maven separately.

Release builds should use `jlink`/`jpackage` to bundle a minimal runtime. End users should install one signed package and should not have to install Java. Development remains possible with Temurin 25 and `./mvnw`.

## Connection and pairing design

1. The companion binds only to explicit loopback addresses (`127.0.0.1` and, after testing, `::1`) on a random available port.
2. The PWA discovers it through a narrowly defined loopback endpoint. Browser Private Network Access and secure-context behavior must be tested in current Chrome, Edge, Firefox, and Safari before the protocol is frozen.
3. First use displays an approval screen in the companion and exchanges a high-entropy, one-time pairing value. A short numeric code alone is not sufficient authentication.
4. The companion records the exact allowed web origin, not a wildcard. Local development and the deployed PWA are separate grants.
5. Every subsequent request is authenticated and bound to the approved origin. Pairings can be viewed and revoked locally.
6. Protocol messages include a version and request ID, and cancellation is supported from the first release.

If reliable secure loopback communication cannot be delivered consistently in a target browser, that browser should remain in direct-Fetch mode or use a separately reviewed extension/native-messaging adapter. Do not weaken pairing or expose a LAN listener as a workaround.

## Security requirements

- Validate `Origin` and `Host` on every request and defend against DNS rebinding.
- Use an exact origin allowlist; never return permissive CORS headers to arbitrary sites.
- Require authentication for every privileged endpoint, including health/details endpoints that expose configuration.
- Keep pairing keys in operating-system protected storage where available; document fallbacks.
- Request explicit capability grants for destination hosts, private-network ranges, files, proxies, and client certificates.
- Block cloud metadata/link-local endpoints by default and warn before private-network access.
- Enforce request/response size limits, connection limits, timeouts, and cancellation.
- Verify server TLS certificates and hostnames by default.
- Redact authorization headers, cookies, API keys, bodies, query secrets, and certificate material from logs.
- Never persist request credentials unless the user explicitly stores them in the existing local variable system.
- Publish a threat model before beta and obtain security review before enabling native gRPC, files, or certificates.
- Produce signed artifacts, checksums, an SBOM, reproducible build instructions, and a signature-verifying update path.

## PWA experience

The request pipeline will have two visible transports:

- **Browser (default):** zero setup, browser security rules apply.
- **Local companion:** opt-in, unrestricted local transport with granted capabilities.

Automatic behavior should be conservative:

1. Try the browser transport by default.
2. When a likely CORS error occurs, explain that the browser blocked access; do not claim every network failure is CORS.
3. If a paired companion is available, offer **Retry with local companion**.
4. Remember a transport choice per request or host only after explicit confirmation.
5. Always show which transport will receive credentials before sending.

The UI must include companion health, version, granted origins/capabilities, disconnect, and pairing-revocation controls. Direct Fetch must continue working if the companion stops or is uninstalled.

## Local data and privacy

Requests travel directly from the user's machine to the destination API. The OpenRequest project does not receive the request, response, token, certificate, or browsing metadata. Companion configuration and redacted audit events remain local and have a documented delete/reset command.

Collection exports should contain transport preferences and references to capabilities, never private keys, certificate contents, pairing keys, or absolute local file contents.

## Cost and distribution

The companion is open source and has no mandatory service cost. Users provide their own computer, network, API access, proxy, and certificates. GitHub Releases can distribute binaries without creating a paid runtime dependency; package-manager publishing is optional. Code signing can introduce maintainer costs, especially on macOS and Windows, and must be clearly documented if community builds are unsigned.

Docker may be offered for development and headless runners, but it is not the primary desktop onboarding path because container networking, file mounts, and certificate access add setup friction.

## Delivery phases

### Bridge 0 — protocol and threat model

- Write the versioned request/response protocol and JSON Schema.
- Prototype secure loopback pairing across supported browsers.
- Document the threat model, origin validation, DNS-rebinding defenses, and secret-redaction rules.
- Decide the outbound HTTP engine using conformance tests, not feature claims.

**Exit:** a security-reviewed spike can pair, send a cancellable request, and stream a response without accepting requests from an unapproved origin.

### Bridge 1 — HTTP preview

- Package signed or clearly labelled community builds for macOS, Windows, and Linux.
- Support HTTP, redirects, timeouts, cancellation, compression, streaming, and structured errors.
- Add PWA discovery, pairing, health, transport selection, and “Retry with companion.”
- Add integration tests against CORS-denied, TLS, redirect, slow, and large-response fixtures.

**Exit:** a new user can install, pair, and send a CORS-blocked request without editing configuration files.

### Bridge 2 — native protocols and capabilities

- Add native gRPC, reflection, and streaming.
- Add file-body and client-certificate grants.
- Add local runner/CLI reuse of the same collection model.
- Complete external security review and packaging/update hardening.

**Exit:** browser UI and CLI cover native workflows while every privileged capability remains explicit and revocable.

## Acceptance criteria

- Local/no-account PWA behavior is unchanged when the companion is absent.
- Installation, pairing, first CORS-blocked request, revocation, and uninstall are documented and tested.
- No default listener is reachable from another device.
- An unpaired website cannot use or identify sensitive companion configuration.
- Credentials do not appear in logs or crash output.
- Windows, macOS, and Linux packages require no separately installed Java runtime.
- The protocol and collection compatibility fixtures are versioned and usable by third-party compatible implementations.
