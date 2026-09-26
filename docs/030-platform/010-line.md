# LINE platform contract

LINE 是 identity proof / relationship / navigation / messaging / event ingress / MINI App application surface 的 external platform；不擁有 Account qualification、business authorization 或 durable Domain state。

## Channel and provider boundary

LINE 提供 identity proof、Messaging/Webhook、MINI App entry 等 provider 能力，但不擁有 User qualification、Organization/Team participation、TeamManager、Employment 或其他 business state。

## Current implementation ownership

`@line-work/line-channel` 是 current LINE integration code owner：LINE user proof、Messaging/Webhook、Rich Menu、MINI App browser adapter 均透過其 exports 提供。這是 Module Boundary，不改 LINE Console state、provider protocol、business authorization 或 Supabase Data Boundary。

## Product authority

LINE profile/userId/groupId/mention/chat membership 都不是 business role：

- LINE user proof → server verify → Account external identity mapping → current User qualification。
- LINE groupId 不建立 OrganizationMembership、TeamMembership 或 TeamManager。
- Bot 被加入群組不授予任何人 product permission。
- Webhook `source.userId` 是人類 external subject；`destination` 是接收 bot。Delivery target 不取代 command actor。

## Secrets and external state

Channel secret/access token 只由 server-side secret/config owner 管理，不進 URL/browser storage/docs example/business record。Repository 的 SDK、LIFF ID、menu definition 或 webhook route 不證明 LINE Console 已配置／發布；Developing/Review/Published 與 device acceptance 另由 Operations/Acceptance 驗證。

- [Messaging](010-line.md)
- [MINI App](010-line.md)
- [Identity verification](010-line.md)


## MINI App entry and runtime

## 責任

本文件只描述 LINE MINI App / LIFF 作為 Web product 入口時的平台語意：SDK 初始化、白名單 intent、登入接續與錯誤邊界。業務操作與授權規則不由 LIFF 定義。

## Environment identity

MINI App 的公開永久入口是產品／LINE Console identity，不是 secret。Current source 只由 `apps/web/src/shared/server/line-mini-app.ts` 擁有 Developing、Review、Published 三個 `https://miniapp.line.me/...` permanent URL；本文件不複製實際值作第二份 source of truth。

同一 stage 的三個值只由該 URL 派生：

```text
MINI App permanent URL
→ LIFF ID（SDK init）
→ Channel ID（server token audience verification）
```

LINE MINI App lifecycle 與 deployment provider 是兩個獨立軸，不從 `VERCEL_ENV`、branch 或 deployment target 推導 stage。Current source 以 `CURRENT_LINE_MINI_APP_STAGE` 明確指定目前 stage；現階段為 Developing。進入 Review 或 Published 時，必須以 source change 明確切換並重新驗證 Web／server audience／Rich Menu。

Rich Menu / Messaging URI 直接使用 current `miniapp.line.me` permanent-link domain 加白名單 intent；MINI App identity 只由 source-owned current-stage permanent URL 派生。

## 初始化

Web 端透過 LINE LIFF SDK 初始化 MINI App runtime。初始化完成前，呼叫端不得根據 URL 推定已取得可信 LINE 身分或直接執行業務命令。

目前共用 runtime 會：

1. 載入 LIFF SDK。
2. 初始化 LIFF client；開發環境可明確啟用 LIFF mock。
3. 初始化完成後才交回各功能繼續核驗與載入。
4. SDK 載入或初始化失敗時顯示可重試錯誤，不把失敗當成匿名成功或空資料。

LIFF browser 與 external browser 是不同 runtime context。依目前 LINE 平台行為，外部 browser 中 `liff.init()` 本身不等於完成 LINE Login；需要 LINE Login 的流程必須明確處理登入，再把 provider proof 交給 server 驗證。

## 入口 intent

MINI App URL 使用固定白名單 intent 接續 Web surface。入口只決定使用者想去哪裡，不授予資料或操作權限。

目前白名單包含：

`workplaces`、`planned`、`team`、`notifications`、`repositories`、`partners`、`feedback`、`clockIn`、`clockOut`、`membership`、`attendance`、`expense`、`records`、`register`、`restore`。

一般 boolean intent 必須只有一個值且為 `1`；`expense` 需要合法 UUID；`attendance` 可另帶白名單 operation。重複 intent、多個主要 intent 或非法 operation 應視為 invalid，而不是猜測目的地。

LIFF 自己產生的 `liff.state` 在 SDK 完成處理前視為 pending，不由 Web 提前解碼成業務操作。

## 登入與接續

登入接續只保存 Web 已知且必要的功能 intent 與白名單視圖，例如：

- 任務：`taskView=board|mine|publish`
- 合作夥伴：`partnerView=news|directory|referrals`
- 公告：白名單 `category`

接續網址不得複製 token、code、任意 return URL 或其他 credential-bearing SDK 參數。

URL 與頁面狀態只保存導覽意圖；直接開啟、重新整理或返回後，各功能仍必須重新取得可信身分並重新授權。

## 操作安全

- MINI App 入口不能因 Rich Menu 圖片、URL 名稱或前端狀態而自動推定合法業務狀態。
- 有副作用的流程由對應 module 決定是否允許首次入口自動執行；重開、未知結果與外部瀏覽器不得任意產生第二個命令。
- 前端 identity、member id、role 或 query parameter 都不能取代後端核驗。
- 結果頁只在可確認結果時顯示成功；未知結果必須提供查回或安全重試方式。

## 相鄰責任

- 使用者體驗：[Product experience](../000-core/060-product-experience.md)
- Rich Menu／Messaging：`../030-messaging/`
- LINE identity：`../040-identity/`
- Runtime boundary：`../../../020-architecture/050-runtime-architecture.md/`
- 各功能 business rule：[Domain owners](../010-domain-owners/README.md)


## Webhook

## Inbound verification

Webhook 必須先以原始 request body 驗證 LINE signature，再解析事件。Signature 建立 provider transport trust：request 來自持有該 channel secret 的 LINE Platform 且 payload 未被竄改；它不證明 human actor 或 business permission。Webhook `destination` 保留為 receiving-bot provider context，但 current runtime 不再用 business persistence 重複決定 transport admission。

事件的 `source.userId` 是發出訊息的人類 LINE subject；server 仍須依 identity mapping 解析實際 `User`／current `Member`，再驗證 scope、qualification 與 permission。人類 intent 缺少 `source.userId` 或無法驗證 mapping 時必須拒絕，不得以 `destination` 冒充 actor。非人類 provider events 仍由對應 protocol flow 擁有，不虛構 human actor。Bot delivery 人類 command 結果時不得以 receiving destination 取代 actor 或 authority。

1:1 `user` scope 的普通文字可在 actor qualification 通過後作為 Assistant 問答 intent；`group` / `room` 的普通聊天不得因 Bot 收到就送模型，只有 LINE 原生 self mention 或既有明確指令才可喚醒。任何 chat scope、未授權圖片或問答 intent 都不得自動建立 business record。

## Conversation scope

Webhook conversation context 與 human actor 必須分離：`source.userId` 是 actor；`source.type` + 對應 scope id 只是 transport conversation context。Private `user` scope 使用該 `userId` 作 conversation scope；`group` 必須帶非空 `groupId`；`room` 必須帶非空 `roomId`。缺少必要 scope id 的事件不建立 Assistant conversation，也不得以 bot `destination` 或其他 fallback 補值。

Current activation policy：

- 1:1 `user`：普通文字在既有 actor authorization 通過後可直接進 Assistant；不要求使用者額外 @Bot。
- `group` / `room`：普通文字保持沉默；Assistant 問答只接受 LINE 原生 self mention，既有 explicit command 仍依各自 handler 規則處理。
- conversation scope 只隔離 interaction context，不授予 Organization、Team、Employment、Repository 或其他 business permission。

這個 policy 由 Webhook router 執行；`@line-work/line-channel` 只負責可信 provider source parsing，不擁有 Assistant product policy。

## Event claim and replay

跨 instance 的短效 Webhook claim 可以使用 Redis，但 Redis 只負責有限 TTL 協調；持久 business idempotency / ledger authority 仍在 PostgreSQL。

- completed claim 可以回放已保存的 transport result。
- pending / lost claim 不假裝成功。
- Redis fault 在必要去重流程中應明確失敗，不退回 process-local Map 宣稱具有跨 instance 保證。
- LINE 是否重送由平台行為決定，系統不能宣稱 exactly-once。

## Messaging delivery

Business transaction 與 LINE reply/push 是不同責任。資料已 commit 後外部訊息失敗，不應回滾已完成 business state；需要可靠投遞時由 durable outbox / retry contract 處理。

平台接受 request 不代表終端裝置已收到訊息。Delivery、手機顯示與 business commit 在 acceptance 中分開驗證。

LINE channel credentials 屬 integration binding；rotation 只更新 credential。若未來出現 autonomous Bot actor use case，必須先由真實 owner 定義 stable identity、grant／delegation 與 scope，而不是從 webhook transport metadata 推導。

## Business flows

Webhook adapter 只做平台解析、驗簽、identity evidence 與 transport。具體 business flow 由 module owner 擁有，例如：

- Attendance workplace chat flow：[Attendance](../010-domain-owners/050-attendance.md)
- Expense receipt intake：[Expense](../010-domain-owners/100-expense.md)
- Rich Menu：`rich-menu.md`

Adapter 不保存第二套 product command/state machine。

## Safety

外部結果未知時不能盲目重送具副作用 message/business command。需要 retry key、lease、stop condition 或 platform-specific window 時，應由對應 integration / operations contract 明確定義。


## Rich Menu

## 責任

Rich Menu 是 LINE 私聊中的導覽與快捷入口，不是業務狀態、授權或完成結果的權威來源。圖片、alias 與點擊區只負責把使用者帶到既有功能；業務規則由各 [Domain owner](../010-domain-owners/README.md) 維護。

Repository 的責任分開如下：

- `apps/web/src/modules/assistant/rich-menu/definition.ts`：menu page、intent、alias、asset mapping 與 geometry 的唯一產品 definition。
- `apps/web/src/modules/assistant/rich-menu/desired-state.server.ts`：把 canonical definition、current MINI App identity 與正式 PNG materialize 成 repository desired state。
- `apps/web/src/modules/assistant/rich-menu/publication.server.ts`：單次 publication transaction、preflight、alias/default readback 與 rollback；不讀 env/argv。
- `apps/web/src/modules/assistant/rich-menu/operator.server.ts`：把 operator command 組合到 desired state 與 publication capability；不保存 CLI/environment state。
- `packages/line-channel/src/adapters/messaging/`：LINE Messaging API／Rich Menu HTTP client。
- `scripts/line/rich-menu/sync.ts`：本機／CI execution adapter，只負責 env、argv、結果輸出；不保存產品規則或 publication policy。
- `assets/line/rich-menu/`：正式 Rich Menu PNG source assets。

## 現行結構

主選單中央提供出勤操作，外圈提供 Repository、異常通報、表單作業、團隊協作、個人、公告通知等入口。新個人入口使用 `profile` intent 並進入 `/profile` authenticated viewer hub。既有 `membership` intent 只作相容 protocol 名稱：一般個人入口同樣收斂到 `/profile`；只有既有 `google=link` continuation 明確回 `/settings?google=link`。它不表示 Membership 是 current Domain owner，也不建立第二個 User identity locator。

原生子選單、外部表單與 Rich Menu switch 只負責 navigation。Rich Menu 的產品入口以 `uri` action 直接指向 source-owned current-stage `miniapp.line.me` permanent URL，加上白名單 intent；不經額外產品 redirect。表單開啟不代表提交成功，也不建立本系統的審批、案件或出勤結果。

正式素材共六張：

- `work-assistant-attendance-in.png`
- `work-assistant-attendance-out.png`
- `work-assistant-team.png`
- `work-assistant-forms.png`
- `work-assistant-notifications.png`
- `work-assistant-incident.png`

`home` 與 `attendance-in` 共用 attendance-in 圖片；四類子選單的基本／`-out` 狀態各自共用同一張 PNG。Repository 由主選單 URI 直接開啟既有工作面，不建立額外 submenu；四類子選單各有基本／`-out` 狀態，加上 `home`／`attendance-in`／`attendance-out`，共十一份 menu configuration。

## 出勤 menu state

Rich Menu 目前區分 `attendance-in` 與 `attendance-out` 主狀態及其對應子選單版本。中央按鈕帶 `clock-in`／`clock-out` intent 進入出勤流程。後端 Attendance state 才是 authority；過時 menu 不得反轉操作；menu sync／notification failure 不回滾合法完成的出勤交易。

個人綁定優先於 default，但它屬於 Attendance runtime responsibility，不是 Rich Menu publication responsibility。Rich Menu publication 只證明 LINE menu definition／alias／default；既有個人 binding 的重新同步由 Attendance flow 在使用者操作或 maintenance 時處理。

## Alias

Alias 使用 `work-assistant-<page>`；實際 menu definition、圖片尺寸與點擊範圍是發布 source。Repository desired state 不證明 LINE remote state 已同步；publication 必須以 LINE readback 作部署證據。

`work-assistant-tasks` 與 `work-assistant-tasks-out` 是退役 aliases。Publication 先完成新 aliases/default 與 readback，再移除退役 aliases；Attendance 個人 binding 不參與這個 release transaction。

## Repository operation

從 repository 根目錄只使用 `package.json` 的 canonical entry：

| 命令 | 效果 |
| --- | --- |
| `pnpm line:rich-menu preview all` | 讀取 repository 素材，檢查尺寸與 menu definition；不寫 LINE 遠端狀態 |
| `pnpm line:rich-menu preflight all` | 對 LINE definitions／current aliases/default 做 read-only preflight；不建立 menu、不改 alias/default |
| `pnpm line:rich-menu publish all` | 在單一 process 內重新做 LINE preflight，依序 create／upload／definition readback，再更新 aliases、切 default 並 readback；中途失敗依已知 LINE remote state rollback |

Rich Menu desired-state source 是 release-owned external state。當 `assets/line/rich-menu/**`、`definition.ts` 或 `desired-state.server.ts` 的變更合併到 `main`，同 SHA repository `Validate` 成功後 GitHub `Release` 才進入 LINE publication path；changed-source detection 只以前次成功 workflow_run Release 的 `Release <validated-sha>` run-name／display title、成功固定 `gate` job 與 git ancestor check 建立 baseline，避免 multi-commit push 漏掉早一個 commit 的素材或 definition 變更。沒有合格 baseline 時以 empty tree 做首次 bootstrap，因此 existing desired state 可能被全量收斂一次。它先要求 `mini-app-line` Vercel deployment 成功，再做 repository-only preview，最後以單一 `publish all` process 重新執行 LINE preflight／create／upload／activate／readback。沒有 Rich Menu desired-state change 時不配置 LINE publication job。LINE secret `LINE_CHANNEL_ACCESS_TOKEN` 只注入 publish step；Current-stage MINI App URL 仍由 repository source 擁有，不把公開 LIFF / Login Channel identity 重複存成 secret，也不讀 Attendance／Supabase runtime configuration。

Publication 不建立 `.artifacts/rich-menu*.json`，Rich Menu ID 只在單次 process 記憶體中傳遞；LINE remote definition／alias／default readback 才是 publication evidence。Create request 若未取得 ID 就失敗，可能是 unknown result；不得盲目重跑。Activation 若失敗，依記憶體 snapshot 回復 default／aliases；本次新建 menus 不自動刪除，避免短暫 alias 可見期間未知好友已切換後被誤刪。需要人工 reconcile 時，非敏感的 retained Rich Menu IDs 與 rollback failure 類別直接留在 workflow log，不另建 receipt source of truth。

圖片修改後必須重新 `preview`／`publish`；publication 會重新 upload 並讀回 remote definition。具日期的 remote publication、手機顯示與實機限制由 [Acceptance evidence](../090-governance/060-acceptance/010-acceptance-evidence.md) 保存，不寫回 current contract。

完整發布／回復 gate 見 [Release process](../070-operations/020-release.md)。

## 安全與導覽

- URI 只帶固定 MINI App intent 與必要白名單 view，不帶 token 或私人資料。
- `richmenuswitch` 只切換畫面，不授予 module role。
- LINE group、chat 或 Rich Menu context 不等於 TeamMembership、Project membership 或任何管理權限。
- 尚未有資料來源、角色或正式操作契約的項目，不以 Rich Menu 入口宣稱能力完成。
- `publish` 是外部 mutation，不納入一般 `pnpm check`／`pnpm validate`，也不因 merge、push、build 或本地測試成功自動取得發布授權；必須由 main 的 manual release workflow 明確授權。

## 相鄰責任

- MINI App entry：[MINI App runtime](010-line.md)
- 產品行動體驗：[Product experience](../000-core/060-product-experience.md)
- Operator script：[`scripts/line/rich-menu/sync.ts`](../../scripts/line/rich-menu/sync.ts)
- 正式素材：[`assets/line/rich-menu/`](../../assets/line/rich-menu)
- 出勤、Repository、Project、Notifications、Partners 等業務規則：[Domain owners](../010-domain-owners/README.md)


## Identity verification

LINE identity是外部身分證明；內部Account/User qualification與business authorization由Account/Identity與Security owner決定。

## Verification boundary

Server收到LINE proof後驗證Channel/Provider、token validity與可信subject，再透過persisted identity mapping解析internal human identity。Webhook signature 只證明 LINE Platform request proof；它不授予 business permission。

Current implementation解析stable Member ID；target Account migration完成後同一stable identity語意為 `UserId`。這是current->target命名/責任migration，不代表本docs branch已修改schema/runtime。

以下不能直接當identity authority：browser提供的memberId/accountId、LIFF profile、client decoded ID token/userId、display name/email、LINE groupId、editable metadata。

Verified provider+subject只證明external identity；private read/write仍需解析current User/Member qualification、trusted Principal與scope/capability。

Webhook 中 `source.userId` 代表發出命令的人類 subject，應解析實際 User；人類 intent 缺少 `source.userId` 或無法驗證 mapping 時必須拒絕，不得以 `destination` 冒充 actor。非人類 provider events 仍由對應 protocol flow 擁有，不虛構 human actor。`destination` 只表示 receiving LINE Official Account bot 的 provider context；Bot 回覆 command 結果是 delivery，不會改變 actor、authority 或 audit owner。

## Mapping

Target：

```text
LINE provider + subject
        ↓ verified mapping
UserId
```

LINE subject不直接成為EnterpriseAccountId、OrganizationAccountId、EmploymentId、PrincipalId或business FK。解除/重新連結external identity不轉移historical business ownership。

LINE bot userId／`destination` 只作 Integration 維護的 provider context；它不建立 Account identity、Principal 或 Permission。若未來 autonomous Bot 需要產品 identity，必須由該真實 use case 重新定義 owner 與 lifecycle。

## Browser / failure

Browser只取得proof並送server；authorization不在client完成。Token不放product URL/local durable store/business record。Token過期、Channel不符、subject無mapping、account不qualified或mapping conflict皆fail closed，不回退profile/email/cache。

## Adjacent owners

- Current Member lifecycle：`../../../010-domain-owners/010-account.md`
- Target Account language：[Selected domain target](../090-governance/020-proposals/010-domain-target.md)
- External identity data：`../../../040-data/050-identity-mapping.md`
- Authentication：[Authentication](../050-security/020-authentication.md)
