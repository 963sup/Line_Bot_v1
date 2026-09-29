---
name: fpt-evaluate
description: >
  Use after /fpt-reconstruct to evaluate a first-principles cycle. Triggers on
  "evaluate the decomposition", "how did my FPT go", "rate the analysis", "eval".
  Do NOT use for evaluating things unrelated to a first-principles cycle.
  Output: self-eval + human-eval records + updated eval-log.json.
argument-hint: [project-name]
---

## Purpose

Evaluates a completed first-principles thinking cycle across two phases: a structured self-evaluation that scores each artifact against its quality criteria, and a human evaluation that captures implementation outcomes and narrative feedback. Both phases produce artifacts in the project directory and append a structured entry to `first-principals-thinking/evals/eval-log.json` — a running JSON record that enables pattern analysis across projects over time.

This skill is what turns individual FPT cycles into a learning system.

## Inputs

- **Required**: A project name that matches an existing directory at `first-principals-thinking/projects/{project-name}/`
- That directory should contain the six artifacts from `/fpt-decompose` and `/fpt-reconstruct`:
  - `01-problem-statement.md` through `06-decision-brief.md`
- The existing `first-principals-thinking/evals/eval-log.json`
- Optionally: the user's stated assessment of how implementation went (for human-eval phase)

## Steps

### 1. Load Artifacts and Determine Eval Phase

Look up the project directory at `first-principals-thinking/projects/{project-name}/`.

If the user didn't provide a project name, list available projects under `first-principals-thinking/projects/` and ask which one to evaluate.

Read the artifact chain. Determine which evaluation phase to run:

- **If the cycle just completed** (no implementation yet): run Phase 1 (Self-Eval) only
- **If the user has implementation feedback**: run Phase 2 (Human-Eval), optionally updating a prior self-eval
- **If both are needed**: run Phase 1 first, then Phase 2

### 2. Phase 1 — Self-Evaluation

Score each artifact against its quality criteria. Use the eval criteria from `references/evaluation-guide.md` § Artifact Quality Criteria.

**Eval 1: Problem Statement** (5 criteria, /5)
- States a function, not a form
- Does not name a specific existing solution
- Success criteria are measurable
- "Why insufficient" cites observable failures
- Stakeholders identified

**Eval 2: Assumptions Map** (5 criteria, /5)
- At least 10 assumptions listed
- Each has a source
- Categories assigned (Inherited/Experiential/Structural)
- Confidence levels honest
- Unverified marked explicitly

**Eval 3: Challenge Log** (5 criteria, /5)
- Every assumption has a challenge entry
- Narratives show the questioning chain
- Termination point identified for each
- No "validated" without falsifiable fact
- Research gaps listed

**Eval 4: First Principles Foundation** (5 criteria, /5)
- Every validated assumption tested against all 6 validation criteria
- Principles stated without naming specific solutions
- Rejected candidates documented
- Principle relationships mapped
- Completeness check performed

**Eval 5: Reconstructed Solution** (5 criteria, /5)
- Addresses functional need from problem statement
- Every element has principle traceability
- Deviations documented with justification
- Inherited elements acknowledged
- Validation plan with testable hypotheses

Compute total: __/25. Identify weakest and strongest artifacts. State the primary gap.

Save self-eval to `first-principals-thinking/projects/{project-name}/07-self-eval.md` using `assets/self-eval-template.md`

### 3. Phase 2 — Human Evaluation

Walk the user through structured feedback capture:

**Implementation status**: Not implemented / Partially / Fully / Abandoned / Modified significantly

**Outcome**: Did the solution achieve the functional need? Fully / Partially / No / Too early

**Principle validity**: Did the first principles turn out correct? All / Mostly / Some wrong / Fundamentally flawed

**Six quality dimensions** (1–5 scale each, /30 total):
1. Decomposition thoroughness
2. Challenge rigor
3. Principle validity
4. Reconstruction quality
5. Practical usefulness
6. Time investment justified?

**Narrative feedback**: What worked, what fell short, process changes, artifact feedback

**Lessons learned**: Extract 2–3 key takeaways

Save human-eval to `first-principals-thinking/projects/{project-name}/08-human-eval.md` using `assets/human-eval-template.md`

### 4. Update the Eval Log

Read `first-principals-thinking/evals/eval-log.json`. Append a new entry (or update an existing one for this project) with all self-eval and human-eval data. Follow the schema documented in `assets/eval-log-schema.json`.

Generate the next `eval_id` by incrementing from the last entry (format: `fpt-NNN`).

Populate the `artifact_paths` object with the actual paths inside the project directory.

Write the updated JSON back to `first-principals-thinking/evals/eval-log.json`.

### 5. Pattern Analysis (If 3+ Entries Exist)

If the eval log has 3 or more entries, run a brief pattern analysis:

- Which artifacts are consistently weakest?
- Are any `primary_gap` values recurring?
- What's the trend on `time_justified` ratings?
- Which decomposition patterns perform best in the user's context?
- Flag any "False Confidence" pattern: high self-eval but low human-eval

Report findings inline.

## Output Format

Two artifacts added to the project directory:
1. `07-self-eval.md` (Phase 1)
2. `08-human-eval.md` (Phase 2, if applicable)

Plus:
3. Updated `first-principals-thinking/evals/eval-log.json`
4. Inline summary with scores, key findings, and pattern analysis (if 3+ log entries)

## Error Handling

- If project directory doesn't exist: list available projects, or instruct user to start with `/fpt-decompose`
- If artifacts are incomplete: list what's missing, indicate which skill needs to run first
- If `first-principals-thinking/evals/eval-log.json` doesn't exist: create it with the schema from `assets/eval-log-schema.json`
- If user can't provide human-eval yet: save self-eval only, note that human-eval is pending in the log entry
- If self-eval scores and human-eval scores diverge significantly (>8 point gap): flag "False Confidence" pattern

## Do Not

- Do not skip self-eval and jump to human-eval — self-eval establishes the internal consistency baseline
- Do not fabricate human-eval data — if the user hasn't implemented yet, leave human-eval fields null
- Do not overwrite existing eval log entries — append new ones or update the matching project entry
- Do not provide generic feedback — every eval finding should reference a specific artifact and criterion
- Do not evaluate the quality of the first-principles methodology itself — evaluate *this specific application* of it
