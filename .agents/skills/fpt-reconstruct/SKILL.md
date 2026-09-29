---
name: fpt-reconstruct
description: >
  Use after /fpt-decompose to validate first principles and reconstruct a solution.
  Triggers on "reconstruct", "build from principles", "what should I build?",
  "solution from first principles". Do NOT use without a completed decomposition.
  Output: principles foundation + reconstructed solution + decision brief.
context: fork
argument-hint: [project-name]
---

## Purpose

Runs Steps 4–5 of first-principles thinking: validate the surviving assumptions from `/fpt-decompose` against six rigorous tests to confirm they are genuine first principles, then reconstruct a solution from only those validated truths — with full traceability from every solution element back to its founding principle.

Produces three artifacts in the existing project directory created by `/fpt-decompose`.

## Inputs

- **Required**: A project name that matches an existing directory at `first-principals-thinking/projects/{project-name}/`
- That directory must contain the three decomposition artifacts:
  - `01-problem-statement.md`
  - `02-assumptions-map.md`
  - `03-challenge-log.md`

## Steps

### 1. Load and Verify Decomposition Artifacts

Look up the project directory at `first-principals-thinking/projects/{project-name}/`.

If the user didn't provide a project name, list available projects under `first-principals-thinking/projects/` and ask which one to continue.

Read all three artifacts. Confirm:
- Problem statement defines a function, not a form
- Challenge log has summary statistics
- At least one assumption is marked VALIDATED

If the challenge log shows zero validated assumptions, the decomposition needs more work — return the user to `/fpt-decompose`.

### 2. Validate First Principles (Six Tests)

For each VALIDATED assumption from the challenge log, apply all six validation tests from `references/reconstruction-guide.md` § Validation Checklist:

| Test | Question |
|------|----------|
| Falsifiability | Can this be proven false by experiment or observation? |
| Termination | Does "Why?" terminate at a domain axiom, not another assumption? |
| Independence | Can it be stated without naming a specific existing solution? |
| Consensus | Would a domain expert accept this as foundational? |
| Evidence | Can it be supported with evidence, not convention? |
| Reality | Has acting on it produced outcomes consistent with prediction? |

Promote principles that pass all six. Reject or demote those that fail. Document each decision.

Fill out the First Principles Foundation using `assets/first-principles-foundation-template.md`

Check principle set completeness: physics/mechanics + economics + human/user dimensions all covered?

Save to `first-principals-thinking/projects/{project-name}/04-first-principles-foundation.md`

### 3. Reconstruct the Solution

Using only the validated principles, build a new solution:

**Phase A — Define the solution space**: Map constraints (what principles prohibit) and opportunities (what principles enable). Identify the theoretical ceiling and floor.

**Phase B — Generate candidates**: Create 2–3 solution candidates. Each must address the functional need from the problem statement, respect every validated principle, and not import structural elements from the old solution unless a principle justifies them.

Use the reconstruction patterns from `references/reconstruction-guide.md` § Reconstruction Patterns:
- Material Decomposition (cost problems)
- Functional Decomposition (design problems)
- Empirical Re-derivation (performance problems)
- Physical Principle Substitution (mechanism problems)
- Cross-Domain Recombination (innovation problems)

**Phase C — Evaluate candidates**: Score each against the functional need, principle compliance, feasibility, and testability.

Fill out the Reconstructed Solution using `assets/reconstructed-solution-template.md`

Every solution element must have a Principle Traceability entry. If an element cannot trace back to a principle, it is either an unexamined assumption (challenge it), a pragmatic concession (acknowledge it), or a creative leap (add to validation plan).

Save to `first-principals-thinking/projects/{project-name}/05-reconstructed-solution.md`

### 4. Produce Decision Brief

Synthesize the full cycle into a concise decision brief:
- Problem (one paragraph)
- Key principles discovered (bulleted)
- Recommended solution with rationale
- What this changes from conventional approach
- Risks and validation plan
- Recommended next action

Use `assets/decision-brief-template.md`

Save to `first-principals-thinking/projects/{project-name}/06-decision-brief.md`

Return the decision brief inline to the main conversation, plus:
- **Next step**: "Run `/fpt-evaluate {project-name}` to score this cycle and log feedback."

## Output Format

Three artifacts added to the existing project directory:
1. `04-first-principles-foundation.md`
2. `05-reconstructed-solution.md`
3. `06-decision-brief.md`

Plus the decision brief returned inline with next-step guidance.

## Error Handling

- If project directory doesn't exist: list available projects, or instruct user to run `/fpt-decompose` first
- If decomposition artifacts are missing: list what's missing, instruct user to complete `/fpt-decompose`
- If zero assumptions passed validation: return user to `/fpt-decompose` Step 3 for more rigorous challenging
- If user drifts back toward the old solution during reconstruction: flag it — ask which principle justifies that element
- If principle set completeness check fails (dimension missing): pause reconstruction, identify the gap, add it to the foundation

## Do Not

- Do not begin without a valid project directory and completed decomposition artifacts
- Do not accept a solution element that cannot trace to a principle — make unexamined imports visible
- Do not generate only one solution candidate — the reconstruction phase benefits from comparison
- Do not skip the decision brief — it is the primary deliverable for stakeholders
- Do not evaluate the cycle's effectiveness — that is `/fpt-evaluate`'s job
