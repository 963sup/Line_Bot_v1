# ContractDocument intake Web presentation

繼承 [上層規則](../AGENTS.md)；本檔僅補充當地約束。

This module presents the Contract-owned purchase-order intake capability. It consumes an exact
authorized FileRevision and submits a fixed structured extraction through the Intelligence public
intake contract; it does not own File bytes, provider configuration, Contract facts, or review
authorization.

The route preserves repository scope, request identity, exact source revision,
current owner authorization, and explicit human review before confirmation. Provider choice is
server-side composition and is never accepted from the browser.

The commercial intake transport presents the separate Intelligence-owned durable extraction
lifecycle and Contract-owned commercial DRAFT reads. It forwards exact source pins, stable
analysis/draft command identities and expected versions; status readback and explicit resume
never create a replacement analysis command. Errors preserve the owner's safe public classification and stage/code/trace correlation;
keep provider/SQL diagnostic detail in redacted server evidence, not browser responses.
Do not dump source documents, credentials or full provider payloads into logs. The existing purchase-order transport remains a distinct legacy
reader/recovery surface and is not adapted into the new commercial model.
