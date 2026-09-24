# @line-work/partners

- Owns partner directory, referral/contact state and publication/visibility contract; external contact data is not automatically a trusted business relation.
- Preserve owner/scope authorization, lifecycle/version semantics, visibility filtering, audit evidence and distinction between not-found, forbidden and unavailable provider results.
- Provider adapters remain transport mechanisms; they must not create partner authority, bypass current qualification or silently overwrite durable records.
- Consumers use public partner contracts and cannot query partner persistence directly.
