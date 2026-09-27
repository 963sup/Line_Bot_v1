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
| Supabase | `docs/030-platform/020-supabase.md` |
| Vercel | `docs/030-platform/040-vercel.md` |
| Release ordering | `docs/070-operations/020-release.md` |
| Recovery / unknown remote result | `docs/070-operations/030-recovery.md` |
| LINE publish / webhook | [LINE overview](../030-platform/010-line.md) then one LINE reference |

先讀 exact failed step / provider readback。不要把 local build、HTTP 200、Git push或 READY status當成其他 boundary的成功證據。
