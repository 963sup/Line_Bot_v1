# @line_bot_v1/account
Owner: User/Account lifecycle, qualification, login/profile/follow, external identity links, and earned Achievement facts. Semantics: [Account](../../docs/owners/account.md).

- Employment, Organization membership, and authorization remain separate owners; external proof never invents qualification.
- Preserve lifecycle/version checks, replay safety, tenant isolation, and public contracts.
- Stable UserId is identity; login/profile/display/provider data are mutable locators/projections. Namespace owns shared root collision policy.
- Profile visibility applies only to Account-authored profile fields; it never grants or suppresses another owner's authorization.
- Follow edges are social relations, not membership/access/authorization evidence.
- External links are explicit, one-time/version/expiry-bound; never merge Users by email or transfer history on unlink.
- Achievement runtime is read-only earned facts; do not invent grant/progress/revocation policy without a real rule and consumer.
