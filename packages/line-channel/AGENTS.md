# @line_bot_v1/line-channel
Owner: LINE protocol, user-proof verification, Messaging/Webhook clients, and browser-safe MINI App integration. Semantics: [LINE](../../docs/owners/line-integration.md).

- Business qualification, authorization, navigation policy, and domain state stay with their owners.
- Keep browser LIFF separate from server credentials/SDKs. `source.userId` is a human external subject; signed `destination` is receiving-bot metadata, not product authority.
- Rich Menu definition/publication policy stays outside this package.
- Preserve signature/raw-body checks, replay identity, payload bounds, credential redaction, Rich Menu readback, and LIFF continuation.
- Provider acceptance never proves business authorization or commit. Remote mutation requires target, request identity, precondition, readback, and evidence.
