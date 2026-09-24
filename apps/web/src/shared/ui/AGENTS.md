# Shared UI boundary

- Shared UI owns visual composition and accessibility primitives, not domain policy, authorization or resource lifecycle.
- Feature-specific labels, actions and state mapping remain with the feature module; do not make generic components silently infer business status.
- UI affordance, disabled state and navigation never substitute for server-side owner validation.
