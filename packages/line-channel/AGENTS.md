# @line-work/line-channel

- Owner boundary: this package owns LINE provider protocol, user-proof verification, Messaging/Webhook clients and browser-safe MINI App integration; business qualification, authorization, navigation policy and domain state remain with their owners. Canonical semantics: [LINE](../../docs/owners/line-integration.md).
- Keep browser LIFF surfaces separate from server credentials/SDKs. `source.userId` is a human external subject; signed webhook `destination` is receiving-bot metadata, not a Principal, Permission or business identity.
- Rich Menu product definition/publication policy stays outside this package; this package owns only the LINE protocol/client boundary.
- Preserve endpoint/signature/raw-body checks, replay identity, payload bounds, credential redaction, Rich Menu readback and LIFF continuation semantics. Provider acceptance never proves business authorization or commit.
- Remote provider mutation requires explicit target, request identity, precondition, readback and evidence; generated/reference provider data must remain derivable from its canonical source.
