# Web attendance module

- Owns attendance presentation and command transport; attendance state, qualification, geofence and ledger effects belong to `@line-work/attendance`.
- Clock actions submit explicit target, location, expected version and request identity where required; UI state cannot authorize or confirm success.
- Keep open/closed, rejected, unavailable, replay/conflict and unknown-result states distinguishable.
