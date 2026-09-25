# API performance and load-testing plan

## Goal

OpenRequest should support repeatable API performance checks without requiring a hosted load-testing account. The feature will reuse saved requests, environments, authorization, variables, scripts, and collections while keeping execution and results on the user's machine by default.

There are two distinct use cases:

- **Performance check:** send a small, controlled number of requests to compare latency, payload size, correctness, and regressions during development.
- **Load test:** generate sustained or increasing traffic with controlled concurrency or arrival rate to measure throughput, latency percentiles, saturation, and errors.

The UI must use these terms accurately. A single response time is not a load test, and browser timing alone must not be presented as server performance.

## Where tests run

### PWA preview mode

The PWA can provide a lightweight preview for a few sequential requests. This is useful for smoke checks, script validation, and confirming that a scenario works. It is not an authoritative load generator because browsers enforce CORS, per-origin connection behavior, background-tab throttling, timer clamping, memory limits, and mobile power policies.

Preview mode should be visibly labelled **Browser preview — not a load test** and capped conservatively.

### Companion and CLI mode

Real performance/load execution belongs in the optional local companion and headless CLI described in [Local companion service plan](COMPANION_SERVICE_PLAN.md). The Java 25 LTS runner can use virtual threads or an asynchronous HTTP engine after measurement proves the right model. It should run the same versioned collection/scenario format locally and in CI.

No OpenRequest-hosted traffic generator is planned. Users provide their own machine, network, and authorized target, so there is no mandatory platform fee.

## Initial feature set

### Scenario creation

- Select one request, a folder, or a collection.
- Define ordered steps with optional setup and teardown.
- Reuse active environments, authorization helpers, variable substitution, and safe scripts.
- Feed iteration data from local CSV or JSON.
- Capture response values for later steps without writing secrets to reports.
- Configure think time and optional randomized delay between steps.
- Validate the complete scenario once before load begins.

### Workload models

- **Iterations:** run a fixed number of complete scenario iterations.
- **Closed/concurrent users:** maintain a configured number of active virtual users.
- **Open/arrival rate:** start a configured number of iterations per second independently of response time.
- **Ramp:** increase or decrease concurrency/arrival rate over time.
- **Stages:** compose warm-up, steady-state, spike, and cool-down periods.

The first preview should support fixed iterations. The first companion release should add closed concurrency and ramps. Open arrival-rate scheduling should ship only after drift and overload behavior are tested.

### Metrics

- Total requests, completed iterations, duration, requests per second, and bytes sent/received.
- DNS, connection, TLS, time-to-first-byte, download, and total duration when the selected transport exposes them accurately.
- Minimum, maximum, mean, median, p90, p95, and p99 latency.
- Status-code distribution, transport errors, timeouts, assertion failures, and retry counts.
- Active users, queued work, achieved versus requested arrival rate, and dropped iterations.
- Per-request/step metrics as well as whole-scenario summaries.

Use a bounded-memory histogram suitable for latency percentiles rather than storing every timing indefinitely. Reports must identify the OpenRequest version, runner version, transport, machine/runtime summary, scenario hash, start time, and test configuration so comparisons have context.

## Assertions and thresholds

Existing safe assertions should work during runs. Load-specific thresholds should include:

```text
p95 duration < 500 ms
error rate < 1%
requests per second >= 100
assertion failures == 0
```

Threshold failures should produce a non-zero CLI exit code for CI. Separate server/application failures from generator overload, local network errors, and unmet requested arrival rate.

## Results and comparison

- Live summary with throughput, latency percentiles, errors, and active users.
- Local detailed results with configurable retention and a clear delete action.
- Compare two runs and show absolute and percentage regression/improvement.
- Export a versioned OpenRequest JSON report and compact CSV summary.
- Export JUnit XML for CI test reporting.
- Optional HTML report generated locally with no remote assets.
- Never include authorization values, cookies, secret variables, response bodies, or sensitive query values in default reports.

Raw per-request samples should be optional and bounded because they can consume substantial disk space and expose sensitive data.

## Safety and responsible-use controls

Load generation can disrupt systems. OpenRequest must make safe behavior the default:

- Require the user to confirm that they own or are authorized to test the target.
- Start with low limits and show estimated request volume before execution.
- Require an additional confirmation when raising concurrency, arrival rate, duration, or total requests beyond conservative local defaults.
- Make stop/cancel immediate and available through UI, CLI signals, and companion controls.
- Enforce configurable global and per-host rate/concurrency ceilings.
- Block cloud metadata and link-local endpoints by default; warn before private-network targets.
- Do not support traffic amplification, source spoofing, stealth, CAPTCHA bypass, or evasion behavior.
- Do not offer a public distributed load network or accept remote jobs on a user's companion.
- Respect explicit test duration and never continue after the UI/CLI loses control of a run.
- Display a reminder to coordinate with production operators before testing non-local environments.

Distributed testing is out of scope until authentication, encrypted coordination, target authorization, clock synchronization, result merging, and abuse prevention receive a separate design and security review.

## Accuracy and interpretation

- Use monotonic clocks for durations.
- Record coordinated-omission-aware latency when using an arrival-rate model.
- Measure generator CPU, memory, open connections, event-loop/scheduler delay, and achieved request rate so an overloaded generator is not mistaken for a slow API.
- Run a warm-up stage before comparing JVM-based results.
- Avoid silently retrying failed requests; retries must be explicit and reported separately.
- State that client-side measurements include network distance and are not equivalent to server-side tracing.
- Results from different machines, networks, transports, or configurations should not be compared without a warning.

## Java runner architecture

The runner should be a module of the local companion with a CLI entry point:

```text
companion/
  runner/
    scenario/       versioned scenario parsing and validation
    scheduler/      iterations, users, arrivals, ramps, cancellation
    execution/      request steps, data feeds, captures, assertions
    metrics/        histograms, counters, generator health
    report/         JSON, CSV, JUnit, local HTML
    cli/            headless commands and exit codes
```

Prefer established, maintained components for HTTP and histogram accuracy. Do not embed an entire third-party load-testing server when a small runner module is sufficient. Also provide documented export/integration paths for established external tools such as Apache JMeter or k6 rather than claiming OpenRequest replaces every specialist feature.

## Cost model

Local execution, reports, and CI use are open source and have no mandatory service charge. Costs can still arise from:

- the user's CI minutes or load-generator machines;
- API usage charged by the target provider;
- network egress;
- infrastructure scaled to receive the test traffic;
- optional third-party monitoring or hosted load platforms.

OpenRequest must show these as user-controlled external costs and must never imply that a free load generator makes the target traffic free.

## Delivery plan

### Performance 0 — browser smoke runner

- Fixed sequential iterations with a conservative cap.
- Existing request scripts/assertions and environment variables.
- Summary latency, statuses, errors, and local JSON/CSV export.
- Prominent browser-preview accuracy warning.

**Exit:** a developer can repeat a request or small scenario and catch basic latency/assertion regressions without installing the companion.

### Performance 1 — companion load runner

- Fixed iterations, closed concurrency, warm-up, duration, and ramps.
- Bounded latency histograms and p50/p90/p95/p99 reporting.
- Generator-health metrics, immediate cancellation, thresholds, and JUnit output.
- CLI execution using the same scenario file as the PWA.

**Exit:** local and CI runs are repeatable, bounded, secret-safe, and clearly distinguish target failures from generator overload.

### Performance 2 — advanced scheduling and analysis

- Open arrival-rate scheduling, staged spikes, data feeders, and run comparison.
- Per-step breakdown, locally generated HTML reports, and long-run result controls.
- Export adapters/templates for established load-testing tools.

**Exit:** the runner covers routine developer and small-team performance testing while specialist/distributed workloads retain documented external-tool paths.

## Acceptance criteria

- No account or hosted OpenRequest service is required.
- Browser preview cannot accidentally generate high load.
- Companion/CLI runs stop promptly and respect all configured limits.
- Reports contain no secrets by default.
- Percentile and rate calculations have deterministic tests.
- Scenario and result formats are versioned and documented.
- The same scenario can run from the PWA through the companion and directly from the CLI.
- CI threshold failures return stable, documented exit codes.
- Documentation clearly explains authorization, external costs, and measurement limitations.

