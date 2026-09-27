# Resource route group

## GitHub-Mobile-aligned current responsibility

- Repository 根頁目標採 resource header（owner/name、可公開狀態）→ 概覽／已實作資源列表；Issues、Discussions、Labels、Milestones 以資源導覽或 list row 進入。
- Current private branch 仍直接呈現 IssueBoard；後續改成 overview 必須使用同一 Repository locator/access，不複製 Issue query 或新增第二個根頁。public branch 不因與 private branch 共用 layout 而取得內容讀權。
- 未登入與已登入各自測 header/navigation、320/390px 長名稱、列表返回與無權限結果；不能只驗一個 branch 就宣稱符合 Mobile 目標。

## 現行 URL 與 invariant

Current URL：`/{login}/{repository}`；FPT 對照 `schema-repos` 與 RepositoryOwner。

- 目前 public branch 顯示安全摘要；private/internal branch 在可信身分後載入 Issue surface。這是現況，不表示已提供完整 Repository overview 或公開 Issue body。
- `issues`、`discussions`、`labels`、`milestones` 子路徑與 Repository root 已收斂在本 group；同一 canonical locator hierarchy 只有一個 route owner。
- 改根頁導覽必須同時核對 public/private branch 的目的地、手機換行、對比及返回；只測登入後子頁不足以證明公開根頁。
- URL owner/name 與 stable RepositoryId 分開；變更名稱或 scope 必須重新解析，不以瀏覽器保存的舊 ID 取代路徑意圖。

- Canonical resource URLs are identity locators, not authorization.
- A Repository URL may resolve a public projection or, after trusted LINE identity, an authorized private/internal projection without exposing private existence to anonymous callers.
- Keep one formal URL owner; `/repositories` collection/workbench remains a `(mobile)` surface，canonical Repository identity/subresources remain here.
