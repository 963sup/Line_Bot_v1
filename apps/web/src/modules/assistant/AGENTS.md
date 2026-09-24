# Web assistant module

- Owns assistant presentation and draft interaction; Assistant output is untrusted input and never direct business authority.
- Issue draft, receipt or answer flows must hand off to the owning package for deterministic validation, authorization and persistence.
- Preserve provider unavailable, cooldown, cancellation and bounded-input/output semantics.
