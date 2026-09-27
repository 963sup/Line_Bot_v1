# Repository

Read this file for the Repository owner boundary and invariants. Load [detailed reference](../reference/domains/repository.md) only when the task needs lifecycle / command / locator details.

## Owns

- Repository identity、visibility、access、User → Repository star，以及 User-owned Repository Star List / List membership。
- Issue lifecycle、assignment、Label、Repository Milestone、command receipt 與 event history。
- Discussion thread 與 comment。
- 由 Repository access/star facts與 immutable Issue events 衍生的 discovery / Trending / Activity projection；projection 不取得新的 business authority。

Project 只參照 Repository work，不取得 Issue/Discussion authority；Notifications 只投遞來源 reference，不取得 source truth。

Current runtime 已接線的 Repository resource read 包含：

- Repository owner/name read 與 accessible Repository discovery。
- Repository Star List：User 對自己 current Stars 的 curated grouping；List create 預設 private、publish 顯式切為 public，item add 要求 current Star + current Repository access，List membership 不授予 Repository access。
- Explore discovery read：Trending 以目前仍有效且最近 7 天建立的 Star 數優先，再以總 Star/name/id 穩定排序；Activity 第一版只投影 immutable Issue lifecycle events；published Repository Star List discovery 只收 active owner 的 public Lists，且至少有一個 viewer 當下可見 Repository。所有 projection 都在 read 時重新核驗 current visibility/access。
- Issue list/detail read 與 Issue command runtime。
- Discussion list/detail/comment read。
- Repository Label collection read。
- Repository Milestone list/detail read。

Repository create 已啟用；rename/visibility、direct/Team access grant management，以及 Discussion、Label、Repository Milestone、IssueLabel 的一般 write management 尚未宣稱 runtime 完成。Create 第一版固定 `private`：active User 可在自己名下建立；Organization-owned Repository 必須由 current effective `OrganizationOwner` 建立，且同一 transaction 建立 creator 的 direct `admin` access。User-owned Repository 依 existing effective-access projection由 current active owner取得 admin，不重複寫 direct grant。Current runtime writes包含 Repository create、Issue create/transition（含 Repository-local issue number allocation）、Repository star/unstar，以及 Repository Star List create/update/publish/unpublish/item add-remove/delete。

## Invariants

- 每個 Issue / Discussion 恰屬一個 Repository。
- Issue、Discussion、Notification 是不同概念；Discussion/Comment 不觸發 Issue lifecycle transition。
- Discussion comment 保留 author 與 creation time，不把 conversation 改寫成 Issue history。
- Star/unstar idempotent，且不授予 Repository access。
- Repository Star List item 只能存在於同一 owner User 的 current Star 上；Unstar 會以 declarative FK cascade 移除該 Repository 的 List memberships，但不刪除 List。
- Private List 只對 owner 可讀；public List metadata 可被 discovery 使用，但任何 Repository item 仍以 viewer 的 current visibility/access 重驗，raw hidden item count 不得對 viewer 洩漏。
- Repository Star List `version` 保護直接 List command concurrency；Star prerequisite 消失造成的 FK cascade 是外部 prerequisite invalidation，不冒充直接 List command version transition。
- Assignment 與 protected read/write 以 current effective Repository access 判斷。
- Organization-owned Repository 的 direct/Team grant 仍要求 current Organization qualification。
- Command 以 stable request identity 防重；conditional transition 使用 expected version。
- Event/history 是 durable evidence，不由 current snapshot 覆寫。
- Discovery ranking/read model 只衍生既有 Repository/Star/Event truth；不得反向成為 Repository、Star 或 Issue authority。
- Activity event 曾經存在不代表現在仍可見；exposure 永遠以 current effective Repository access 重驗。

## Mapping

Runtime owner：`packages/repository`。Web presentation：`apps/web/src/modules/repository`。

Current persistence 的 relation authority 由
[`architecture/data-topology.json`](../../architecture/data-topology.json) 擁有；SQL definition 位於
[`600–631`](../../supabase/schemas/README.md) Repository / Issue / Discussion object group。

相鄰 owner：[Project](180-project.md) · [Notifications](090-notifications.md) ·
[Organization](030-organization.md) · [Authorization](../050-security/030-authorization.md)
