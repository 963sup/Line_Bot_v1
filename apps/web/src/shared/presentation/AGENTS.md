# Presentation shared boundary

- Shared presentation helpers may model navigation, access state and operation display; they do not decide business permission or success.
- Route/view state must distinguish loading, empty, forbidden, unavailable, not-implemented and unknown result.
- Stable IDs and selected scopes locate resources only; never serialize secrets, authorization decisions or durable version authority into presentation state.
