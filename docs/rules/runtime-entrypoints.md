# Runtime entrypoints

HTTP Route Handler、Server Function/Action、LINE/Bot tool都只是 inbound adapter；相同 business intent必須落到同一 owner use case。

```text
Browser / External Client / LINE / Agent
→ transport adapter
→ verified proof
→ current Principal / qualification / scope
→ owner command / query
→ owner transaction
```

## Rules

- Handler驗 transport shape、headers/status/provider callback contract；不內建第二套 business state machine。
- `use server`、server runtime、已登入 page、action ID都不等於 authorization。
- Form/query/body視為 untrusted；actor/role/scope/version重新核驗。
- Existing published API/protocol存在時，不為 framework convenience另建第二 writer。
- Unknown result使用原 request identity/readback；retry/navigation refresh不能產生新 intent。
- Concrete dependencies只在 outer composition注入；Domain/Application不 import Next.js Request/Response/cookies/FormData。
- Failure至少區分 unauthenticated、forbidden/not-qualified、not-found、validation/lifecycle、version/replay conflict、upstream unavailable、unknown-result。
- Secret / privileged DB/provider client不得進 browser-reachable graph。

完整 route inventory只在需要 URL 查找時讀 [route reference](../reference/runtime/routes.md)。
