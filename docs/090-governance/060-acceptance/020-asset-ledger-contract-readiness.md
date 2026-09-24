# Asset Ledger contract readiness — 2026-09-13

本文件只保存本次 Asset / Wallet / Ledger contract release 的 production evidence；不取代 Ledger business rules、Supabase schema contract 或 release process。

## Version / deployment

- GitHub `main`：`584744d29bfb925e061b77753ad9ace947857a68`。
- GitHub `Validate #594`：同一 commit retry 後完整成功；第一次失敗是 Node/V8 native crash，沒有產品 assertion failure。
- Vercel team：`96sup` (`team_X20QRhf0INK1oNiIT8q0MWXx`)。
- Vercel project：`line-bot-963sup` (`prj_7xuJHwZtkXjEIXIt4ZjjVVry2fN0`)。
- Production deployment：`dpl_CeSPZnksFgzGnpnzNAwbQesG2dgw`，`READY`，Git metadata 指向上述 exact `main` commit。
- Production `/api/health` 回覆 HTTP 200、`{"status":"ok","service":"web"}`，`Cache-Control: no-store`。

## Database / runtime evidence

Supabase production project `clbpdzaprfcqtfwtaasg` 已套用 expand migration `20260913021500_asset_ledger_expand`。Contract 尚未套用。

部署後 production 已出現真實 Attendance write：

- 2026-09-13 07:28:19 UTC，Vercel `POST /api/attendance/clock-in` 回 200，deployment 為上述 exact production deployment。
- 對應 Asset Ledger 新增 `attendance / clockIn / 2026-09-13`，`amount_units = 1`。
- 同一操作後：Attendance session/event/command/notification 各新增一筆，Wallet 由 6 units / 3 Coin 變為 7 units / 3.5 Coin。
- `member_coin_ledger` 與 Membership／Attendance runtime Ledger facts 仍 exact parity：各 5 rows / 7 units。
- 對既有 reward identity 再呼叫 `post_asset_credit(...)` 回 `credited = false`，沒有重複 value fact。
- Production `line_app` 已實際執行新版 Wallet projection query、Ledger `hasEntry` query 與 `post_asset_credit(...)`。

Source review 同時確認：

- Membership daily reward write：`claimDailyCheckIn → recordLedgerCredit → post_asset_credit(...)`。
- Attendance `clockIn` / `clockOut` 共用 `execute()` 的 `recordLedgerCredit → post_asset_credit(...)` 路徑。
- Membership read composition 使用 `PostgresWalletStore` + `PostgresLedgerStore`；current product source 沒有 `member_coin_ledger` reader/writer。

## Contract release decision

Data-boundary contract gate 已具備：exact deployed source、migration/schema equivalence、production Ledger/Wallet read、production Attendance Ledger write、idempotency 與 legacy/new parity。這足以進入獨立 forward contract migration；不要求再以假 production data 製造證據。

Contract migration 必須：

1. fence legacy writes；
2. 對 legacy rows 與 Membership／Attendance Ledger facts 做雙向 exact parity，任一差異 fail closed；
3. 收斂 `post_asset_credit(...)` 為單一 Asset Ledger write；
4. 移除 rollout-only trigger/function 與 `member_coin_ledger`；
5. 保留 `migration/legacy_balance` 等只存在 Asset Ledger 的歷史 value。

## Limits

- 本證據不等於完整 Android/iOS 或 business acceptance。
- 目前只有 post-deploy `clockIn` 的 real production write evidence；`clockOut` 雖與 `clockIn` 共用同一 store/posting path，但沒有本次 post-deploy real-client sample。
- Contract migration 在完成 repository Validate 前不得套用 production；套用後仍需重新讀回 migration history、catalog、Wallet/Ledger 與 Vercel runtime errors。
