---
name: architecture
description: >
  Use when evaluating software architecture decisions from first principles.
  Triggers on: "review this architecture", "evaluate architecture",
  "architecture review", "are these service boundaries right",
  or when discussing system-level structure.
argument-hint: "[target file or description]"
---

# First Principles Architecture Review

You are performing a First Principles Architecture Review. Evaluate whether architectural decisions follow from real system constraints or from convention and cargo-culting — adopting patterns because others use them, without verifying they fit the actual problem.

---

## Input Gathering

Collect architectural context before analysis. Adapt to what you are given.

- If `$ARGUMENTS` contains a file path, read it. Treat its contents as the primary subject of review.
- If `$ARGUMENTS` contains a description rather than a file path, use the description as context and explore the codebase to corroborate.
- If no arguments are provided, explore the codebase structure to infer the architecture:
  - Read the directory layout and package structure at the top two levels.
  - Look for infrastructure and deployment signals: `docker-compose.yml`, `Dockerfile`, Kubernetes manifests, Terraform/Pulumi/CDK files, CI/CD configs (`.github/workflows`, `Jenkinsfile`, `.gitlab-ci.yml`).
  - Read `README.md` or any architecture documentation if present.
  - Identify service boundaries from build targets, package entry points, or separate deployable units.
  - Scan for inter-service communication: HTTP clients, message queue producers/consumers, gRPC proto files, shared database connections.
- After gathering codebase signals, ask at most **2 targeted questions** about constraints the code cannot reveal. Examples: scale requirements, team structure, SLAs, regulatory requirements, expected growth trajectory.
- Do NOT assume you know the constraints. If the code does not reveal a constraint, ask about it or flag it as an unknown.

---

## Execute the Five-Phase Framework

Read and follow [the framework](../shared/framework.md). Apply all five phases in sequence, with the following emphasis for architecture review.

### Phase 1 — Decompose

Focus on system-level constraints. Answer:

- What does this system actually need to do at the system level? Name the core capabilities, not the services.
- What are the scale requirements: throughput, latency targets, data volume, geographic distribution?
- What are the consistency requirements? Which operations need strong consistency, and which tolerate eventual consistency?
- What are the team boundaries? How many teams own this system, and where do ownership boundaries fall?
- What are the operational requirements: uptime targets, deployment frequency, rollback needs, compliance mandates?

Strip away the current architecture. State the problem as if no solution exists yet.

### Phase 2 — Surface Assumptions

Target architectural cargo-culting. For each major architectural choice, ask: was this chosen because it is right for THIS problem, or because it is familiar?

Probe specifically:

- "Microservices because microservices." Is the service decomposition driven by domain boundaries or by convention? Would a modular monolith satisfy the same constraints at lower operational cost?
- "Kafka because everyone uses Kafka." Is the messaging infrastructure justified by actual throughput, ordering, or replay needs? Would a simpler queue or direct calls suffice?
- "REST because REST." Is the communication protocol chosen for the right reasons? Does the interaction pattern actually fit request-response, or would event-driven, streaming, or RPC be more natural?
- "Kubernetes because Kubernetes." Is the orchestration complexity justified by the deployment requirements?

For each assumption, estimate the cost-if-wrong using the framework's rating scale.

### Phase 3 — Reason Upward

Derive what the architecture should look like from the fundamentals, ignoring the current structure.

Reason about:

- **Natural service boundaries.** What data lives together? What changes together? What can be deployed independently without coordination? Boundaries should follow domain cohesion, not team org charts.
- **Data gravity.** Where does data naturally accumulate? Which data is read-heavy vs. write-heavy? Where are the consistency boundaries? Let data flow dictate component placement.
- **Failure domains.** What can fail independently without cascading? Where are the blast radius boundaries? Each failure domain should map to a meaningful operational boundary.
- **Communication patterns.** What interactions are synchronous by necessity (user-facing latency) vs. asynchronous by nature (background processing, eventual consistency)? Let the interaction nature dictate the protocol.

Compare this derived structure against the actual architecture. Note where they align and where they diverge.

### Phase 4 — Anchor Against Principles

Draw primarily from these principles in [the principle catalog](../shared/principle-catalog.md):

- **Coupling & Cohesion (#3):** Do service boundaries reflect real domain cohesion? Are services coupled through shared databases, shared models, or coordinated deployments?
- **Least Privilege / Least Knowledge (#6):** Does each service know only what it needs? Are there god-services that centralize too much knowledge?
- **Reversibility (#7):** Which architectural decisions are expensive to unwind? Are irreversible decisions backed by strong evidence, or by assumptions?
- **Fail-Fast (#9):** Does the system surface architectural problems early — deployment failures, integration mismatches, contract violations — or do they hide until production?
- **Separation of Concerns (#1):** Does each component have one clear reason to exist?

Apply additional principles from the catalog when Phases 1-3 reveal they are relevant. Do not force-fit principles that do not apply.

### Phase 5 — Produce Assessment

Generate an Assessment Report using the template in [output-templates](../shared/output-templates.md). Set **Mode** to Architecture.

Ensure every finding traces back to a specific phase output: a constraint from Phase 1, an assumption from Phase 2, a derived structure from Phase 3, or a principle from Phase 4.

---

## Output Focus

Structure your assessment around these priorities:

- State whether the architecture follows from real constraints or from convention. Be specific about which decisions are well-grounded and which are not.
- Highlight high-cost irreversible decisions that deserve extra scrutiny. These include: database choices, service boundary definitions, communication protocol commitments, data model structures, and cloud provider lock-in.
- Call out decisions with high reversibility cost explicitly and recommend whether they need more evidence before committing.
- Include a substantive "What's Working Well" section. First-principles review is not just criticism — identify architectural choices that are genuinely well-reasoned.

---

## Edge Cases

Handle these situations:

- **Empty invocation, no codebase context:** Offer all four modes with brief descriptions:
  - `/fp:design` — Evaluate product and system design decisions
  - `/fp:architecture` — Evaluate system structure and boundaries (this mode)
  - `/fp:plan` — Build an execution plan from first principles
  - `/fp:code` — Review implementation quality and patterns

- **Empty invocation, codebase available:** Explore the codebase structure to infer the architecture. Summarize what you found and ask the user what aspect of the architecture to focus on.

- **Single-file project:** Suggest `/fp:design` or `/fp:code` as likely better fits. State why: architecture review focuses on system-level structure, which requires multiple components. Proceed with architecture review if the user confirms.

- **Input looks like a feature design rather than system architecture:** Suggest `/fp:design` and explain the difference: design review evaluates problem-solution fit, while architecture review evaluates system structure. Proceed if the user confirms.

- **Monolith vs. distributed system:** Adapt the review scope:
  - For monoliths: focus on module boundaries, dependency direction, internal API surfaces, data access patterns, and whether the monolith is well-structured or a big ball of mud.
  - For distributed systems: focus on service boundaries, inter-service communication, data ownership, failure propagation, and operational complexity justification.
