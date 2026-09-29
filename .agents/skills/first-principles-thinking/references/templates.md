# First Principles Thinking — Extended Templates

This reference provides reusable worksheets and expanded templates for each phase of first-principles analysis. Load this file when the user requests detailed worksheets, printable templates, or step-by-step worksheets for a specific problem.

---

## Template A: Assumption Audit Worksheet

Use this to surface hidden defaults before decomposition.

```
Problem Statement: ________________________________________________

Assumption                          Source              T/U     Emotional Load
----------------------------------- ------------------- ------- ----------------
1. _______________________________ ___________________ ___     High / Low
2. _______________________________ ___________________ ___     High / Low
3. _______________________________ ___________________ ___     High / Low
4. _______________________________ ___________________ ___     High / Low
5. _______________________________ ___________________ ___     High / Low

Source legend: Industry / Organization / Market / Personal / Unknown
```

**Emotional Load:** High-emotion assumptions ("our team will resist this") often mask untested beliefs. Flag them for explicit testing.

---

## Template B: Atomic Decomposition Matrix

For each untested (U) assumption, decompose across all six dimensions until reaching a measurable or physical truth.

| Dimension | Question for This Assumption | Atomic Fact | How to Verify |
|-----------|------------------------------|-------------|---------------|
| Physical  | What material/energy/space/time limits apply? | | Measurement / Literature |
| Economic  | What are real unit, marginal, and fixed costs? | | Quote / Calculation |
| Informational | What data exists, who has it, how fresh is it? | | System audit |
| Human     | What will people actually do vs. what they say? | | Observation / Interview |
| Organizational | What incentives and boundaries exist? | | Org chart / Contract review |
| Regulatory | What is legally or safety-wise mandatory? | | Regulation text / Legal review |

**Stop rule:** An atomic fact must be verifiable by an independent observer with access to the same data.

---

## Template C: Facts vs. Inertia Ledger

| # | Statement | Immutable Fact? | Movable Inertia? | Evidence |
|---|-----------|-----------------|------------------|----------|
| 1 | | [ ] Yes  [ ] No | [ ] Yes  [ ] No | |
| 2 | | [ ] Yes  [ ] No | [ ] Yes  [ ] No | |
| 3 | | [ ] Yes  [ ] No | [ ] Yes  [ ] No | |

**Conflict resolution:** If a statement is both, split it. For example, "We must comply with GDPR" is immutable; "We store data in the EU because of GDPR" is inertia (GDPR does not mandate EU storage, only equivalent protection).

---

## Template D: Flow-Based Reconstruction Canvas

Draw or list the minimum viable system using only immutable facts.

### Non-Negotiable Objective (measurable)
- Metric: ________________
- Target: ________________
- Deadline: ________________

### Flow Maps

**Material Flow**
```
[Input] → [Process A] → [Process B] → [Output]
```

**Capital Flow**
```
[Budget Source] → [Cost Center 1] → [Cost Center 2] → [ROI]
```

**Information Flow**
```
[Data Source] → [Transform] → [Decision Point] → [Action]
```

**Responsibility Flow**
```
[Initiator] → [Confirmer] → [Executor] → [Accountable]
```

**Risk Flow**
```
[Vulnerability] → [Detection] → [Response] → [Recovery]
```

### Build vs. Buy vs. Eliminate

| Module | Build | Buy | Eliminate | Rationale |
|--------|-------|-----|-----------|-----------|
| | [ ] | [ ] | [ ] | |
| | [ ] | [ ] | [ ] | |

---

## Template E: Validation Card

Use one card per critical hypothesis.

```
Hypothesis: _______________________________________________________

If true, the following should happen: _____________________________
__________________________________________________________________

Minimum experiment: _______________________________________________
__________________________________________________________________

Cost of experiment: ________  Time to result: ________

Failure signal (what would disprove it): __________________________
__________________________________________________________________

Pivot action if disproven: ________________________________________
__________________________________________________________________

Success threshold: ________________________________________________
__________________________________________________________________

Owner: ________________  Due date: ________________
```

**Priority rule:** Run the cheapest experiment that can kill the most expensive assumption first.

---

## Template F: First-Principles Diagnostic Checklist

Before finalizing any reconstructed design, verify:

- [ ] Every remaining constraint is physically, legally, or mathematically necessary.
- [ ] No element exists solely because "that's how we did it before."
- [ ] The objective is stated as a measurable outcome, not a feature list.
- [ ] At least one industry default assumption has been explicitly challenged.
- [ ] The smallest value-delivering loop has been identified.
- [ ] Each module has a build/buy/eliminate decision.
- [ ] The riskiest assumption has a defined experiment with a failure signal.
- [ ] A time-bound pivot action exists for each critical hypothesis.

---

## Quick Reference: Six Dimensions of Constraints

| Dimension | Typical Traps | Useful Prompts |
|-----------|---------------|----------------|
| **Physical** | Ignoring geometry, thermal, or bandwidth limits | "What would break if we 10x'd the scale?" |
| **Economic** | Accepting market price as cost floor | "What is the commodity value of the inputs?" |
| **Informational** | Assuming data is available, clean, and timely | "Who actually has this data, and how old is it?" |
| **Human** | Believing stated preferences over revealed behavior | "What do people actually do when no one is watching?" |
| **Organizational** | Designing for formal structure instead of real incentives | "Who loses power or budget if this changes?" |
| **Regulatory** | Over-complying or under-complying due to hearsay | "What is the exact clause, and who enforces it?" |
