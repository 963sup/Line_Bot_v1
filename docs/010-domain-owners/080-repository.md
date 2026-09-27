# Repository

Repository 是 User 或 Organization 擁有的獨立工作容器，並擁有容器內 collaboration truth。

## Owns

- Repository identity、visibility、access 與 User → Repository star。
- Issue lifecycle、assignment、Label、Repository Milestone、command receipt 與 event history。
- Discussion thread 與 comment。
- 由 Repository access/star facts 衍生的 discovery projection。

Project 只參照 Repository work，不取得 Issue/Discussion authority；Notifications 只投遞來源 reference，不取得 source truth。

Current runtime 已接線的 Repository resource read 包含：

- Repository owner/name read 與 accessible Repository discovery。
- Issue list/detail read 與 Issue command runtime。
- Discussion list/detail/comment read。
- Repository Label collection read。
- Repository Milestone list/detail read。

Repository create/rename/visibility、direct/Team access grant management，以及 Discussion、Label、Repository Milestone、IssueLabel 的 write management 都尚未宣稱 runtime 完成；這些 persisted facts 保留 Repository data authority，但 `line_app` 不因此取得未啟用的 mutation authority。Current runtime writes只包含 Issue create/transition（含 Repository-local issue number allocation）與 Repository star/unstar。

## Locator

Stable identity 是 `RepositoryId`。Repository owner 僅為 `User | Organization`，共用 Account-owned `login` namespace。

```text
/{ownerLogin}/{repositoryName}
/{ownerLogin}/{repositoryName}/issues
/{ownerLogin}/{repositoryName}/issues/{issueNumber}
/{ownerLogin}/{repositoryName}/discussions
/{ownerLogin}/{repositoryName}/discussions/{discussionId}
/{ownerLogin}/{repositoryName}/labels
/{ownerLogin}/{repositoryName}/milestones
/{ownerLogin}/{repositoryName}/milestones/{milestoneNumber}
```

Locator 只定位；protected read/write 仍重新驗證 current User 與 Repository access。`Issue.number` 與 `RepositoryMilestone.number` 是 Repository-local locator，`IssueId` 與 `RepositoryMilestoneId` 仍是 stable identity。Discussion URL 使用本產品 opaque `DiscussionId`，不採用 GitHub Discussion number。Label collection 以 Repository scope 讀取，沒有獨立 label URL locator。

HTTP transport 目前由 `/api/issues`、`/api/issues/{issueNumber}`、`/api/discussions`、`/api/discussions/{discussionId}`、`/api/repository-labels`、`/api/repository-milestones` 與 `/api/repository-milestones/{milestoneNumber}` 承接。Issue 保留既有 workbench/default repository、repository id 與 owner/name selector 行為；新增 Discussion、Label、Milestone read API 要求 `owner` + `name` selector 並重新解析 current effective access。

## Invariants

- 每個 Issue / Discussion 恰屬一個 Repository。
- Issue、Discussion、Notification 是不同概念；Discussion/Comment 不觸發 Issue lifecycle transition。
- Discussion comment 保留 author 與 creation time，不把 conversation 改寫成 Issue history。
- Star/unstar idempotent，且不授予 Repository access。
- Assignment 與 protected read/write 以 current effective Repository access 判斷。
- Organization-owned Repository 的 direct/Team grant 仍要求 current Organization qualification。
- Command 以 stable request identity 防重；conditional transition 使用 expected version。
- Event/history 是 durable evidence，不由 current snapshot 覆寫。

## Mapping

Runtime owner：`packages/repository`。Web presentation：`apps/web/src/modules/repository`。

Current persistence 的 relation authority 由
[`architecture/data-topology.json`](../../architecture/data-topology.json) 擁有；SQL definition 位於
[`600–631`](../../supabase/schemas/README.md) Repository / Issue / Discussion object group。

相鄰 owner：[Project](180-project.md) · [Notifications](090-notifications.md) ·
[Organization](030-organization.md) · [Authorization](../050-security/030-authorization.md)
