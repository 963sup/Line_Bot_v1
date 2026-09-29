# Decomposition Methodology Reference

Deep procedural reference for `/fpt-decompose`. Loaded on demand (Level 3).

---

## The Function-Form Distinction

The most common failure in problem definition is describing the problem in terms of the existing solution rather than the underlying need.

| Trap (Form-Based) | Reframe (Function-Based) |
|-------------------|--------------------------|
| "How do I make a better vacuum bag?" | "How do I separate particles from air?" |
| "How do I reduce rocket launch costs?" | "What does it physically cost to get mass to orbit?" |
| "How do I improve the phone keyboard?" | "What input modality is optimal for a handheld device?" |
| "How do I speed up this API endpoint?" | "What is the minimum work required to serve this response?" |
| "How do I improve our hiring process?" | "What do we actually need to know about a candidate to make a good decision?" |
| "How do I make meetings more productive?" | "What decisions need to be made and what information is needed to make them?" |

The function-based reframe strips inherited form and opens the solution space. If every reframe attempt still names a specific technology, product, or process, it hasn't reached the function yet.

---

## Three Categories of Assumptions

### Inherited Assumptions
Beliefs absorbed from industry, education, or team culture without personal verification. Most dangerous because they feel like facts.

Examples:
- "Battery packs will always cost $600/kWh" (Tesla challenged this)
- "You need a physical keyboard for serious mobile communication" (Apple challenged this)
- "The Smeaton coefficient is 0.005" (Wright Brothers challenged this)

### Experiential Assumptions
Beliefs formed from your own past experience that may not transfer to the current context. Dangerous because they feel earned.

Examples:
- "We tried X three years ago and it didn't work" (conditions may have changed)
- "Our customers won't pay for that" (different segment, different era)
- "This technology isn't mature enough" (maturity curves are nonlinear)

### Structural Assumptions
Beliefs about what is possible given current constraints. Often conflate genuine physical limits with process/convention limits.

Examples:
- "We can't ship faster because of our deployment pipeline" (pipeline is convention, not physics)
- "This requires three teams to approve" (approval chain is policy, not law)
- "We need dedicated servers for this workload" (may be a billing assumption, not a compute one)

---

## Assumption Elicitation Prompts

When the user has listed fewer than 10 assumptions, use these to surface more:

1. **The newcomer test**: "If someone with no industry experience looked at this problem, what would they question that you take for granted?"

2. **The time-travel test**: "If you were solving this problem 10 years ago, what would be different? What changed — and did your assumptions update?"

3. **The competitor test**: "What does your competitor assume that you also assume? What if you're both wrong?"

4. **The cost test**: "For every cost you've accepted, what are the raw materials/inputs worth? Where is the markup?"

5. **The constraint test**: "For every 'can't do X,' is that physics or policy? A law of nature or a convention?"

6. **The audience test**: "What does your user actually need vs. what are you giving them because that's how it's always been done?"

---

## Socratic Questioning — Six Types

Apply in order to each assumption:

| # | Type | Question Pattern | Purpose |
|---|------|-----------------|---------|
| 1 | Clarification | "What exactly do you mean by this? Can you define it precisely?" | Expose vagueness hiding behind confident language |
| 2 | Probe Assumptions | "What are you assuming here? What could you assume instead?" | Surface the belief beneath the belief |
| 3 | Probe Evidence | "What evidence supports this? How was it collected? Is it current?" | Separate data from narrative |
| 4 | Alternative Perspectives | "Who would disagree? What would they say? What do they know that you don't?" | Break confirmation bias |
| 5 | Consequences | "If this is true, what follows? If false, what changes?" | Test whether the assumption actually matters |
| 6 | Question the Question | "Why did you frame this assumption this way? Are you asking the right question?" | Catch framing errors |

---

## Five Whys — Termination Rules

Ask "Why?" repeatedly. Stop when you reach one of three terminations:

| Termination | What It Means | Action |
|-------------|---------------|--------|
| **Falsifiable fact** — the answer is a domain axiom (physical law, mathematical identity, empirical constant) | You've reached a first principle candidate | Mark VALIDATED, state the principle |
| **"Because I said so" / "it just is" / "that's how it works"** | You've landed on an unsupported assumption | Mark INVALIDATED, note what replaces it |
| **"I don't know"** | You've found a research gap | Mark NEEDS RESEARCH, flag for investigation before proceeding |

### Example — Rocket Cost (SpaceX)

1. "Why do rockets cost $65M?" → Because that's what manufacturers charge.
2. "Why do they charge that?" → Because of the complex manufacturing process.
3. "Why is the process so complex?" → Because aerospace components are specialized.
4. "Why are they specialized?" → Because rockets need specific materials: aluminum, titanium, carbon fiber.
5. "Why don't we buy those materials directly?" → **There is no reason.** Commodity cost ≈ 2% of sticker price.

Chain terminated at a falsifiable fact (commodity prices can be looked up). The gap between material cost and launch price is process/convention, not physics.

---

## Common Challenges in Step 3

| Challenge | What It Looks Like | How to Handle |
|-----------|--------------------|---------------|
| Premature termination | "That's just how it works" accepted as final answer | Apply one more round of Five Whys |
| Confirmation bias | Only finding evidence that supports existing belief | Force alternative perspective question (#4) |
| Authority anchoring | "The expert says so" treated as proof | Ask for the evidence behind the authority |
| Scope avoidance | "That's outside my control" used to skip a challenge | Note as constraint, still challenge if it's actually immovable |
| Emotional resistance | Assumption tied to identity or past decisions | Acknowledge discomfort; flag as potentially highest-value |
