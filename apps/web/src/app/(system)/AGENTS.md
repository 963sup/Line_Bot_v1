# System route group

- System routes own protocol continuation and availability presentation only; Auth, Google link and provider sessions remain governed by their owners.
- Callback/session data is untrusted until validated against current session, state/nonce and owner contract; provider login is not business authorization.
- Preserve failure, cancellation, stale callback and unavailable-provider distinctions.
