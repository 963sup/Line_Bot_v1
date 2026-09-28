# Validation and evidence

Choose evidence by responsibility; smaller evidence never proves a larger claim.

| Evidence | Proves | Does not prove |
| --- | --- | --- |
| `pnpm docs:check` | Markdown structure/links + convergence manifest integrity | code/runtime/deployment |
| `pnpm schema:check` | local declarative schema contract | remote Supabase state |
| `pnpm check` | repository fast gate for affected change | full merge/release gate |
| `pnpm validate` | full static/test/build gate | deployment/provider/device |
| Provider/API readback | specific remote state | unrelated business flow |
| Device/browser acceptance | observed user flow/environment | unrelated source/schema correctness |

一般修改用 `pnpm check`；merge/release 前用 `pnpm validate`。External mutation/probe 不是一般 offline validation。

Failure 先讀實際 log，沿 consumer/contract/owner 找根因；不得為變綠放寬 authorization、architecture guard、schema invariant 或 test expectation。
