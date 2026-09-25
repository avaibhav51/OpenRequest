# Contributing

Thanks for helping build a small, local-first API workbench.

1. Discuss substantial UX, storage-format, security, or protocol changes in an issue first.
2. Keep local/no-account use fully functional.
3. Add fixtures or tests for parser, importer, migration, and request-model changes.
4. Do not add telemetry, remote fonts/scripts, hosted-only dependencies, or a new runtime service without explicit discussion.
5. Run `npm test` and `npm run build` before opening a pull request.

Commit generated lockfiles, keep dependencies minimal, and explain the security/cost impact of each new dependency or external service.

## Documentation is part of the change

A change is not complete until its user-facing and maintainer-facing documentation is accurate. In the same pull request or commit:

- update `README.md` when setup, commands, supported features, limitations, or the first-use experience changes;
- update the relevant file in `docs/` when architecture, deployment, authentication, storage, security, cost, or roadmap decisions change;
- remove obsolete instructions and unsupported feature claims instead of leaving contradictory historical guidance;
- document required software, environment variables, external-provider configuration, and whether a dependency is free, optional, self-hostable, or potentially paid;
- include migration or compatibility notes when persisted data or exported collection formats change;
- keep purely cosmetic changes out of the documentation unless they alter navigation, accessibility, or how a user finds or operates a feature.

Review documentation alongside tests and the production build before considering the work finished.
