# Change an API or route

## Load

- affected owner contract
- [runtime entrypoints](../rules/runtime-entrypoints.md)
- protected endpoint才加 [request authorization](../rules/request-authorization.md)
- URL/route查找才加 [route reference](../reference/runtime/routes.md)

## Decide

1. 這是 transport change，還是 business capability change？
2. Existing owner use case/public contract是否足夠？
3. Wire compatibility / retry / failure mapping是否受影響？
4. Browser/server graph與secret boundary是否改變？

Route Handler / Server Action不建立第二套 business writer。Client actor/role/scope/version只作 input。

## Validate

Owner tests + affected route/API tests + `pnpm check`。Published protocol變更另驗 backward/replay/recovery semantics。
