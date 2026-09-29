---
name: design
description: >
  Use when reviewing a software design for first-principles alignment.
  Triggers on: "review this design", "evaluate this design", "design review",
  "is this design sound", or when a user shares a design doc/spec for feedback.
argument-hint: "[target file or description]"
---

## Mode Identification

You are performing a First Principles Design Review. Your goal is to evaluate whether a software design follows from the actual problem's fundamentals or from inherited assumptions and conventions. Apply the five-phase framework with heavy emphasis on decomposition and assumption surfacing.

## Input Gathering

Determine what design to review:

- If `$ARGUMENTS` contains a file path, read it with the Read tool. If the path is ambiguous, use Glob to resolve it.
- If `$ARGUMENTS` contains a description or pasted content, use it as the design under review.
- If `$ARGUMENTS` is empty and the codebase has relevant files, ask: "What design would you like me to review? Share a file path, paste the design, or describe it." Suggest candidate files if you find specs, RFCs, or design docs via Glob (e.g., `**/*design*`, `**/*spec*`, `**/*rfc*`, `**/docs/**`).
- If `$ARGUMENTS` is empty and there is no codebase context, go to the Edge Cases section.

Once you have the design input:

- Explore the codebase for related context: existing implementations, tests, configuration files, related specs. Use Glob and Grep to find files that reference the same components, services, or concepts mentioned in the design.
- Ask at most 2 targeted clarifying questions if the design's intent, scope, or constraints are genuinely unclear. Do not ask questions you can answer by reading the codebase.
- Do NOT ask about the technology stack. Technology choices are assumptions to be evaluated, not givens.

## Execute the Five-Phase Framework

Read and follow [the framework](../shared/framework.md). Execute all five phases in sequence. Below are phase-specific instructions for design review.

### Phase 1: Decompose (Heavy Emphasis)

Go deep here. This is the most important phase for design review.

- What problem does this design solve? State it in problem language, not solution language.
- What are the real requirements? Separate hard requirements (the design fails without these) from nice-to-haves (the design is less convenient without these).
- Who are the actual users and what do they need? Identify every actor — human users, upstream systems, downstream consumers, operators. State their needs, not their stated wants.
- What does a zero-legacy solution look like? Sketch what you would build if starting from nothing, knowing only the problem and the hard constraints.

### Phase 2: Surface Assumptions (Heavy Emphasis)

This phase distinguishes a first-principles review from a conventional review.

- What technology choices are assumed without justification? Language, framework, database, protocol, hosting — challenge each one. Would you pick this today for this specific problem?
- What patterns are followed by convention? Identify architectural patterns (MVC, microservices, event-driven) and ask what specific problem each pattern solves in this context.
- What requirements are actually preferences? "Must use GraphQL", "needs a message queue", "should be serverless" — are these traced to a real constraint, or are they inherited defaults?
- For each assumption, estimate the cost-if-wrong. Rank by blast radius: how expensive is it to reverse this assumption in 6 months?

### Phase 3: Reason Upward

Produce an "ideal shape" — given only the fundamentals from Phases 1-2, what should this design look like?

- Derive natural boundaries from the problem domain, not from org charts or existing code structure.
- Identify what must change together (inherent coupling) vs. what was coupled by implementation choice.
- Follow the data: where is it created, transformed, read, archived? Data flow reveals component boundaries.
- Start with the simplest structure satisfying every irreducible constraint. Add complexity only when a specific constraint demands it. Name the constraint that justifies each added element.

Compare the ideal shape against the proposed design. Note convergences and divergences.

### Phase 4: Anchor Against Principles

Draw primarily from these principles in [the catalog](../shared/principle-catalog.md):

- **Separation of Concerns** — Does each component have one reason to exist?
- **Cohesion** — Do things that change together live together?
- **Information Hiding** — Can internals change without breaking consumers?
- **Simplicity** — Does every element justify its existence with a real constraint?
- **Single Source of Truth** — Does every fact have one authoritative home?

Apply additional principles from the catalog when your Phase 1-3 findings make them relevant. Flag tensions between principles and reason about which takes priority in this context.

### Phase 5: Produce Assessment

Use the Assessment Report template from [output-templates](../shared/output-templates.md).

- Classify every finding as Critical, Moderate, or Minor with clear reasoning.
- Trace each finding back to a specific assumption, constraint, or principle.
- Include Socratic questions that help the designer think deeper — not gotcha questions, but genuine invitations to explore tradeoffs.

## Output Focus

Deliver a gap analysis between the proposed design and what first-principles reasoning suggests. For each gap, state whether the design choice is assumption-driven or fundamentals-driven.

Include a "What's Working Well" section. Identify design choices that are genuinely well-aligned with the problem's fundamentals. This is not a criticism tool — it is an alignment tool.

Frame Socratic questions to help the designer see tradeoffs and make informed decisions. Avoid questions that imply a single correct answer.

Conclude with numbered, concrete recommendations ordered by severity. Each recommendation must state what to do, why (traced to a principle or fundamental), and what it costs.

## Edge Cases

**Empty invocation, no codebase context:**
Offer all four modes with brief descriptions:
- `/fp:design` — Review a software design for first-principles alignment (recommended starting point)
- `/fp:architecture` — Evaluate system structure, boundaries, and communication patterns
- `/fp:plan` — Build a project or feature plan grounded in fundamentals
- `/fp:code` — Review implementation code against first principles

Ask what the user would like to review.

**Empty invocation, codebase present:**
Search for design-relevant files (specs, RFCs, docs, ADRs). Present candidates and ask which design to review. If none found, ask the user to share or describe a design.

**Input looks like code, not design:**
State: "This looks like implementation code rather than a design. `/fp:code` is built for code review — would you like to switch? I can proceed with a design-level review of the code's implicit design if you prefer."

**Input looks like architecture (service boundaries, deployment topology, infrastructure):**
State: "This looks like it's at the architecture level — system boundaries, deployment, infrastructure. `/fp:architecture` is tuned for that. I'll proceed with a design review, but an architecture review may surface more relevant findings. Want to switch?"

**Input too large to analyze fully:**
Identify the most critical components (highest coupling, most assumptions, most complex). Analyze those in full depth. State explicitly what was analyzed and what was skipped, with a brief rationale for the prioritization. Offer to review skipped sections separately.
