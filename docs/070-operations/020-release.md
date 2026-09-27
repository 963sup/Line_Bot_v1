# Release

## Principle

Release 是把已驗證的 revision 與必要外部變更依 dependency order 放行到指定環境。Repository validation、database convergence、Web deployment、provider publication 與 real-client acceptance 是不同 evidence；任何單一成功結果都不能冒充整體發布完成。

## Trigger and routing

Current GitHub `Release` 只接受同 repository、current `main` 的 successful push `Validate`。

Affected-source cursor 只接受先前整體 `conclusion=success` 的 same-repository workflow-run Release `Release <validated-sha>`，且該 SHA 必須是 current validated SHA 的 git ancestor。任何 downstream external-effect failure 都不得前進 cursor；failed Release 的 affected source change 留給下一次 validated `main` 重新 reconcile。沒有合格 cursor 時才以 empty tree 作保守 bootstrap。

Release 只負責決定「哪個外部 owner 需要被呼叫」與「先後順序」，不重寫 provider operation semantics。

## Publication order

一般順序：

1. 確認 validated current-main revision 與 target environment。
2. 收斂 Supabase database contract。
   - 每次先執行 `schema:remote repair`，只恢復 current-source-determined、metadata-free 的 runtime compatibility；zero-row legacy shape recovery 的 precondition／row-count／RLS／grant evidence 由 Supabase owner 驗證。
   - affected source 包含 `supabase/schemas/*.sql`：呼叫 plain `schema:remote sync`。
   - 沒有 schema change：呼叫 `schema:remote verify`。
   - Supabase 內部的 target check、repair precondition、diff、transaction、second diff、security readback、locking 與 migration-history invariant 由 [Supabase](../030-platform/020-supabase.md) 擁有。
3. 只有 Supabase convergence 成功，才允許 canonical Vercel production adapter 發布 exact validated SHA。Adapter 在 provider mutation 前必須先由 GitHub readback 證明自己位於同 SHA 的 active Release，且 `gate`／`supabase` jobs 已成功；Vercel provider reconciliation 由 [Vercel](../030-platform/040-vercel.md) 擁有。
4. Rich Menu 只在其 desired state 受影響時發布，且依賴上述 Production deployment 成功。
5. 其他 LINE／scheduler／external platform change 依各 owner contract 逐項 mutation 與 readback。
6. 需要 real-device／business acceptance 的能力，在對應 evidence 完成前不得宣稱整體完成。

Manual Supabase data-cutover workflow 只負責自己的 business metadata／recovery／reviewed-plan contract，不取得 Web deployment ownership。完成後仍由 Release 對 current validated SHA 重新判定 publication order。

## Compatibility

Schema 與 Web 若需要協調切換，必須維持 consumer compatibility：不能先讓新 Web 依賴尚未存在的 relation，也不能讓舊 Web 持續服務於已與其不相容的 schema。

Database convergence 失敗時維持上一個 Production runtime。若 schema change 已套用且舊 runtime 不再相容，應停止不相容 writer 並向前修復或依 [Recovery](030-recovery.md) 執行受控 restore；不得以單純程式 rollback 破壞新資料。

## Authorization changes

Release 不得自行產生 administrator，也不從第一位註冊者、LINE ID、email 或 UI 可見性推定 business 資格。授權來源與變更命令由 [Authorization](../050-security/030-authorization.md) 擁有。

## Evidence

每個 Release 應分開記錄：

- code / validated revision
- database convergence result
- runtime / deployment result
- external platform publication result
- API / provider readback result
- real-device / business acceptance evidence（如適用）

具日期驗收證據放 [Acceptance](../090-governance/060-acceptance/README.md)，不累積在本文件。

Provider 機制見 [Supabase](../030-platform/020-supabase.md) 與 [Vercel](../030-platform/040-vercel.md)；schema 語意見 [Schema model](../040-data/030-schema-model.md)；backup／restore 見 [Recovery](030-recovery.md)。
