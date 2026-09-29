# Reconstruction Methodology Reference

Deep procedural reference for `/fpt-reconstruct`. Loaded on demand (Level 3).

---

## Validation Checklist — Six Tests for First Principles

Before a validated assumption from the Challenge Log becomes a first principle, it must pass all six:

### 1. Falsifiability Test
**Question**: Can this be proven false by an experiment or observation?
**Pass criteria**: The principle makes a prediction that can be tested. If it cannot be tested, it is a belief — not a principle.
**Example pass**: "Aluminum-lithium alloy costs ~$X/kg on commodity markets" — verifiable.
**Example fail**: "Good design is intuitive" — not testable without defining both terms operationally.

### 2. Termination Test
**Question**: When I ask "Why?" of this, does the answer require a domain axiom (physical law, mathematical identity, empirical constant)?
**Pass criteria**: The chain terminates at something that cannot be further decomposed within the relevant domain.
**Example pass**: "Centrifugal force separates particles by density differential" — physics.
**Example fail**: "Customers prefer simple interfaces" — an observation, not an axiom. Why? Leads to more assumptions.

### 3. Independence Test
**Question**: Can this be stated without reference to a specific existing solution, product, or industry practice?
**Pass criteria**: A principle that requires naming a product is a feature description, not a foundation.
**Example pass**: "Human fingers can make precise gestural inputs on calibrated surfaces"
**Example fail**: "The iPhone's multi-touch is the best input method" — product-specific.

### 4. Consensus Test
**Question**: Would a domain expert accept this as foundational — even if they disagreed with your conclusions drawn from it?
**Pass criteria**: Experts may disagree on what to *build* from a truth, but not on the truth itself.
**Example pass**: "Rocket propellant (LOX + RP-1) costs ~$150K per launch" — any rocket engineer would agree.
**Example fail**: "Reusable rockets are better than expendable ones" — an engineering judgment, not a truth.

### 5. Evidence Test (negative: "Because I Said So")
**Question**: Can I support this with evidence — not convention or authority?
**Pass criteria**: The support chain reaches data, not "that's just how it is."
**Example pass**: "The Smeaton coefficient is 0.0033" — re-derived experimentally by the Wrights.
**Example fail**: "Enterprise software requires a sales team" — convention, not evidence.

### 6. Reality Test
**Question**: Has acting on conclusions from this principle produced outcomes consistent with prediction?
**Pass criteria**: If the principle has been applied before, outcomes match. If untested, it is a hypothesis.
**Note**: New principles may not have this test available yet. Mark them as hypotheses and include in the validation plan.

---

## Reconstruction Patterns

Five patterns drawn from the canonical case studies. Each optimizes for a different problem structure.

### Pattern 1: Material Decomposition
**Best for**: Cost problems, pricing problems, "it's too expensive"

Price raw materials/inputs of the output. Compare to product cost. The gap is process/overhead/convention.

1. List every physical component
2. Price each at commodity/raw-material level
3. Sum → physical floor
4. Compare to actual cost → gap = opportunity space
5. For each gap layer, ask: "Is this necessary?"

**Canonical example**: SpaceX — rocket materials ≈ 2% of launch cost.

### Pattern 2: Functional Decomposition
**Best for**: Design problems, UX problems, "how should this work?"

Define functions the user needs. Ignore current form. Find optimal implementation per function, then recombine.

1. List every function the user actually needs
2. For each: "What is the optimal delivery, ignoring how it's done today?"
3. Look for dedicated hardware/process replaceable by shared/software solutions
4. Recombine — check for synergies and conflicts
5. Form follows from functions

**Canonical example**: iPhone — the user needs to communicate, access information, and be entertained. A fixed keyboard wastes 30-40% of device face.

### Pattern 3: Empirical Re-derivation
**Best for**: Performance problems, "theory doesn't match practice"

When results don't match predictions, challenge the inherited data the predictions rest on. Re-derive independently.

1. Identify the failing prediction/theory
2. List every constant and "known" value it depends on
3. For each: when was this last independently verified?
4. Re-measure the inherited values
5. Reconstruct with corrected values

**Canonical example**: Wright Brothers — Smeaton coefficient (0.005) was wrong; correct value (0.0033) fixed everything downstream.

### Pattern 4: Physical Principle Substitution
**Best for**: Mechanism problems, fundamentally limited approaches

The current solution uses Physical Principle A. Identify alternative principles that achieve the same function without Principle A's inherent limitations.

1. Identify the physical principle in current solution
2. Identify its *inherent* limitation (physics, not engineering)
3. Survey other physical principles that achieve the same function
4. Evaluate each for inherent limitation profile
5. Select the principle with the best limitation profile

**Canonical example**: Dyson — filtration inherently degrades as filter loads. Cyclone separation (centrifugal force) achieves the same function with no inherent degradation mode.

### Pattern 5: Cross-Domain Recombination
**Best for**: Innovation problems, "nothing in this field works"

Decompose solutions from multiple fields into components. Recombine across fields into novel configurations.

1. Define the function needed
2. Identify 3–5 solutions from *different fields* that achieve aspects of it
3. Decompose each into independent components
4. Mix components across solutions
5. Evaluate novel combinations against principles

**Canonical example**: John Boyd's snowmobile — motorboat + tank + bicycle → snowmobile.

---

## The Wrong-Set Risk

From Commoncog: the most dangerous failure is not reasoning from false premises — it is reasoning from an *incomplete* set of true premises. Logically valid chain, practically wrong conclusion.

**Mitigation strategies**:
- **Cross-domain scan**: For each principle, "What domain would challenge this?"
- **Adversarial review**: Have someone else review the foundation
- **Historical check**: What did prior first-principles analyses miss?

---

## Principle Set Completeness Check

Before reconstruction, confirm coverage:

- [ ] Physics/mechanics of the problem covered?
- [ ] Economics covered?
- [ ] Human/user dimension covered?
- [ ] Is there a principle excluded because it was inconvenient?
- [ ] Would someone with a different background identify a missing principle?
