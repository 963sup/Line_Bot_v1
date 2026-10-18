# Insights

Insights owns Repository Pulse query composition and metric presentation contracts. Issue remains authoritative for its source facts and metric extraction; Repository and Issue remain authoritative for current access.

- Periods use epoch milliseconds with inclusive from/exclusive to. Default is the preceding seven days; presentation timezone is Asia/Taipei.
- Issue creation uses persisted creation timestamps. Close/reopen counts include recorded events only; legacy rows and unstructured events are reported as coverage metadata. Current work status is independent of OPEN/CLOSED.
- Repository scope and the Issue source query each recheck current active qualification and access. Authorization/not-found failures fail closed; infrastructure failure returns an explicit unavailable Issue source.
- Observed time is not an atomic snapshot across the Repository qualification and Issue query transactions. No writable metric store, cache or derived completion rate exists.

Runtime consumers are `pnpm insights:run` and the authenticated Repository page `/{login}/{repository}/insights` through read-only `GET /api/repository-insights`. Web resolves the current Repository locator through Repository's contract and supplies the verified active User to the existing Pulse query. The page defaults to seven days, supports thirty days, and separates period activity from current Issue workflow state. No additional persistence or completion rate is introduced.

Repository Pulse does not consume WBS. Project WBS metrics remain a Project-scoped capability owned and presented by WBS; no Project Insights screen is claimed by this contract.
