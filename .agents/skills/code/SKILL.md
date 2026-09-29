---
name: code
description: >
  Use when reviewing code for first-principles alignment — structural and
  logical issues, not style. Triggers on: "review this code from first principles",
  "first principles code review", or when the user wants deeper-than-surface
  code analysis.
argument-hint: "[file path, PR number, or description]"
---

# First Principles Code Review

You are performing a First Principles Code Review. Evaluate whether code structure and logic follow from what the code actually needs to do, or from assumptions, convention, and accidental complexity. This is NOT a style review — focus on structural and logical issues.

---

## Input Gathering

Determine the review target from `$ARGUMENTS`:

- **File path** — If `$ARGUMENTS` contains a file path, read it with the Read tool. Then read surrounding context: imports, callers, tests, and related files in the same directory.
- **PR number** — If `$ARGUMENTS` contains a PR number (e.g., `#42` or `42`), fetch the diff with `gh pr diff <number>`. Read the full files for any significantly changed file — diffs alone lack context.
- **Description** — If `$ARGUMENTS` is a description (e.g., "the auth middleware" or "payment processing"), use Glob and Grep to locate relevant files. Read the top candidates.
- **No arguments** — If `$ARGUMENTS` is empty and there is no conversational context, ask: "What code would you like me to review? Provide a file path, PR number, or describe what to look at."
- **No arguments, but codebase context exists** — If you have codebase context from the conversation, ask what to review and suggest recently changed files (check `git log --oneline -10`).

After identifying the target files, gather surrounding context before proceeding:

- Read imports and dependencies to understand what the code relies on.
- Find callers with Grep to understand how the code is used.
- Check for related tests to understand expected behavior.
- Read adjacent files in the same module to understand the code's role in the system.

Do NOT review code in isolation. Understanding what the code connects to is essential for first-principles analysis.

---

## Execute the Five-Phase Framework

Read and follow [the framework](../shared/framework.md). Apply each phase with the following code-review emphasis:

### Phase 1: Decompose

Infer the problem from the code itself. What is this code actually trying to do? What are its real responsibilities? Do not trust comments, function names, or documentation — read what the code does. If the code does something different from what its name suggests, that is a finding.

Identify the irreducible constraints: What inputs must it handle? What guarantees must it provide? What failure modes must it address?

### Phase 2: Surface Assumptions

Identify code-level assumptions:

- Magic numbers and hardcoded values — what do they assume about the environment?
- Implicit contracts between components — what does the caller assume about the callee, and vice versa?
- Assumed execution order — does correctness depend on things happening in a specific sequence?
- Hidden coupling via shared state — globals, singletons, module-level variables, shared databases.
- Assumptions about input validity or format — is validation present, or is valid input assumed?
- Error handling assumptions — what failure modes are ignored or swallowed?

For each assumption, assess the cost if it turns out to be wrong.

### Phase 3: Reason Upward

Given what this code needs to do (Phase 1) and the assumptions it makes (Phase 2), derive what the simplest correct structure would look like. Compare against what is actually built.

Identify accidental complexity — complexity that is not demanded by the problem. Ask: does this indirection, abstraction, or pattern serve a real constraint, or was it added by convention, habit, or premature generalization?

Identify missing structure — places where the code is too simple for what it needs to handle. Missing error paths, absent validation, and implicit contracts that should be explicit.

### Phase 4: Anchor Against Principles

Draw primarily from these principles (see [principle-catalog](../shared/principle-catalog.md)):

- **Separation of Concerns / Single Responsibility** — Does each unit have one reason to change?
- **Information Hiding** — Can internals change without breaking consumers?
- **Coupling & Cohesion** — Do things that change together live together? Do unrelated things depend on each other?
- **Fail-Fast / Explicit Errors** — If input is invalid, when does the system find out?
- **Simplicity (YAGNI/KISS)** — What happens if you remove this? Does anything break that matters today?

Other principles from the catalog may apply. Select by relevance to what you found in Phases 1-3, not by sequence. If a principle is not relevant, skip it.

### Phase 5: Produce Assessment

Use the **Code Review Report** template from [output-templates](../shared/output-templates.md). Populate every section with evidence from the prior phases. Every finding must trace to a specific assumption, constraint, or principle.

---

## Output Focus

Follow these rules for the final output:

- Provide concrete code-level findings with `file:line` references. Do not make vague observations.
- Include a short code snippet for each finding where it aids understanding. Show just enough context — not full functions.
- Do NOT report style nits: formatting, naming conventions, comment style, import ordering. This review is about structural and logical alignment.
- Every recommendation must include a specific `file:location` reference and state what to change and why.
- Include a "What's Working Well" section. Well-structured code that aligns with first principles deserves explicit recognition.

---

## Edge Cases

Handle these situations:

- **Empty invocation, no context at all** — Offer all four modes (`/fp:design`, `/fp:architecture`, `/fp:plan`, `/fp:code`) with a one-line description of each. Ask which the user wants.
- **Empty invocation, codebase available** — Ask what code to review. Run `git log --oneline -10` and suggest recently changed files as starting points.
- **Massive codebase, no specific target** — Ask the user to narrow scope. Suggest options: a specific module, recent changes, or a particular concern they have.
- **Input looks like a design doc or architecture description** — Suggest `/fp:design` or `/fp:architecture` instead. State why: "This describes system structure rather than implementation — `/fp:architecture` would give you a more useful analysis." Proceed with code review only if the user confirms.
- **Generated code or config files** — Note that generated code has different first-principles considerations. The generator (template, schema, codegen tool) is the real subject. Review the generation logic if accessible; otherwise, flag assumptions baked into the generated output.
- **Test files** — Review test design through first principles. Are tests verifying behavior or implementation details? Are they coupled to internals that will break on refactor? Do they test the right level of abstraction? Apply the same framework — tests are code with their own responsibilities and assumptions.
