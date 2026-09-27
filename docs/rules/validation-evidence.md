# Validation and evidence

Validation選擇由變更責任決定；不要用較小的證據冒充較大的 claim。

| Evidence | Proves | Does not prove |
| --- | --- | --- |
| `pnpm docs:check` | Markdown / local links contract | code behavior / deployment |
| `pnpm schema:check` | local declarative schema/database contract | remote Supabase current state |
| `pnpm check` | repository fast gate for affected change | full merge/release gate |
| `pnpm validate` | full repository static/test/build gate | deployment/provider/device |
| Provider/API readback | specific remote state | unrelated business flow |
| Device/browser acceptance | observed user flow/environment | schema/source correctness outside that scope |

一般修改先 `pnpm check`；merge/release前 `pnpm validate`。External mutation/probe不屬一般 offline validation。

Validation failure先讀實際 log，沿 consumer/contract/owner追根因；不為「變綠」放寬 authorization、architecture guard、schema invariant或 test expectation。
