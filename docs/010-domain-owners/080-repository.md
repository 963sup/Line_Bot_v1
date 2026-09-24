# Repository

Repository 是 User 或 Organization 擁有的獨立工作容器，並擁有容器內 collaboration truth。

## Owns

- Repository identity、visibility、access 與 User → Repository star。
- Issue lifecycle、assignment、Label、Repository Milestone、command receipt 與 event history。
- Discussion thread 與 comment。
- 由 Repository access/star facts 衍生的 discovery projection。

Project 只參照 Repository work，不取得 Issue/Discussion authority；Notifications 只投遞來源 reference，不取得 source truth。

## Locator

Stable identity 是 `RepositoryId`。Repository owner 僅為 `User | Organization`，共用 Account-owned `login` namespace。

```text
/{ownerLogin}/{repositoryName}
/{ownerLogin}/{repositoryName}/issues/{issueNumber}
```

Locator 只定位；protected read/write 仍重新驗證 current User 與 Repository access。`Issue.number` 是 Repository-local locator，`IssueId` 仍是 stable identity。

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
