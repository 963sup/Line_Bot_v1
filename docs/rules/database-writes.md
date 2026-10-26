# Database write rules

修改 PostgreSQL 前只載入本文件 + affected owner contract；SQL細節再按需讀 schema reference。

## Authority

```text
semantic-model
→ data-topology
→ packages/integration-supabase/src/schemas/*.sql
→ owner adapter / use case
```

- `packages/integration-supabase/src/schemas/` 是 current declarative DDL；migration history不是 current authority。
- Authoritative relation恰好一個 semantic owner；cross-owner mechanism不能取得 business truth。
- Domain model不等於 table model；transaction boundary由必須一起成立的 invariants決定。

## Write invariants

- Authoritative state change透過 owner use case / adapter；runtime不因共用 DB connection取得其他 owner mutation authority。
- Authorization、qualification、expected version、request replay與共同 effects需要在真正 transaction boundary重驗／提交。
- Same request identity只能 exact replay；不同 fingerprint共用 ID拒絕。
- Long external API call不放在 DB lock內；business commit後的 external effect需要 durable expectation + idempotent retry/readback。
- RLS/grants為 defense in depth；不得用 schema change放寬 tenant/data isolation。

## Shared governance transaction protocol

`app_private.lock_governance('shared' | 'exclusive')` 是 qualification/access 與治理 writer 的共同 PostgreSQL 契約。Key 的唯一實作來源為 [`000_foundation.sql`](../../packages/integration-supabase/src/schemas/000_foundation.sql)；TypeScript Adapter 與 SQL coordinator／trigger 呼叫同一函數，不能另選 key。此中立機制不決定 business authorization、Owner 或 replay policy。

| Mode | Current participants / protected facts |
| --- | --- |
| shared | Attendance command／supplement review 的目前資格與打卡點；Repository provisioning、access/content-scope/address query；Project management 的目前治理資格；Account Follow／Unfollow 的目前 User 資格與關係寫入 |
| exclusive | Account lifecycle／identity binding／status management、Identity & Access permissions、Enterprise／Organization／Team governance，以及 Repository lifecycle／grant／address writers；對應 SQL provisioning、access mutation 與 permission-administrator constraints |

共用鎖先於競爭的 User/resource row 與 request lock；之後的資格、receipt、row、request 次序依各 Owner 既有契約（例如 Project receipt 後重驗資格），不能用統一模板覆寫。SQL constraint 可在既有 transaction 中重入同一鎖。shared 彼此相容，與 exclusive 互斥；持有到 commit／rollback，不另解鎖，不在持鎖時呼叫外部 provider。Team hierarchy、request identity 等獨立鎖保持自己的用途，不併入此協定。

`schema:check` 拒絕 TS／SQL 重新直接引用共同 key；真實 PostgreSQL 測試固定原 key，驗 shared/exclusive mode、相容／等待、commit／rollback release 及 runtime-only execute grant。Repository／Attendance races 保持 #228 的重構前 characterization；原有 Owner tests 繼續驗各自資格／版本／replay／最後管理者及 clock-out snapshot。這些證據不宣稱所有交錯或 production 已驗收。

## Workflow

```text
identify owner + invariant
→ edit declarative schema / owner adapter
→ update data-topology if ownership/mapping changes
→ pnpm schema:check
→ pnpm check
→ remote reconciliation only through release/authorized operation
```

Data transform / preserved business rows不是純 DDL；需要獨立 cutover/recovery procedure。
