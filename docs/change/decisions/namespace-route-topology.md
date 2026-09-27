# Selected resource namespace topology

這份路由樹是已選定的 URL 方向；尚無 runtime 的啟用條件留在本 decision，不建立空頁面或假資料。Current locator truth 仍在 `architecture/semantic-model.json#locators`，root reservation 在 `packages/namespace/src/domain/root.ts`。

## Activation decisions

完整 selected path、scope、locator owner 與 active/planned 狀態以 [routes.ts](../../../packages/namespace/src/domain/routes.ts) 為 executable truth。本文件只保留尚未解決的業務啟用條件，不維護第二份 route registry。

| Capability | Required decision / implementation |
| --- | --- |
| Repository Pull | Business owner、SCM/review contract、編號配置及 current viewer projection |
| Repository Discussion number | Persisted number、scoped unique index、concurrency、既有資料明確編號與 API/URL cutover；不從 opaque ID/hash 或排序臨時推導 |
| Organization Project | Project number、Organization scope、access、command/replay 與 existing-data contract |
| Organization People | Login → stable Organization composition、member visibility 及 Account display projection |
| Organization Repositories | 選定 public catalog 或 authenticated inventory；後者需 owner-scoped current-access query |
| Organization Packages | 產品 Package owner / persistence / runtime；不能把 npm workspace 當作產品能力 |
| Organization Discussions | 選定 Organization forum 或 Repository projection，不直接搬移現有 Discussion owner |
| Sponsors | Funding owner、visibility、query；Account locator 不形成第二種 Account identity |

Issue、Pull、Discussion 的 collection 分別使用 `/issues`、`/pull`、`/discussions`；number 只在所屬 Repository scope 解讀。是否共用 Issue/Pull allocation sequence 必須在 Pull 啟用時明確決定，現階段不預建 allocator。

已發布的 Team `/organizations/.../teams/...` 以 Next internal rewrite 進入唯一 `/orgs/...` page，保留既有深連結與舊 308 快取可用性。所有新導覽使用 `/orgs/...`，不新增第二份頁面，也不以反向 redirect 和舊快取形成循環。

## Collision and performance

- Global roots `orgs`、`enterprises`、`sponsors`、`settings`、`notifications`、`stars`、`issues`、`pulls` 保留給產品入口，不能被 User 或 Organization login claim；TypeScript 與 Namespace SQL constraint 同步驗證。
- `pull`、`teams`、`people`、`packages`、`discussions` 是 nested segment，不因此全域禁止相同 login 或 Repository name；例如 `/alice/issues` 仍可定位名為 `issues` 的 Repository。
- `/orgs/{organization}` 的 Organization segment 使用同一 Namespace login binding，不另設 org slug directory；必須檢查解析結果是 Organization。
- 已有 scoped unique indexes 是 lookup 邊界；URL 改名不增加 registry/table/cache，也不藉 namespace 掃描多個 owner 嘗試猜類型。
- Locator 只解析到 stable identity；可見性、資格與寫入權限仍由真正 owner 驗證。未測量 production latency，不以 route groundwork 宣稱效能 benchmark。

## Remaining decisions

啟用未完成項目時，同一 changeset 需具備 owner contract、schema/index 與必要資料處置、public query/command、route/navigation、拒絕與 cross-scope tests，再更新 current semantic status。此 decision 的對應項目應在實作後移入 current owner/reference，避免維持兩份 current truth。
