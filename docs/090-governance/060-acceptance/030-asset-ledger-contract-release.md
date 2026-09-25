# Asset Ledger contract release — 2026-09-13

本文件保存 Asset / Wallet / Ledger contract migration 實際套用後的 production evidence；不取代 Ledger business rules、Supabase schema contract、release process 或 real-device acceptance。

## Released version

- GitHub `main`：`f5dd9097aa173a5e98016233ad303c38a3d2ec7f`。
- PR #12：`Contract Asset Ledger rollout and remove legacy Coin persistence`，以 squash merge 收斂為一個 logical change。
- PR head `3c44920f69abab0bac37f04bbe0e0fdcf85c2eaf` 的 `Validate #595` 完整成功；schema equivalence、contract success/fail-closed migration tests、typecheck、89 Infrastructure tests、60 Web tests、33 Application tests與 production build 均通過。
- merge 後 `main` 的 `Validate #596` 亦完整成功。
- Vercel production deployment：`dpl_Dq4JgnC7NRZYh1RMNBpsHGPG86EU`，`READY`，Git metadata 指向上述 `main` commit。

## Production migration

本次 Production migration 使用 retired Supabase production environment；provider project identifier 已移除。

套用前立即 readback：

- `member_coin_ledger` 與 Membership／Attendance Ledger facts 雙向差異皆為 0。
- legacy / runtime Ledger 各 5 rows / 7 units。
- `migration` source rows 為 0。
- rollout lock/mirror trigger 各存在一個。
- 沒有 active `line_app` transaction。

Production contract migration 實際執行 `20260913153000_asset_ledger_contract.sql`。Supabase MCP 首次依執行時間記錄 temporary version `20260913081359`；確認 DDL 已成功後，只將該已執行 migration history row 的 version metadata 對齊 repository canonical filename。最終 remote migration history 為：

```text
20260912023739 consolidated_baseline
20260912035550 google_link_requests
20260912165700 coin_ledger_data_boundary
20260913021500 asset_ledger_expand
20260913153000 asset_ledger_contract
```

這次 history 對齊不補執行 SQL、不製造 migration 成功證據；schema change 已先由 migration action 真實完成。

## Contract readback

套用後 production catalog / data / permission readback：

- `member_coin_ledger`：不存在。
- `lock_member_coin_credit()`：不存在。
- `mirror_member_coin_ledger_insert()`：不存在。
- rollout triggers：0。
- `asset_ledger_entries`：存在，RLS enabled。
- `post_asset_credit(...)`：存在，function definition 不再引用 `member_coin_ledger`。
- Asset Ledger：5 rows / 7 units，與 contract 前 value facts 相同。
- Wallet projection：3.5 Coin，與 contract 前相同。
- `line_app`：Ledger `SELECT=true`，direct `INSERT/UPDATE/DELETE=false`，`post_asset_credit(...) EXECUTE=true`。
- `anon` / `authenticated`：`post_asset_credit(...) EXECUTE=false`。
- 對既有 reward identity 再呼叫 final `post_asset_credit(...)` 回 `credited=false`，Ledger row count / units 不增加。

因此 rollout-only 第二份 Coin persistence、dual-write、mirror 與 cross-table reward lock 已移除，而 current authorization、append-only Ledger、Wallet projection 與 posting idempotency 保持原語意。

## Runtime / advisor readback

- Production `/api/health` 在 contract 後回 HTTP 200、`{"status":"ok","service":"web"}`、`Cache-Control: no-store`。
- Vercel contract 後檢查區間沒有 runtime error cluster。
- Supabase security advisor 只有既有 `Leaked Password Protection Disabled` warning；沒有 Asset Ledger contract 新增的 security finding。
- Performance advisor 仍回報既有 unrelated foreign-key/index / `permission_grants` primary-key suggestions；沒有 Asset Ledger contract 新增 finding。

## Limits

- 這份證據證明 data-boundary contract rollout 完成，不等於 Android/iOS、LINE 真機或 business sign-off。
- Contract 後沒有為了驗收而製造新的 production reward；只使用既有 reward identity 做 no-op idempotency readback。
- 未變更 Attendance geofence/version/replay、Membership qualification、authorization、tenant isolation 或 notification semantics。
