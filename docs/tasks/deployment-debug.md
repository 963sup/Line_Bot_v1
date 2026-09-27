# Debug deployment or remote state

先判斷哪個 boundary失敗，不要先重跑全部流程。

```text
repository validation
→ release orchestration
→ Supabase reconciliation
→ Vercel deployment
→ LINE/provider publication
→ browser/device behavior
```

## Load by failure

| Failure | Read |
| --- | --- |
| CI / validation | [validation rules](../rules/validation-evidence.md) + actual job log |
| Supabase | [Supabase](../reference/platform/supabase.md) |
| Vercel | [Vercel](../reference/platform/vercel.md) |
| Release ordering | [release](../reference/operations/release.md) |
| Recovery / unknown remote result | [recovery](../reference/operations/recovery.md) |
| LINE publish / webhook | [LINE owner](../owners/line-integration.md) then one LINE reference |

先讀 exact failed step / provider readback。不要把 local build、HTTP 200、Git push或 READY status當成其他 boundary的成功證據。
