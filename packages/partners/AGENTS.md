# @line_bot_v1/partners
Owner: partner directory, referral/contact lifecycle, and publication visibility. Semantics: [Partners](../../docs/owners/partners.md).

- External contact data is not identity proof, authorization, or trusted business relation.
- Preserve scope authorization, lifecycle/version, visibility filtering, audit evidence, and distinct not-found/forbidden/unavailable outcomes.
- Management writes keep requestId/fingerprint, expected version, reason, and consent in one transaction; mismatched replay fails.
- Provider adapters transport data only and must not create authority or bypass current qualification.
