# Namespace

Namespace 集中管理跨 User／Organization 共用的全域 login 業務，以及產品 URL 的結構化定位契約。實作與分層見 [package README](../../packages/namespace/README.md)；低頻細節見 [detailed reference](../reference/domains/namespace.md)。

## Owns

- 全域 login 的格式、正規化、root 保留名稱、唯一性及名稱綁定。
- claim、resolve、以原 login 為條件的 rename；唯一持久化來源是既有 `account_logins`。
- 路由的 scope、path shape、active/planned 狀態與 active path builder。
- 名稱與 stable identity 分離；名稱解析不代表資格或存取授權。

## Boundaries

Account 保留 User 身分、註冊、資格、Profile 與外部 identity；Organization 保留組織 lifecycle。建立實體與 claim 必須在同一交易完成。Namespace PostgreSQL adapter 接受 caller 的 `Sql`，不另開交易。

Repository、Team、Enterprise 消費 Namespace 的全域 login 或路徑契約。其現有 repository name、team slug、enterprise slug、issue number 等 scoped 持久化與配置仍由實體 owner 負責；本次沒有將尚未實作的 capability 宣稱為已提供。

Web 負責 HTTP、頁面與導覽；Namespace 不依賴 Web 或 Account private implementation，也不另建 registry、快取或資格資料。

## Invariants

1. User 與 Organization 共用一個正規化後的全域名稱空間，不能重複取得同名或 root 保留名稱。
2. Claim 只建立 binding；同 target、同 login 可重試，不能用 claim 偷渡改名。
3. Rename 必須帶已讀取的 `expectedLogin`；過期編輯與名稱碰撞回衝突，不覆蓋新值。
4. User 與 login 原子提交；缺 login 是資料完整性錯誤，不導向無效的 Profile 修復流程。
5. Pause／suspend 不釋放 login；目前沒有已授權的 release 業務。
6. Resolve 只回 stable target 與 login；資格、可見性、存取權由相關 owner 判斷。
7. Root reservation 與路由契約分別以 `packages/namespace/src/domain/root.ts`、`domain/routes.ts` 為 truth；SQL 和 route tests 驗證一致性。
8. Planned route 不能由正式 path builder 產生；route descriptor 不代表業務、資料或頁面已啟用。
