# @line-work/partners

- Owns partner directory, referral/contact state and publication/visibility contract; external contact data is not automatically a trusted business relation.
- Preserve owner/scope authorization, lifecycle/version semantics, visibility filtering, audit evidence and distinction between not-found, forbidden and unavailable provider results.
- Provider adapters remain transport mechanisms; they must not create partner authority, bypass current qualification or silently overwrite durable records.
- Consumers use public partner contracts and cannot query partner persistence directly.
- Management commands keep `requestId`, fingerprint, expected version, reason and consent confirmation together in the transaction; exact replay returns the recorded result, mismatched replay fails.
- Published partner visibility is a projection over partner lifecycle state. External contact details are minimum-necessary data, not identity proof or a grant to reach across Account, Team or Organization boundaries.
