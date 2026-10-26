# ContractDocument intake Web presentation

This module presents the Contract-owned purchase-order intake capability. It consumes an exact
authorized FileRevision and submits a fixed structured extraction through the Intelligence public
intake contract; it does not own File bytes, provider configuration, Contract facts, or review
authorization.

The route preserves repository scope, request identity, exact source revision, expected line count,
current owner authorization, and explicit human review before confirmation. Provider choice is
server-side composition and is never accepted from the browser.
