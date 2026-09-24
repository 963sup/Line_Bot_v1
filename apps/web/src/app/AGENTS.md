# App 路由約束

## GitHub Mobile 導覽目標（尚未實作）

全域導覽由 app shell 擁有；採用四個穩定目的地，是本產品對 GitHub Mobile 模式的選擇，不宣稱為上游所有版本的固定 tab 清單。

| 目標 tab | 保留 URL | 資訊責任 |
| --- | --- | --- |
| 首頁 Home | `/home` | 我的工作、可用資源入口與已授權收藏投影 |
| 通知 Inbox | `/notifications` | recipient-scoped 待處理通知；不混入一般公告或活動 feed |
| 探索 Explore | `/explore` | 現有 Repository discovery/Star；不假裝已有跨 owner 全域搜尋 |
| 我的 Profile | `/settings` | 當前 viewer 的帳號入口、公開個人頁連結、組織與管理入口；不是 public `/{login}` 替代品 |

Current shell 仍有 `/repositories` 第五個 tab；目標將它保留為 Home 資源入口與既有 deep link，不刪 URL。資料夾、API、LIFF intent 與發布選單不能因 tab 排序順便改名。

導航層級：主 tab → owner/collection → resource detail → 明確操作。一般內頁使用 back、title、最多一個主要快捷操作及適當 overflow；不能把每個 resource 提升為主 tab。切 tab 可保留同一 viewer 的安全瀏覽位置，但私有資料與命令恢復仍依 owner/session 規則。

直接開啟詳情沒有可信 in-app history 時，返回明確 owner collection；由 Inbox/Explore 進入時保留安全返回脈絡。不得把任意 `returnUrl` 加入 query，或用 local navigation state 當授權。

未登入 public、onboarding、provider callback 與外部 Google 交接不強套已登入底部 tab；admin 是明確的管理子流程。每個 resource 只保留一個 canonical URL owner。URL 現況見下表與子 AGENTS。

## URL 分工

| 子範圍 | URL owner |
| --- | --- |
| [(public)](%28public%29/AGENTS.md) | 公開入口與 `/{login}` User/Organization locator |
| [(resource)](%28resource%29/AGENTS.md) | `/{login}/{repository}` public/private projection 分流 |
| [(app)](%28app%29/AGENTS.md) | 工作台、治理與 Repository 子資源 |
| [(onboarding)](%28onboarding%29/AGENTS.md) | 註冊、恢復、完成結果 |
| [(admin)](%28admin%29/AGENTS.md) | 現有管理入口與未開放頁面 |
| [(system)](%28system%29/AGENTS.md) | callback、Google 交接、不可用結果 |
| [api](api/AGENTS.md) | HTTP methods、scope/input 與 owner 接線 |

FPT 對照與來源優先序繼承 [apps](../../../AGENTS.md)。`{login}` 可屬 User 或 Organization；`{repository}` 是該 owner 下的 name。number、slug、opaque id 各依本地契約，不用 GitHub 網頁網址推導本產品 locator。

URL 修改前沿 `page/route → module → _composition → package public export` 查實際 consumer；同時查返回、直接開啟、刷新、登入接續與舊入口。現有 partition 是 runtime 分工，不為目錄對稱搬移；layout 不建立授權。`_composition` 是 app-owned 接線，不得反向被 module/shared import。

本層列現行入口；未實作能力只留在 target/semantic evidence，不能用空 page/route 宣稱完成。新增 framework 特殊檔案前同步 architecture root whitelist，不能以放寬 guard 代替範圍評估。

路由、分區及相容入口依 [Web runtime](../../../../docs/020-architecture/050-runtime-architecture.md) 與 [Route contract](../../../../docs/020-architecture/050-runtime-architecture.md)；程式責任依 [Monorepo](../../../../docs/020-architecture/010-repository-architecture.md)。

- app 只做框架入口、HTTP delivery 與畫面／依賴組裝，不複製用例或執行 DDL。
- 根層遵守架構檢查白名單；每個 URL 一個 owner，不 import 其他 page／layout 當元件。
- layout／slot 不授權；註冊、恢復、Webhook 與一般會員操作依各自資格契約。
- callback 按所屬流程核驗；憑證不複製到產品 URL。
- layout 只載入所有子頁都需要的外框。slot／攔截路由須有實際需求，驗證直接開啟、軟導覽、返回及退出，不預建空 slot。
