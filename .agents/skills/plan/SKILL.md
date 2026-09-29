---
name: plan
description: >
  Use when planning a new project or feature using first-principles thinking.
  Triggers on: "plan this feature", "design from scratch", "greenfield",
  "what should we build", or when starting something new and wanting
  a principled foundation.
argument-hint: "[problem statement or description]"
---

# First Principles Planning

You are performing First Principles Planning. Your goal is to build a principled foundation for a new project or feature by decomposing the problem before proposing any solution. Resist the urge to jump to technology choices or architecture — the problem must be understood first.

---

## Step 1: Gather Input

Determine the problem statement from what is available:

- If `$ARGUMENTS` contains a description, use it as the initial problem statement.
- If you are in an existing codebase, explore it for context: read key files, identify established patterns, understand what already exists and what constraints the codebase imposes.
- If the problem statement is clear enough to proceed, proceed. If not, ask **at most 3 targeted questions** to understand:
  1. The **real problem** — what outcome is needed, not what solution is imagined.
  2. The **users and actors** — who benefits, who interacts, who is affected.
  3. The **hard constraints** — deadlines, compliance, team size, budget, technical boundaries that cannot be negotiated.
- Do NOT ask about technology choices or solution approaches. Those emerge from reasoning, not from requirements gathering.
- If the user volunteers technology preferences (e.g., "I was thinking React and PostgreSQL"), note them as **assumptions to evaluate in Phase 2**, not as given constraints. Acknowledge that you heard them, but do not treat them as decisions.

---

## Step 2: Execute the Five-Phase Framework

Read and follow [the framework](../shared/framework.md). Execute all five phases in sequence. The phase emphasis for planning mode is as follows:

### Phase 1 — Decompose (Star Phase)

This is the most important phase for planning. Invest heavily here. Deep decomposition must happen before any solution is discussed.

- Strip the problem to its core. What is the actual problem? Who needs this and why?
- Push past surface-level descriptions. "We need a dashboard" becomes "we need visibility into X metric to make Y decision within Z timeframe." "We need an API" becomes "system A needs to send data D to system B under constraint C."
- Identify the irreducible constraints. Separate physics from preferences, regulations from conventions, measured needs from guesses.
- Produce: a precise problem statement, an actor map, a constraint list, and a clean-slate sketch of what a solution could look like with zero legacy.

### Phase 2 — Surface Assumptions

Challenge premature solution assumptions ruthlessly.

- If the user proposed technology choices, evaluate each one: is this chosen because it fits the problem, or because it is familiar? Name the alternative that would fit if familiarity were removed.
- Challenge the team size assumption, the timeline assumption, the deployment assumption.
- For each assumption surfaced, estimate the cost if it turns out to be wrong. A wrong database choice costs months of migration. A wrong API boundary costs years of workarounds.
- Produce: an assumption inventory with source (default, convention, preference) and cost-if-wrong rating.

### Phase 3 — Reason Upward

Build a skeleton design from fundamentals. Do not reference existing architecture — derive structure from the problem.

- Given the real problem and real constraints from Phases 1-2, what is the natural shape of the solution?
- Identify the key components and how they relate. Where do concerns genuinely separate? What must change together, and what can change independently?
- Follow the data: where is it created, transformed, read, archived? Data flow often reveals the right boundaries.
- Start with the simplest structure that satisfies every irreducible constraint. Add complexity only when a specific constraint demands it.
- Produce: a derived structure with justification for every boundary and component.

### Phase 4 — Anchor Against Principles

Validate the skeleton against established engineering principles.

- Reference: [principle-catalog](../shared/principle-catalog.md)
- Select principles by relevance to this problem. A data-flow problem engages different principles than a user-interaction problem.
- For planning, pay special attention to: Separation of Concerns, Reversibility, Simplicity (YAGNI/KISS), and Coupling & Cohesion.
- Flag tensions between principles. When simplicity conflicts with extensibility, state the tension and reason about which takes priority for this specific problem.
- Produce: a principle alignment map showing which principles apply and how the proposed skeleton aligns or misaligns.

### Phase 5 — Produce Assessment

Generate the Planning Report using the template from [output-templates](../shared/output-templates.md).

- Use the "Planning Report" template specifically.
- Ensure every finding traces back to evidence from prior phases.
- Order key decisions by irreversibility — the most costly to change comes first.
- Each decision must include 2-3 options with concrete trade-offs.
- Open questions must be genuine unknowns that block progress, not rhetorical questions.

---

## Step 3: Shape the Output

The output is a principled foundation, NOT a complete design. Ensure it meets these criteria:

- Key decisions are ordered by irreversibility (most costly to change first).
- Each decision includes 2-3 concrete options with trade-offs stated plainly.
- Open questions are genuine unknowns — things you cannot resolve without more information or experimentation.
- The output helps the team make informed decisions. It does not dictate solutions. Present reasoning and options; let the team choose.
- If the problem warrants it, include a "Suggested Solution Shape" that follows naturally from the constraints and decisions — but frame it as a suggestion derived from fundamentals, not a prescription.

---

## Edge Cases

Handle these situations explicitly:

- **Empty invocation with no context:** Do not attempt to plan nothing. Offer all four modes with brief descriptions: `/fp:plan` for greenfield planning, `/fp:design` for design review, `/fp:architecture` for architecture review, `/fp:code` for code review. Ask the user what they would like to work on.
- **Vague problem statement:** Ask clarifying questions (up to 3, per Step 1). Do not guess at the problem. A plan built on a misunderstood problem is worse than no plan.
- **Problem is too large:** Help decompose the problem into sub-problems first. Identify the sub-problems, suggest an order based on dependencies and risk, then plan the first sub-problem in full. Offer to plan subsequent sub-problems in follow-up invocations.
- **Extending an existing system:** Acknowledge existing system constraints as irreducible — they are the reality you are building within. Focus the planning effort on the new parts. Reference the existing architecture where it constrains decisions, but do not re-evaluate the entire system.
- **User seems to want a review of something existing:** If the user describes an existing design, architecture, or codebase and asks you to evaluate it, suggest `/fp:design` or `/fp:architecture` instead. Explain that planning mode is for building foundations for new work, while review modes evaluate existing work against first principles.
