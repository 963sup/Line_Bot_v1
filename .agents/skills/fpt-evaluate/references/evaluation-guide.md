# Evaluation Methodology Reference

Deep procedural reference for `/fpt-evaluate`. Loaded on demand (Level 3).

---

## Artifact Quality Criteria

### Eval 1: Problem Statement

| # | Criterion | Pass if... | Fail if... |
|---|-----------|-----------|-----------|
| 1 | States a function, not a form | Describes what the user needs to achieve without naming a specific mechanism | Names a product, technology, or existing process |
| 2 | Does not name a specific existing solution | Problem could be solved multiple radically different ways | Only one solution path is imaginable from the statement |
| 3 | Success criteria are measurable | An observer could verify completion without subjective judgment | "Better" / "improved" / "good" without metrics |
| 4 | "Why insufficient" cites observable failures | Specific incidents, metrics, or outcomes cited | Vague dissatisfaction ("it doesn't feel right") |
| 5 | Stakeholders identified | Named roles with their specific needs | Generic "users" without differentiation |

### Eval 2: Assumptions Map

| # | Criterion | Pass if... | Fail if... |
|---|-----------|-----------|-----------|
| 1 | At least 10 assumptions | 10+ entries in the map | Fewer than 10 |
| 2 | Each has a source | Every row has a specific origin (who/what said this) | "I just know" or blank source |
| 3 | Categories assigned | Every row marked Inherited / Experiential / Structural | Missing or inconsistent categories |
| 4 | Confidence levels honest | "High" only where personally verified; unverified = "Low" or "Med" | Everything marked "High" without verification |
| 5 | Unverified marked explicitly | Clear distinction between tested and untested beliefs | Verified and unverified assumptions blurred |

### Eval 3: Challenge Log

| # | Criterion | Pass if... | Fail if... |
|---|-----------|-----------|-----------|
| 1 | Every assumption has an entry | Count matches assumptions map | Assumptions skipped without explanation |
| 2 | Narratives show the work | Questioning chain visible (multiple exchanges) | Conclusion stated without showing the reasoning |
| 3 | Termination point identified | Each entry marked: falsifiable fact / "because I said so" / "I don't know" | Ambiguous or missing termination |
| 4 | No false validation | Every VALIDATED entry has a stated falsifiable fact | VALIDATED without evidence |
| 5 | Research gaps listed | "I don't know" terminations are captured with what needs to be researched | Gaps hand-waved or omitted |

### Eval 4: First Principles Foundation

| # | Criterion | Pass if... | Fail if... |
|---|-----------|-----------|-----------|
| 1 | Six validation tests applied | All six checkboxes addressed for each principle | Tests skipped or only partially applied |
| 2 | Solution-independent | Principles stated without naming any product or process | Principle references a specific implementation |
| 3 | Rejected candidates documented | Failed candidates listed with which test they failed | Only passing candidates shown |
| 4 | Relationships mapped | Independent, constraining, and contradictory relationships identified | Principles treated as isolated list |
| 5 | Completeness check done | Physics, economics, and human dimensions confirmed covered | Dimensions missing without acknowledgment |

### Eval 5: Reconstructed Solution

| # | Criterion | Pass if... | Fail if... |
|---|-----------|-----------|-----------|
| 1 | Addresses functional need | Solution maps back to the problem statement's functional need | Solution addresses a different or narrower problem |
| 2 | Principle traceability | Every solution element has a principle entry in the matrix | Elements present with no principle connection |
| 3 | Deviations documented | Each departure from convention has a justifying principle | Deviations present but unjustified |
| 4 | Inherited elements acknowledged | Elements kept from old approach are listed with rationale | Old-approach elements smuggled in without noting |
| 5 | Validation plan present | Testable hypotheses with methods and timelines | "We'll see if it works" or no plan |

---

## The Four Diagnostic Patterns

| Pattern | Self-Eval | Human-Eval | Interpretation | Action |
|---------|-----------|------------|----------------|--------|
| **Working** | >20/25 | >24/30 | Process sound; genuine value delivered | Continue using this approach |
| **Over-engineered** | >20/25 | Low `time_justified` | FPT too heavy for this problem | Use analogy next time for similar problems |
| **Superficial** | <15/25 | <18/30 | Decomposition wasn't rigorous | Invest more in Steps 2-3 |
| **False Confidence** | >20/25 | <18/30 | Self-eval miscalibrated | Focus on challenge *content*, not process compliance |

"False Confidence" is the most dangerous — the process feels rigorous (checkboxes checked, narratives written) but doesn't produce valid principles.

---

## Eval Prompts for Reviewing Others' Artifacts

### Problem Statement
"Does this describe what needs to be achieved, or a specific solution already decided on? Can I imagine multiple radically different solutions from this statement?"

### Assumptions Map
"Are there beliefs so obvious the author probably didn't think to write them down? What would a domain newcomer question that isn't listed?"

### Challenge Log
"Did the author follow the questioning chain, or write a conclusion and backfill? Is any challenge suspiciously short for a deeply held belief?"

### First Principles Foundation
"Could I hand these principles to someone in a different industry and have them understand what's true about this problem space?"

### Reconstructed Solution
"If I trace each element back through the chain, does it reach a principle — or does it connect to an assumption that was never challenged?"

---

## Cross-Cycle Pattern Analysis

When 3+ eval entries exist, look for:

| Signal | Meaning |
|--------|---------|
| Same artifact consistently weakest | Systematic blind spot in that step |
| Recurring `primary_gap` | Same mistake being repeated — add a checklist item |
| `time_justified` trending down | Applying FPT to problems that don't warrant it |
| High self-eval + low human-eval | Self-assessment too generous — recalibrate |
| Specific pattern underperforming | That decomposition pattern may not suit the domain |
| `principles_correct` frequently "some_were_wrong" | Step 3 challenge process isn't rigorous enough |
