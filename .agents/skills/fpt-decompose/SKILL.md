---
name: fpt-decompose
description: >
  Use when user needs to break down a problem from first principles. Triggers on
  "first principles", "decompose this", "challenge my assumptions", "break this down".
  Do NOT use for quick brainstorming or simple Q&A.
  Output: project folder with problem statement + assumptions map + challenge log.
context: fork
argument-hint: [problem-statement-or-description]
---

## Purpose

Entry point for a first-principles thinking cycle. Runs Steps 1–3: define the problem as a function (not a form), enumerate every assumption, and systematically challenge each until only validated truths remain.

Creates a dedicated project directory and produces three chained artifacts that become the input for `/fpt-reconstruct`.

## Inputs

- A problem statement, description, or situation the user wants to decompose
- Optionally: domain context, prior attempts, constraints the user is aware of

## Steps

### 0. Set Up the Project

This is the first skill in the chain — it creates the workspace for this FPT cycle.

1. Ask the user for a short **project name** (kebab-case, e.g. `rethink-deploy-pipeline`). If the user provided a problem description as an argument, suggest a name derived from it.

2. Create the project directory:
   ```
   first-principals-thinking/projects/{project-name}/
   ```

3. Confirm the directory was created. All artifacts for this cycle will live here.

### 1. Define the Problem (Function, Not Form)

Ask the user to describe what they are trying to achieve. Reframe it as a **functional need** — strip away any reference to a specific existing solution.

- If the user defines the problem in terms of an existing solution ("how do I make a better X?"), reframe: "What is the functional outcome X gives you? Let's start there instead."
- Fill out the Problem Statement using the template at `assets/problem-statement-template.md`
- Confirm: the statement describes a function, not a form. Success criteria are measurable and implementation-independent.

Save to `first-principals-thinking/projects/{project-name}/01-problem-statement.md`

### 2. List All Assumptions

Guide the user through surfacing every belief they carry about this problem. Categorize each as:

- **Inherited** — absorbed from industry/education without personal verification
- **Experiential** — formed from past experience that may not transfer
- **Structural** — beliefs about what is possible (which may conflate physics with convention)

Use the elicitation prompts from `references/decomposition-guide.md` § Assumption Elicitation if the user stalls below 10 assumptions. Every problem carries at least 10 unexamined beliefs.

Fill out the Assumptions Map using `assets/assumptions-map-template.md`

Save to `first-principals-thinking/projects/{project-name}/02-assumptions-map.md`

### 3. Challenge Each Assumption

For every assumption in the map, apply structured interrogation:

**Socratic Questioning** — six types in order: clarification → probe assumptions → probe evidence → alternative perspectives → consequences → question the question. See `references/decomposition-guide.md` § Socratic Questioning for the full framework.

**Five Whys** — ask "Why?" repeatedly until reaching either:
- A **falsifiable fact** (first principle candidate) — the chain ends at a domain axiom
- A **"because I said so"** (unsupported assumption) — discard or replace
- An **"I don't know"** (research gap) — flag for investigation

Fill out the Challenge Log using `assets/challenge-log-template.md`

Mark each assumption as: VALIDATED / INVALIDATED / NEEDS RESEARCH / PARTIALLY VALID

Save to `first-principals-thinking/projects/{project-name}/03-challenge-log.md`

### 4. Verify and Hand Off

Before finishing:
- Every assumption from the map has a challenge entry
- Challenge narratives show the questioning chain (not just conclusions)
- Summary statistics are filled in
- All three artifacts are saved in the project directory

Return a summary to the main conversation:
- Project directory: `first-principals-thinking/projects/{project-name}/`
- Problem defined
- N assumptions listed, M validated as first-principle candidates, K invalidated, J need research
- **Next step**: "Run `/fpt-reconstruct {project-name}` to validate your principles and build a solution."

## Output Format

A project directory at `first-principals-thinking/projects/{project-name}/` containing:
1. `01-problem-statement.md`
2. `02-assumptions-map.md`
3. `03-challenge-log.md`

Plus an inline summary with next-step guidance.

## Error Handling

- If the user cannot articulate the problem: use the Function-Form distinction table from `references/decomposition-guide.md` to help reframe
- If fewer than 10 assumptions surface: apply the six elicitation prompts from references
- If Five Whys terminates at "I don't know": mark as NEEDS RESEARCH, do not force a false principle
- If the user resists challenging a belief: note the resistance in the challenge log, flag it as potentially high-value to revisit
- If the project directory already exists: ask whether to continue/overwrite or create a new versioned directory (e.g. `{project-name}-v2`)

## Do Not

- Do not skip Step 0 (project setup) — every cycle needs its own directory
- Do not skip Step 2 (assumptions) and jump to challenging
- Do not accept "that's just how it works" as a valid termination of a challenge chain
- Do not mark an assumption as VALIDATED without a clear falsifiable fact supporting it
- Do not begin reconstruction — that is `/fpt-reconstruct`'s job
- Do not generate the assumptions for the user — elicit them through questioning
