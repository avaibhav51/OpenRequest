# Technology decisions

Last reviewed: 21 September 2026.

## Decision summary

| Area | Choice | Status | Reason |
|---|---|---|---|
| Web/PWA | React + TypeScript + Vite | Adopted | Mature ecosystem, good PWA support, small static deployment, and no server required for local mode. |
| Local storage | IndexedDB through Dexie | Adopted for prototype | Established browser storage wrapper with schema migrations. File-backed workspaces remain the durable target. |
| UI state | Zustand | Adopted | Small API and minimal ceremony. Domain data remains outside the store implementation. |
| Optional backend | Java 25 LTS + Spring Boot 4.x | Planned, not yet needed | Familiar Java development model, mature security/data/testing ecosystem, and straightforward self-hosting. Java 25 is the current LTS; Spring Boot 4.1 supports Java through 26. |
| Backend build | Maven Wrapper | Planned | Predictable setup without requiring a globally installed Maven version. |
| Database | PostgreSQL + Flyway | Planned | Mature open-source relational store and explicit, reviewable migrations. SQLite may be offered for single-user self-hosting after concurrency tests. |
| Authentication | OIDC/OAuth adapter; Keycloak reference deployment | Evaluate in Phase 3 | Keycloak is mature and self-hostable. It can provide local accounts and broker Google/GitHub. The PWA must still work without it. |
| Integration tests | JUnit 5 + Testcontainers | Planned | Tests the actual open-source database and services rather than substitutes. |
| Local protocol bridge | Go, Rust, or Java native image | Deferred benchmark | A normal JVM distribution conflicts with “no setup.” Decide using signed binary size, memory, TLS/gRPC support, cross-compilation, and contributor familiarity—not novelty. |

## Why there is no backend today

REST requests, local collections, history, import/export, and an installable PWA are client-side capabilities. Adding Spring Boot now would create:

- another process to install and operate;
- hosted compute and database costs;
- a larger attack surface for credentials;
- pressure to make signup part of onboarding;
- implementation work without improving the local workflow.

A backend becomes justified only when at least one accepted milestone needs cross-device encrypted sync, account recovery, shared workspaces, or a hosted revision log. Browser CORS and native gRPC are not reasons for a hosted backend: the correct privacy-preserving solution is an opt-in local bridge.

## Local companion baseline

The optional companion is distinct from the account/sync backend. Use Java 25 LTS and bundle a minimal Temurin-based runtime with `jlink`/`jpackage`, so end users do not install or configure Java. Maven Wrapper is the contributor entry point. Select the outbound HTTP engine through a focused conformance spike covering HTTP/2, streaming, cancellation, proxies, TLS, redirects, and large bodies; use official `grpc-java` libraries for native gRPC.

The companion has no database or cloud dependency and listens only on loopback. Its protocol, pairing model, security gates, packaging phases, and acceptance criteria are defined in [Local companion service plan](COMPANION_SERVICE_PLAN.md).

## Java backend baseline

Use the latest LTS rather than the latest six-month feature release. Java 25 is the current LTS according to the [Oracle Java support roadmap](https://www.oracle.com/java/technologies/java-se-support-roadmap.html). Prefer an open-source build such as Eclipse Temurin 25 for development and containers; do not require a paid Oracle Java subscription. The current [Spring Boot system requirements](https://docs.spring.io/spring-boot/system-requirements.html) include Java 25.

Start as one modular service:

```text
backend/
  pom.xml
  .mvn/ + mvnw + mvnw.cmd
  src/main/java/.../
    identity/       OIDC subject mapping and device sessions
    workspace/      encrypted workspace metadata
    revision/       append-only ciphertext revisions
    sharing/        invitations and wrapped workspace keys
    platform/       configuration, migrations, health, rate limits
```

The server stores ciphertext and synchronization metadata, not plaintext request bodies or API secrets. Enforce module boundaries in tests before considering separate services.

### Approved starting dependencies

- Spring Boot Web, Validation, Actuator
- Spring Security OAuth2 Resource Server/Client
- Spring Data JPA or JDBC—choose one after a small persistence spike, not both
- PostgreSQL JDBC driver and Flyway Community
- JUnit 5, AssertJ, Testcontainers, ArchUnit
- Micrometer's open interfaces; no hosted monitoring dependency
- Jackson, already managed by Spring Boot

Every additional dependency needs a maintained upstream, compatible open-source license, active security response, and a clear feature owner. Avoid small convenience libraries for code that is safer to maintain locally.

## Authentication boundaries

- Local mode has no user record and no token.
- Hosted mode accepts standards-based OIDC identities. Google and GitHub are identity providers, not hard-coded database schemas.
- Self-hosters can use Keycloak or another standards-compliant OIDC provider.
- Username/password requires password hashing, reset, verification, throttling, breached-password defenses, and session revocation. Do not implement a casual custom auth system.
- Email code/link requires SMTP and abuse controls; production delivery is not guaranteed free.
- SMS OTP requires a paid delivery provider in practice and is excluded from the reference app.
- Sync encryption keys are separate from login credentials so the server cannot decrypt workspaces.

## Open-source and reliability policy

Prefer technologies with multiple maintainers, published releases and security policies, stable licenses, reproducible local setup, and an exit path. SaaS free tiers may be documented as conveniences but must not become required architecture.

The reference local environment should eventually start with one command using Docker Compose or Podman Compose. It should use only open-source images and include development email capture through Mailpit. Production email/SMS delivery is intentionally not bundled.
