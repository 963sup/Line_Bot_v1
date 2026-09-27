# Repository detailed reference

Low-frequency Repository details. The owner boundary and invariants remain canonical in [Repository](../../../010-domain-owners/080-repository.md).

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
/repositories/lists
/repositories/lists/{listId}
/repositories/lists/discover
```

`RepositoryStarListId` 是 globally stable opaque identity，也作 `/repositories/lists/{listId}` locator value；它不占用 Account login / Repository name namespace。Locator 只定位；protected read/write 仍重新驗證 current User 與 Repository access。`Issue.number` 與 `RepositoryMilestone.number` 是 Repository-local locator，`IssueId` 與 `RepositoryMilestoneId` 仍是 stable identity。Discussion URL 使用本產品 opaque `DiscussionId`，不採用 GitHub Discussion number。Label collection 以 Repository scope 讀取，沒有獨立 label URL locator。

HTTP transport 目前由 `/api/issues`、`/api/issues/{issueNumber}`、`/api/discussions`、`/api/discussions/{discussionId}`、`/api/repository-labels`、`/api/repository-milestones` 與 `/api/repository-milestones/{milestoneNumber}` 承接。Issue 保留既有 workbench/default repository、repository id 與 owner/name selector 行為；新增 Discussion、Label、Milestone read API 要求 `owner` + `name` selector 並重新解析 current effective access。

## Create

Canonical create surface 是 `/repositories/new`；API 使用 `POST /api/repositories`，owner picker 使用 `GET /api/repositories/owners`。Command 接受 stable `ownerAccountId` + `ownerKind`，不把 client-supplied login 當 authority。

- User owner 只能是 current active User 本人。
- Organization owner 必須是 active Organization 的 current effective `OrganizationOwner`；membership alone 不足。
- 第一版 visibility 固定 `private`，避免 schema enum 在產品語意尚未完成前被 UI 誤當已啟用 policy。
- `(owner_account_id, lower(name))` 保證 owner scope 內 case-insensitive uniqueness。
- create 使用 stable `requestId` + fingerprint + durable `repository_commands` receipt；exact replay先重新核驗 current actor/owner authority，再回同一 Repository。
- `line_app` 不取得 unrestricted Repository insert。Narrow `provision_repository(...)` coordinator在同一 transaction重驗 actor/OrganizationOwner並建立必要初始 access。
