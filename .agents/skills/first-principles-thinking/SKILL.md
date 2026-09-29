---
name: first-principles-thinking
description: This skill should be used when the user wants to analyze a complex problem from the ground up, break down inherited assumptions, reconstruct a solution from fundamental truths, or apply first-principles reasoning. Triggered by phrases like "第一性原理", "从零开始思考", "拆解问题", "打破惯性", "根本问题", "底层逻辑", "复杂问题分析", "系统重构", "为什么一定要这样", "本质是什么", "默认假设", "创新方案", "突破常规", "根本原因分析", "反常识思考", or when the user asks to rethink an existing system, process, or decision from fundamentals.
---

# First Principles Thinking

## Overview

Guide the user through a structured first-principles analysis to deconstruct complex problems down to irreducible truths, distinguish real constraints from historical inertia, and reconstruct novel solutions from the ground up. This skill treats first-principles thinking not as a philosophy slogan but as an executable, repeatable workflow.

## When to Use This Skill

- The user asks "为什么一定要..." or challenges an established norm.
- The user wants to redesign a system, process, or product from scratch.
- The user faces a problem where conventional solutions feel expensive, slow, or stale.
- The user needs to identify which constraints are physical/legal/economic necessities and which are organizational habits.
- The user wants to generate breakthrough ideas rather than incremental improvements.

## Workflow Decision Tree

Before starting the full workflow, determine if first-principles thinking is appropriate:

**Yes, proceed** if:
- The problem is novel, complex, or poorly served by existing solutions.
- The user suspects inherited assumptions are hiding better alternatives.
- The stakes are high enough to justify the cognitive cost of deep decomposition.

**No, use analogy or best-practice instead** if:
- The problem is routine and well-solved by industry standards (e.g., choosing a toothpaste brand).
- Speed matters more than optimality.
- The user lacks domain depth to verify atomic facts.

## Phase 1: Surface and Challenge Assumptions

**Goal:** Make all hidden defaults explicit.

1. Ask the user to state the problem or goal in one sentence.
2. List every implicit assumption surrounding that problem. Include:
   - Industry conventions ("this is how it's always done")
   - Organizational habits ("our process requires 3 approvals")
   - Market pricing ("batteries cost $600/kWh")
   - Structural defaults ("a rocket must be single-use")
   - Cognitive shortcuts ("users won't accept change")
3. For each assumption, tag it as either:
   - **T = Testable**: Can be empirically verified or falsified.
   - **U = Untested**: Inherited from tradition, analogy, or authority.
4. Flag all **U** assumptions as candidates for decomposition.

> **Tip:** Use the prompt: *"If you had to explain this process to someone from 500 years ago, which steps would sound absurd?"*

## Phase 2: Decompose to Atomic Facts

**Goal:** Break the problem into irreducible truths across six constraint dimensions.

For each flagged assumption, decompose until reaching facts that cannot be disputed without denying physics, math, or law.

| Dimension | What to Ask | Example (Rocket Cost) |
|-----------|-------------|----------------------|
| **Physical** | What are the material, energy, spatial, or temporal limits? | Aluminum + titanium + fuel + manufacturing labor |
| **Economic** | What are the real unit, marginal, and fixed costs? | Raw materials ~2% of market price; rest is labor, markup, risk premium |
| **Informational** | What data exists, what is its latency/noise, who can access it? | Telemetry, supply chain quotes, test data |
| **Human** | What will people actually do, understand, and tolerate? | Engineers can build in-house if given budget and mandate |
| **Organizational** | What are the real incentive structures and responsibility boundaries? | Cost-plus contracts discourage cost reduction |
| **Regulatory / Safety** | What is legally or safety-wise non-negotiable? | FAA launch licenses, structural safety margins |

**Stop rule:** Stop decomposing when a statement can be verified by measurement, physical law, or binding regulation. If still debatable, decompose further.

## Phase 3: Separate Facts from Inertia

**Goal:** Distinguish immovable constraints from movable history.

Create a two-column table:

| **Immutable Facts** (must design around) | **Movable Inertia** (can be challenged) |
|------------------------------------------|-----------------------------------------|
| Physical laws, material properties | "We have always used vendor X" |
| Legal requirements | "Our org chart has 8 departments" |
| Hard cost floors | "The budget cycle is annual" |
| Genuine user disabilities/limits | "Users need 20 form fields" |

**Decision rule:**
- If removing the item violates physics, law, or math → **Immutable**.
- If removing the item merely causes organizational discomfort → **Inertia**.

## Phase 4: Reconstruct from Fundamentals

**Goal:** Build a new solution architecture using only immutable facts as scaffolding.

1. State the system's **non-negotiable objective** in measurable terms (cost, speed, accuracy, throughput, reliability).
2. Ignore all legacy structures. Ask: *"If we started today with no existing code, contracts, or teams, what is the minimum viable system that satisfies the objective given only the immutable facts?"*
3. Design around flows, not organs:
   - **Material flow:** What physical objects move, and where?
   - **Capital flow:** Where does money enter, sit, and exit?
   - **Information flow:** What signals must travel, to whom, by when?
   - **Responsibility flow:** Who decides, who confirms, who is liable?
   - **Risk flow:** Where can it fail, how is it detected, who recovers it?
4. For each module, ask:
   - Must this be built in-house?
   - Can this be purchased?
   - Does this need to exist at all?

## Phase 5: Validate with Experiments

**Goal:** Turn reconstructed hypotheses into tested knowledge.

For each critical design choice, define:

| Element | Description |
|---------|-------------|
| **Hypothesis** | The specific claim being tested (e.g., "Users can complete onboarding in 30 seconds with 3 fields") |
| **Minimum Experiment** | The cheapest, fastest way to generate disconfirming evidence |
| **Failure Signal** | What observation would prove the hypothesis wrong? |
| **Pivot Action** | What to do if the signal appears? |
| **Success Threshold** | What metric must be met to accept the hypothesis? |

Run experiments in order of **cheapest failure first**. Do not build the full system before testing the riskiest assumption.

## Core Question Template

Use these eight questions as a rapid diagnostic. Answer each in writing before committing to a solution.

1. What is the **ultimate problem** we are actually solving?
2. Which constraints are **physically, legally, or mathematically unchangeable**?
3. Which constraints are **merely habits, history, or organizational scar tissue**?
4. If we started from zero today, **what would we build**?
5. What is the **smallest closed loop** that delivers value?
6. Where do the **largest costs, delays, and risks** originate?
7. Which modules **must be custom**, which can be **bought**, and which are **unnecessary**?
8. What is the **fastest experiment** to prove or disprove this design?

## Common Traps

- **Mistaking opinion for fact:** "Users won't like it" is not a fact until tested.
- **Decomposing forever:** Stop when components are verifiable; do not atomize into philosophy.
- **Ignoring reassembly:** Deconstruction without reconstruction is just criticism.
- **Neglecting execution cost:** A perfect first-principles design that takes 10 years to build may still be wrong.
- **Rejecting all analogy:** Some conventions exist because they are genuinely optimal; only challenge what fails the fact/inertia test.

## Output Format

When guiding a user through this skill, structure the output as follows:

```markdown
## First-Principles Analysis: [Problem Name]

### 1. Assumption Audit
[List all assumptions with T/U tags]

### 2. Atomic Decomposition
[Table across six dimensions]

### 3. Facts vs. Inertia
[Two-column table]

### 4. Reconstructed Design
[Minimum viable architecture based on flows]

### 5. Validation Plan
[Hypothesis → Experiment → Failure Signal → Pivot]

### 6. Core Answers
[Answers to the 8 core questions]
```

## References

- `references/templates.md` — Extended templates and worksheets for each phase.
- `references/case-studies.md` — Annotated examples (SpaceX, Tesla, supply-chain redesign, software architecture).
