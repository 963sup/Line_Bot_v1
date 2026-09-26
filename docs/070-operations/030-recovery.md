# Recovery

## Principle

Recovery 以不遺失已確認業務資料、不復活已撤銷資格、不破壞唯一 writer 為前提。程式 rollback 與資料 recovery 是不同操作。

## Backup requirements

針對實際服務方案確認 backup capability、retention、cost、RPO 與 RTO；文件與 provider 預設值不能代替指定環境驗證。Destructive/data-sensitive manual reconciliation 至少要保存 non-secret provider backup/PITR/restore evidence reference 與 operator recovery attestation；reference 只提供可追溯性，不等於 machine-verified provider recovery capability。沒有可追溯 recovery evidence 時不得把 apply 視為已授權。

隔離 restore 至少核對：

- Member 與 external identity mapping
- ledger / Coin
- attendance facts and events
- expense records
- permission / suspension state
- audit / command receipts
- deletion / withdrawal state that must remain effective

## Recovery decision

尚未產生新 writer 資料時，可以依已驗證方案恢復舊版本；一旦新版本已有寫入，必須先停止 writer、對帳增量，再選擇向前修復或受控資料還原。不得只 rollback Web 丟棄新資料。

不得以雙寫、第二主庫或自動 fallback 取代可驗證的 recovery procedure。

## Schema recovery

已套用 migration 不改寫歷史。若 migration 與 Web 發生相容問題，先確認 transaction / migration history / partial external changes，再採向前 migration 或在明確停機、備份與授權下執行受控 restore。

## External state

Database recovery 不自動恢復 LINE Rich Menu、webhook、scheduler、Google/Supabase console 等外部狀態；外部平台狀態由 `../../050-external-operations/010-external-change-control.md` 逐項 readback。

## Validation

Recovery 只有在 restore 後重新驗證 authorization、isolation、replay、version、停權／撤權與必要 end-to-end flow 後才算完成。歷史證據歸 `090-governance/060-acceptance/`。
