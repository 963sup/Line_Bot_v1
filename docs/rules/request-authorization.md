# Request authorization

Protected request 的最小安全模型：

```text
untrusted request
→ verify transport / identity proof
→ resolve current Principal
→ qualify current User / owner state
→ resolve requested scope
→ evaluate capability / policy
→ execute owner use case
→ commit / return minimum necessary data
```

## Rules

- LINE / OAuth / session proof只回答「這次 proof可信嗎」，不直接授予 business role。
- Client傳的 UserId / accountId / role / scope / organization / version都只作 requested input；server重新解析 current authority。
- Membership、Employment、Role、Permission、Scope是不同關係；不能互相推定。
- URL可解析不等於可讀／可寫；public/private projection仍由 owner授權。
- Revocation / suspension後，新 request必須立即失去 authority；舊 browser state/cache不能恢復。
- Authorization decision盡量在 application/owner boundary；RLS/grants是 defense in depth，不是替代 business policy。
- Cross-tenant / cross-Organization lookup fail closed，回應遵守 minimum necessary disclosure。

Permission catalog與特定 owner rule只有需要時再讀 [Authorization reference](../050-security/030-authorization.md) 與對應 owner contract。
