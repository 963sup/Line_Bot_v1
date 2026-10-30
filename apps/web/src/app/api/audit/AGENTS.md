# Audit delivery

繼承 [上層規則](../AGENTS.md)；本檔僅補充當地約束。

- `GET /api/audit` projects the Audit query contract; only current EnterpriseOwner / OrganizationOwner authority permits the matching exact scope.
- No global history, Team history, raw result payload, reason text or source-object access is exposed.
- Authentication, invalid input, forbidden and unavailable responses remain distinct; every response is uncached.
