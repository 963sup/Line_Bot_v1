# Release

## Principle

Release 把已驗證 revision 的多個 external desired states 收斂到各自 provider。Repository validation、database convergence、Web deployment、LINE publication 與 real-client acceptance 是不同 evidence，也不是天然同一 transaction。

Release graph 只保留真實 dependency：

```text
Validate current main
        ↓
   release_plan
    ├─ Supabase
    ├─ Vercel
    └─ Rich Menu
```

若某 owner 的 change 真正依賴另一 owner 的新 state，才建立 dependency edge；同一個 Release event 不等於同一個 consistency boundary。

## Trigger and planning

Current GitHub `Release` 只接受同 repository、current `main` 的 successful push `Validate`。

`release_plan` 是 read-only router：

1. 確認 validated SHA 仍是 current `main`。
2. 對 Supabase、Vercel、Rich Menu 分別尋找「最近一次該 owner job 成功」且為 current SHA ancestor 的 baseline。
3. Supabase 以該 baseline 判斷 `supabase/schemas/*.sql` 是否有 pending change。
4. Vercel 以該 baseline配合 Turborepo affected graph判斷 `@line-work/web#build` 是否真正受影響。
5. Rich Menu 以該 baseline判斷 assets／definition／desired-state 是否有 pending change。
6. Rich Menu publication-only source本身不算 Web runtime change；只有同一 pending range 另有實際 Web runtime-affecting change時，才要求先完成 Vercel。

每個 owner有自己的 convergence cursor。某 owner failure不得阻止不依賴它的 owner收斂，也不得把其他 owner 已成功的 change 在下次誤判為 pending。

## Owner-specific convergence

### Supabase

每個 validated `main` 都執行 provider precondition與 current-contract verification：

1. `schema:remote repair` 只恢復 current-source-determined、metadata-free runtime compatibility。
2. owner baseline之後若 `supabase/schemas/*.sql` 有 change，執行 plain `schema:remote sync`。
3. schema unchanged 則執行 `schema:remote verify`。
4. target check、lock、transaction、second diff、security readback與 migration-history invariant由 [Supabase](../platform/supabase.md) 擁有。

Supabase migration history不是 deployment authority；reconciliation不得新增、replay或repair migration history，`supabase_migrations.schema_migrations` fingerprint before/after必須完全相同。

### Vercel

只有 `@line-work/web#build` 有 pending runtime-affecting change時才部署 Production。因 Web runtime依賴 database contract，Vercel deployment仍要求同一 Release的 Supabase convergence成功。

Canonical adapter只驗證 active current-main Release與 successful `release_plan`；跨 provider dependency由 GitHub Release graph擁有，不在 Vercel adapter複製第二份 release policy。

### Rich Menu

Rich Menu desired state changed時一定進 publication path，但分兩種：

- 沒有 pending Web runtime dependency：validated current `main` 直接 preview → publish → LINE readback，不等待 Supabase／Vercel。
- 同一 pending range有 Web runtime-affecting change：等待 exact validated SHA Vercel Production成功後再 publish。

因此圖片、label、layout、既有 intent target等 publication-only change不被 database failure阻塞；只有需要本 release 新 Web runtime的 navigation change才建立 Vercel → Rich Menu edge。

## Compatibility

Schema 與 Web若需要協調切換，必須維持 consumer compatibility：不能先讓新 Web依賴尚未存在的 relation，也不能讓舊 Web持續服務於已與其不相容的 schema。

Database convergence失敗時不得部署依賴該 database contract的新 Web runtime。但不依賴 database或 Web runtime的 LINE desired-state convergence可獨立完成。

## Authorization changes

Release不得自行產生 administrator，也不從第一位註冊者、LINE ID、email或 UI可見性推定 business資格。授權來源與變更命令由 [Authorization](../security/permissions.md) 擁有。

## Evidence

每個 external owner分開記錄：

- code / validated revision
- owner baseline與 affected decision
- database convergence result
- runtime / deployment result
- external platform publication/readback
- real-device / business acceptance evidence（如適用）

Workflow整體 success不取代 owner evidence；owner job success也不能冒充其他 owner完成。

具日期驗收證據放 [Acceptance](../../change/evidence/README.md)，不累積在本文件。

Provider機制見 [Supabase](../platform/supabase.md) 與 [Vercel](../platform/vercel.md)；Rich Menu見 [LINE rich-menu](../line/rich-menu.md)；schema語意見 [Schema model](../data/schema.md)；backup／restore見 [Recovery](recovery.md)。
