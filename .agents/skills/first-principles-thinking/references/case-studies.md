# First Principles Thinking — Annotated Case Studies

This reference provides detailed, annotated examples of first-principles reasoning in action. Load this file when the user asks for concrete examples, parallels to their own problem, or historical illustrations of the methodology.

---

## Case 1: SpaceX — Why Are Rockets Expensive?

### Problem
Reduce the cost of orbital launch by orders of magnitude.

### Phase 1: Assumption Audit

| Assumption | Source | T/U |
|------------|--------|-----|
| Rockets cost hundreds of millions of dollars | Market pricing | U |
| Rockets can only be used once | Industry convention | U |
| Building rockets requires thousands of subcontractors | Industry structure | U |
| Safety requires accepting high cost | Risk culture | U |

### Phase 2: Atomic Decomposition

**Physical:** A rocket is aluminum, titanium, copper, carbon fiber, and propellant. The propellant (liquid oxygen + RP-1) costs approximately 0.3% of a typical launch price.

**Economic:** Raw material commodity value is ~2% of market launch price. The remaining 98% is labor, overhead, subcontractor margins, risk premiums, and single-use depreciation.

**Informational:** Telemetry and manufacturing data were available but siloed across contractors.

**Human:** Engineers were capable of vertical integration if given authority and budget.

**Organizational:** Cost-plus contracts incentivized higher spending (profit = cost × fixed percentage).

**Regulatory:** FAA launch licenses and safety margins are mandatory; the rest is negotiable.

### Phase 3: Facts vs. Inertia

| Immutable Fact | Movable Inertia |
|----------------|-----------------|
| Rocket mass must overcome Earth's gravity | Rockets must be single-use |
| Materials have finite strength | Must use 3+ tiers of subcontractors |
| Propellant chemistry is fixed | Must accept cost-plus contracts |
| FAA licensing is required | Safety requires infinite redundancy |

### Phase 4: Reconstructed Design

**Objective:** Reduce marginal cost per launch by 10–100x.

**Key insight:** If propellant is 0.3% and materials are 2%, the cost is not in the physics; it is in the organizational and manufacturing overhead.

**Reconstruction:**
- **Vertical integration:** Build engines and structures in-house to capture subcontractor margins.
- **Reusability:** If airplanes were discarded after every flight, air travel would be unaffordable. Design the first stage to land and refly.
- **Iterative testing:** Use actual flight tests (with acceptance of controlled failures) instead of infinite ground simulation.
- **Flat organization:** Reduce management layers between design and manufacturing.

### Phase 5: Validation

| Hypothesis | Experiment | Failure Signal | Pivot |
|------------|-----------|----------------|-------|
| First stage can land vertically | Grasshopper test flights | Repeated crash failures | Switch to parachute recovery |
| In-house engines are cheaper/better | Merlin engine production | Higher defect rate than vendor | Revert to vendor with stricter terms |
| Reusable boosters survive re-entry | Falcon 9 recovery attempts | Structural failure on re-entry | Thicker heat shield or limit re-use count |

### Outcome
Falcon 9 became the first orbital-class reusable rocket. By 2023, SpaceX had reduced launch costs by roughly an order of magnitude compared to legacy providers.

---

## Case 2: Tesla Battery Pack — Why Are Batteries Expensive?

### Problem
Electric vehicle battery packs were priced at ~$600/kWh in 2010, making EVs uncompetitive with internal combustion.

### Phase 1: Assumption Audit

| Assumption | Source | T/U |
|------------|--------|-----|
| Battery prices decline slowly (~5% per year) | Historical trend | U |
| Battery packs must be purchased from Asian suppliers | Market structure | U |
| Cobalt is essential and scarce | Chemistry convention | U |

### Phase 2: Atomic Decomposition

**Physical:** A battery cell is cobalt, nickel, aluminum, carbon (anode), lithium salts, separator polymer, and steel casing.

**Economic:** Commodity value of raw materials was ~$80/kWh. The $600/kWh price was mostly processing, assembly, markup, and low volume.

**Informational:** Cell chemistry data was available but locked behind supplier NDAs.

**Human:** Consumers cared about range and price, not cell chemistry brand.

**Organizational:** Auto OEMs had no battery manufacturing expertise; they outsourced by habit.

**Regulatory:** Safety standards for thermal runaway were strict but did not mandate a specific chemistry.

### Phase 3: Facts vs. Inertia

| Immutable Fact | Movable Inertia |
|----------------|-----------------|
| Energy density has physical limits | Must use cylindrical 18650 cells |
| Lithium-ion chemistry requires care | Must buy from Panasonic/Samsung/LG |
| Thermal runaway must be prevented | Cobalt is irreplaceable |
| Cost floor = raw materials + energy + labor | Prices fall only 5% per year |

### Phase 4: Reconstructed Design

**Objective:** Achieve <$100/kWh at scale.

**Key insight:** The 10x gap between raw materials ($80) and market price ($600) was a manufacturing and scale problem, not a physics problem.

**Reconstruction:**
- **Gigafactory:** Build the world's largest battery factory to capture economies of scale.
- **Vertical integration:** Produce cells in-house; own the entire value chain from raw materials to pack assembly.
- **Chemistry innovation:** Reduce cobalt content (NCA → NCM → LFP for standard range vehicles).
- **Pack-level integration:** Design the battery pack as a structural element of the vehicle, saving mass and parts.

### Phase 5: Validation

| Hypothesis | Experiment | Failure Signal | Pivot |
|------------|-----------|----------------|-------|
| In-house cells match supplier quality | Pilot production line | Higher defect rate | Delay vertical integration, renegotiate supplier contract |
| Cobalt reduction maintains cycle life | Lab cell testing | Rapid capacity fade | Slow cobalt reduction; invest in recycling |
| Structural pack saves cost and weight | Bending/stiffness tests | Insufficient crash protection | Revert to non-structural pack |

### Outcome
Tesla's battery costs fell below $100/kWh by 2023, enabling mass-market EV pricing.

---

## Case 3: Software Architecture — Monolith vs. Microservices

### Problem
A team debates whether to decompose a monolithic application into microservices.

### Phase 1: Assumption Audit

| Assumption | Source | T/U |
|------------|--------|-----|
| Microservices are the modern standard | Industry fashion | U |
| Monoliths cannot scale | Conference talks | U |
| Teams must be organized around services | Spotify model | U |
| Each service needs its own database | Best-practice blog | U |

### Phase 2: Atomic Decomposition

**Physical:** A server has CPU, memory, disk I/O, and network bandwidth. These are finite and measurable.

**Economic:** Microservices add network latency, operational overhead, and deployment complexity. These have real engineering-hour costs.

**Informational:** Service boundaries create data consistency challenges (distributed transactions, eventual consistency).

**Human:** Developers must understand distributed debugging, circuit breakers, and deployment matrices. Not all teams have this expertise.

**Organizational:** Conway's Law means service boundaries will mirror team boundaries, creating coordination cost.

**Regulatory:** Data residency and audit trails become harder when data is scattered across services.

### Phase 3: Facts vs. Inertia

| Immutable Fact | Movable Inertia |
|----------------|-----------------|
| Network calls are slower than in-process calls | Monoliths are inherently unscalable |
| Distributed state is harder to reason about | Must have >10 services to be "modern" |
| Team cognition is bounded (7±2 modules) | Each service needs its own repo and DB |
| Operational complexity grows with service count | Must use Kubernetes from day one |

### Phase 4: Reconstructed Design

**Objective:** Maximize development velocity while meeting latency and throughput requirements.

**Key insight:** The problem is not "monolith vs. microservices"; it is "how do we manage complexity given our team's size and our system's load profile?"

**Reconstruction:**
- Start with a modular monolith (clear internal boundaries, single deployable unit).
- Extract a service only when:
  1. A module has a fundamentally different scaling profile (CPU-bound vs. I/O-bound).
  2. A module is owned by a distinct team with independent release cadence.
  3. The cost of independent deployment is lower than the cost of coordinated deployment.
- Use a service boundary checklist before extraction.

### Phase 5: Validation

| Hypothesis | Experiment | Failure Signal | Pivot |
|------------|-----------|----------------|-------|
| Modular monolith supports current load | Load testing | Latency spikes under 2x traffic | Extract highest-contention module first |
| Team can manage 3 services without SRE | Incident count / MTTR | P1 incidents increase >50% | Merge services or hire platform team |
| Independent deployment speeds releases | Cycle time measurement | No change in release frequency | Revert to monolith with feature flags |

### Outcome
Many teams discover that a well-structured modular monolith outperforms a premature microservices architecture, saving 12–24 months of operational complexity.

---

## Case 4: Supply Chain Redesign — Cross-Border Manufacturing

### Problem
A hardware company sources components from 12 countries, faces 6-month lead times, and carries $50M in inventory.

### Phase 1: Assumption Audit

| Assumption | Source | T/U |
|------------|--------|-----|
| Global sourcing minimizes cost | Finance model | T |
| Long lead times are unavoidable for custom parts | Supplier claims | U |
| Safety stock must be 90 days | Planning software default | U |
| Each component needs 3+ suppliers for resilience | Risk management handbook | U |

### Phase 2: Atomic Decomposition

**Physical:** Ships travel at ~20 knots. Customs processing takes 2–14 days. Air freight is 10–20x more expensive per kg.

**Economic:** Inventory carrying cost is ~25% of inventory value per year. $50M inventory = $12.5M/year in carrying cost alone.

**Informational:** Demand forecasts are accurate ±30% at 6-month horizon; ±10% at 2-week horizon.

**Human:** Procurement teams are measured on unit cost, not total landed cost or inventory cost.

**Organizational:** Sourcing decisions are made by procurement; inventory consequences are borne by operations.

**Regulatory:** Tariffs and origin rules are fixed in the short term.

### Phase 3: Facts vs. Inertia

| Immutable Fact | Movable Inertia |
|----------------|-----------------|
| Ships are slow; planes are fast and expensive | Must source from lowest-wage country |
| Forecast accuracy degrades with horizon | Safety stock must be 90 days |
| Tariffs apply based on origin | Need 3+ suppliers per part |
| Inventory has real carrying cost | Procurement optimizes unit price |

### Phase 4: Reconstructed Design

**Objective:** Reduce total landed cost (unit + freight + duty + inventory carrying + obsolescence) by 30%.

**Key insight:** The company optimizes unit cost, but the largest costs are inventory carrying and obsolescence driven by forecast error. The system is optimizing the wrong metric.

**Reconstruction:**
- **Metric shift:** Measure procurement by total landed cost, not unit price.
- **Regional buffering:** Keep generic components in regional hubs; customize late (postponement).
- **Forecast injection:** Share sell-through data with top 20 suppliers to improve their planning.
- **Supplier consolidation:** For stable, high-volume parts, reduce to 1–2 suppliers with volume commitments and data sharing in exchange for flexibility.

### Phase 5: Validation

| Hypothesis | Experiment | Failure Signal | Pivot |
|------------|-----------|----------------|-------|
| Regional hubs reduce lead time by 50% | Pilot with one product line | Inventory shifts but lead time unchanged | Switch to air freight for that line |
| Supplier accepts data-sharing for flexibility | Negotiate with top 3 suppliers | Supplier demands price premium >5% | Keep dual sourcing for those parts |
| Total-landed-cost metric changes behavior | Run procurement team on new KPI for one quarter | No change in sourcing decisions | Add inventory cost to procurement P&L |

---

## Pattern Summary Across Cases

| Pattern | SpaceX | Tesla | Software | Supply Chain |
|---------|--------|-------|----------|--------------|
| **Hidden metric distortion** | Cost-plus contracts | OEM outsourcing habit | Fashion-driven architecture | Unit-cost procurement KPI |
| **Largest cost not where expected** | Not materials | Not raw materials | Not hardware | Not unit price |
| **Key reconstruction** | Vertical integration + reusability | Gigafactory scale + chemistry | Modular monolith + conditional extraction | Total landed cost + postponement |
| **Validation style** | Flight test with accepted failure | Pilot production line | Load test + cycle time | Pilot product line + new KPI |

---

## Applying Cases to User Problems

When the user presents a problem, use this mapping:

- **If the problem involves physical goods with high market price:** → Reference SpaceX/Tesla (decompose to material and labor costs).
- **If the problem involves software architecture or team structure:** → Reference Software case (challenge fashion, measure complexity cost).
- **If the problem involves processes, flows, or multi-party coordination:** → Reference Supply Chain case (optimize the right metric, redesign flows).
- **If the problem involves AI/Agent systems:** → Decompose to information flow, inference cost, latency, and human oversight boundaries.
