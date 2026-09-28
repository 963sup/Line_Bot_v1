# Change authentication or authorization

## Load

- affected owner contract
- [request authorization](../rules/request-authorization.md)
- provider proof變更才讀 authentication / LINE/OAuth reference
- permission catalog或policy implementation變更才讀 detailed authorization reference

## Trace

```text
proof source
→ Principal
→ current qualification
→ requested scope
→ capability/policy owner
→ data isolation / mutation boundary
```

Identity、Membership、Employment、Role、Permission、Scope不可合併成一個 shortcut。

## Negative paths

至少檢查 unauthenticated、inactive/suspended、wrong scope、revoked role、cross-tenant、stale/replay與 minimum-disclosure failure。

完成後跑 affected tests + `pnpm check`；RLS/schema變更另加 `schema:check`。
