# Insights

Insights owns Repository Pulse query composition and metric presentation contracts. Issue and WBS remain authoritative for their source facts and metric extraction; their scope owners remain authoritative for current access.

- Periods use epoch milliseconds with inclusive from/exclusive to. Default is the preceding seven days; presentation timezone is Asia/Taipei.
- Issue creation uses persisted creation timestamps. Close/reopen counts include recorded events only; legacy rows and unstructured events are reported as coverage metadata. Current work status is independent of OPEN/CLOSED.
- WBS reports current open proposals, published Baseline and structural draft comparison. Without a formal Baseline, differences are null rather than a fabricated empty approved scope. The Project-scoped owner query consumes current Project access; it does not make Insights a WBS or Project owner.
- Every source query rechecks current active qualification and its scope owner's access. Source authorization/not-found failures fail closed; infrastructure failure returns an explicit unavailable source while preserving other authorized results.
- Observed time is not a cross-owner atomic snapshot; each owner query has its own transaction. No writable metric store, cache or derived completion rate exists.

Runtime consumers are `pnpm insights:run` and the authenticated Repository page `/{login}/{repository}/insights` through read-only `GET /api/repository-insights`. Web resolves the current Repository locator through Repository's contract and supplies the verified active User to the existing Pulse query. The page defaults to seven days, supports thirty days, and separates period activity from current Issue/WBS state. No additional persistence or completion rate is introduced.

That Repository Pulse remains an R1 transfer-era consumer while durable Repository WBS data is verified. The current Project WBS metrics output is the canonical source for Project-scoped consumers; wiring a Project Insights screen is a separate consumer change and is not claimed by this authority update.
