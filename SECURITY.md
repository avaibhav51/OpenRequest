# Security policy

This project handles API credentials and request data, so security reports should not begin as public issues. Until a dedicated address exists, use GitHub's private vulnerability reporting feature after the repository is published.

The current `0.x` prototype is not yet suitable for storing production secrets. It keeps data in browser IndexedDB and has not received an independent security audit. Export non-sensitive test collections, use short-lived credentials, and avoid placing long-lived secrets in request history.

Environment values marked secret are visually masked and excluded from collection exports, but they are not yet encrypted at rest. The basic script language is declarative and does not execute arbitrary JavaScript.

The project will publish a threat model before optional sync, scripting, or the localhost bridge is considered stable.
