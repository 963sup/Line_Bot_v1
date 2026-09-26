# Namespace

## Purpose / strategic position

Namespace 是 current policy owner，處理多個 owner 或 runtime surface 共用同一命名空間時的 Scope、Locator、reservation 與 collision semantics。它的 business result 不是「集中管理所有名稱」，而是確保 human-readable locator 在明確 Scope 內可無歧義解析到 stable Subject，同時不把 locator 誤當 identity 或 authorization。

Namespace 不是 universal entity registry，也不因 package 存在就取得 Account、Repository、Team、Enterprise 或 Web route 的 lifecycle / data authority。Domain-local naming若只有單一 owner，就留在該 owner。

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Namespace | 在明確 Scope 內，Key 可唯一解析到 stable Subject 的命名邊界 |
| Scope | 決定 uniqueness 與 collision 比較範圍的 boundary，例如 global root、Account、Organization、Enterprise、Repository |
| Key | Namespace 內的 human-readable 或 ordinal locator value |
| Subject | 被 Locator 指向的 stable entity identity |
| Locator | Scope + Key 對 Subject 的可解析定位方式；不是 stable identity |
| Qualified Locator | 將必要 Scope 與 local Key 組合後可跨 boundary 表達的 locator，例如 owner + repository name |
| Reserved Key | 被平台/runtime claim、因此不能再分配給 namespace participant 的 Key |
| Claim | 在 Namespace 內把可用 Key 綁定到 Subject 的 intent |
| Resolve | 由 Locator 找到 Subject；resolve success 不代表 authorization success |

Cross-context canonical lookup 亦見 [Glossary](../000-core/050-glossary.md)。

## Owns

Namespace owns：

- shared cross-owner Namespace 的 scope / reservation / collision policy；
- stable Subject 與 mutable Locator 必須分離的跨 owner invariant；
- 判斷 naming problem 是 shared namespace 還是 owner-local namespace 的 policy boundary；
- 當多個 owner 或 runtime surface 競爭同一 Key space 時，誰可以 claim / reserve Key 的 canonical policy。

目前第一個 executable shared namespace 是 global root namespace：產品 static root routes 與 Account-owned User / Organization login 競爭同一第一層 locator space。

## Consumes / Consumers

Namespace 本身不取得其他 owner 的 private model。Current consumer：

- Account：先依 Account 規則 normalize login，再呼叫 Namespace root reservation contract；Account仍擁有 login persistence / rename / lifecycle。
- Web delivery：actual static root route inventory 是 namespace participant evidence；Web 不取得 Namespace policy authority。

Repository、Team、Enterprise 的 owner-local naming目前不依賴 Namespace runtime contract，因為它們各自已有單一 authority，沒有跨 owner collision responsibility。

## Current namespace topology

`architecture/semantic-model.json#locators` 是 current locator registry；下表是 human-readable ownership projection，不建立第二套 machine truth。

| Locator space | Current participants | Scope / uniqueness owner | Direct `@line-work/namespace` dependency |
| --- | --- | --- | --- |
| Global root + Account login | static root routes、User login、Organization login | Namespace owns root reservation/collision；Account owns login normalization/lifecycle/persistence；`account_logins.login` global unique | Account only |
| Enterprise slug | Enterprise | Enterprise；`enterprises.slug` global unique inside Enterprise locator space | No |
| Organization Team slug | Team under Organization | Team；`(organization_account_id, slug)` unique | No |
| Enterprise Team slug | Enterprise Team under Enterprise | Enterprise；`(enterprise_account_id, slug)` unique | No |
| Repository name | Repository under RepositoryOwner Account | Repository；`(owner_account_id, lower(name))` unique | No |
| Issue number | Issue under Repository | Repository；`(repository_id, number)` unique | No |
| Repository Milestone number | Repository Milestone under Repository | Repository；`(repository_id, number)` unique | No |
| Repository Label name | Label under Repository | Repository；`(repository_id, name)` unique；目前沒有 Label detail locator route | No |
| Discussion opaque id | Discussion under Repository URL scope | Repository owns Discussion identity; current opaque id remains separate from GitHub Discussion number semantics | No |

這個 dependency distinction 是刻意的：只有 shared policy 的 consumer 才依賴 Namespace public contract；owner-local namespace 透過自己的 Domain code/schema 維持 authority，再由 semantic locator registry 與 cross-owner tests證明 scope 沒有漂移。

## Does Not Own

Namespace does not own：

- User、Organization、Enterprise、Repository、Team 的 stable identity 或 lifecycle；
- Account login format、normalization、persistence、rename lifecycle、profile 或 qualification；
- Repository name normalization、rename、visibility、access 或 Repository lifecycle；
- Team slug generation / rename；
- Enterprise slug 或 EnterpriseTeam slug policy；
- Issue / Repository Milestone number allocation；
- Label name semantics；
- Next.js route implementation、navigation 或 deployment；
- authentication、authorization、membership、permission；
- generic `namespaces` table、cache、second store 或 universal registry。

相同「需要唯一」不等於相同 responsibility。只有 shared Scope / collision authority 真正跨 owner 時，才進 Namespace。

## Business invariants

1. **Stable identity ≠ Locator**：rename / route change 不得建立新的 stable Subject，也不得用 Locator 取代 stable ID。
2. **Uniqueness is scoped**：Key 只在 declared Scope 內比較 uniqueness；不同獨立 Scope 可合法出現相同字串。
3. **Shared namespace cannot double-claim**：同一 shared Scope 的同一 normalized Key 不得同時被兩個 Subject，或 Subject 與 Reserved Key claim。
4. **Reservation ≠ authorization**：平台保留 Key 只避免 locator collision，不授予 business access。
5. **Resolve ≠ qualification**：成功解析 Locator 只得到 Subject；current qualification / permission 仍由真正 owner 重新驗證。
6. **Owner-local policy stays local**：格式、normalize、slug derivation、rename、number allocation若只有單一 Domain authority，就不得搬到 Namespace 形成 horizontal God Module。
7. **One policy truth**：shared root reservation 的 machine Source of Truth 是 `packages/namespace/src/root.ts`；Account code直接消費，SQL / route checks只能 enforce / verify。

## Current implementation

`packages/namespace/src/root.ts` exports current global-root reservation contract：

- `ROOT_NAMESPACE_RESERVED_KEYS`
- `isReservedRootNamespaceKey(key)`

該 function要求 consumer先完成自己的 normalization；Namespace不接管 Account login格式。Account 的 `packages/account/src/domain/login.ts` 直接使用 public export，因此 TypeScript 不再保留第二份 reserved list。

Database enforcement仍位於 Account-owned `supabase/schemas/101_account_logins.sql`，因為 persisted login fact 屬 Account。它不是 Namespace policy authority；Namespace tests會比對 SQL enforcement list與 `src/root.ts`，並掃描 current App Router static root segments，確保新增 root route 不會默默變成可 claim login。

Current known compatibility / held reservations例如 `orgs`、`projects` 可以沒有同名 App Router directory；absence of a route不等於自動釋放既有 reserved Key。釋放需要明確 namespace decision與 compatibility assessment。

## GitHub benchmark

GitHub public GraphQL contract提供結構 benchmark，不是本產品 authority：

- `repository(owner, name)` 明確以 RepositoryOwner login + Repository name解析 Repository；
- `repositoryOwner(login)` 將 User / Organization統一投影成 RepositoryOwner locator；
- Repository exposes `nameWithOwner`，把 local name與 owner scope區分；
- Team exposes `slug` 與 `combinedSlug`，區分 local locator與 qualified locator；
- Enterprise Managed Users surface出現 `UserNamespaceRepository`，同時保留 `id`、`name`、`nameWithOwner`、`owner`；
- GitHub Enterprise Server另有 reserved usernames，顯示 platform-reserved keys與 User / Organization locator共享 root naming space。
- GitHub username / Organization rename 會釋放舊 account name，而 Repository rename redirect 有 Repository-specific行為；因此本產品不從 benchmark 推導 generic alias/history table，rename / release policy仍由真正 owner與真實 consistency requirement決定。

Relevant upstream sources：

- [schema-repos.json](https://github.com/github/docs/blob/main/src/graphql/data/fpt/schema-repos.json)
- [schema-teams.json](https://github.com/github/docs/blob/main/src/graphql/data/fpt/schema-teams.json)
- [schema-enterprise-admin.json](https://github.com/github/docs/blob/main/src/graphql/data/fpt/schema-enterprise-admin.json)
- [Reserved usernames](https://github.com/github/docs/blob/main/content/admin/managing-accounts-and-repositories/managing-users-in-your-enterprise/about-reserved-usernames-for-github-enterprise-server.md)

採用的是 `stable identity + scoped locator + qualified locator` principle，不複製 GitHub internal implementation或 software-hosting-specific semantics。

## Module / Data mapping

| Responsibility | Owner / source |
| --- | --- |
| Shared global-root reservation policy | `packages/namespace/src/root.ts` |
| Structured owner / module mapping | `architecture/semantic-model.json` + `architecture/implementation-topology.json` |
| Account login format / persisted fact | Account / `packages/account` / `account_logins` |
| Repository owner-scoped name | Repository |
| Organization Team slug | Team |
| Enterprise / EnterpriseTeam slug | Enterprise |
| Actual Web route implementation | `apps/web/src/app` |
| DB enforcement | owning persisted relation schema |

Namespace目前沒有 Data Boundary；有 executable policy不代表需要 `namespace` table。

## Current locator topology

Cross-context structured truth 由 `architecture/semantic-model.json#locators` 擁有；每個 locator 現在必須明確宣告 `scopeAuthority`，同一 `scope` 不得出現兩個 authority。Runtime dependency 只在 consumer 真正需要另一 owner contract 時成立，不因為「都有名字」就依賴 `@line-work/namespace`。

| Locator family | Scope authority | Namespace relationship |
| --- | --- | --- |
| User login + Organization login | Account | 共用 Account login namespace；global root reserved-key collision由 Namespace policy約束 |
| Enterprise slug | Enterprise | `/enterprises/{slug}` 下的 Enterprise-local locator，不占 global Account login namespace |
| Enterprise Team slug | Enterprise | Enterprise-scoped child namespace |
| Organization Team slug | Team | Team owns `(organization, slug)` uniqueness；Organization login由 Account canonicalize |
| Repository owner + name | Repository | Repository owns owner-scoped name；owner login由 Account canonicalize後再解析 |
| Issue / Discussion / Repository Milestone locator | Repository | Repository-local child namespace / locator |

因此 current runtime dependency graph刻意保持：

```text
Namespace → Account
Account → Organization locator consumer
Account → Team locator consumer
Account → Repository locator consumer

Enterprise / EnterpriseTeam local slug policy
→ remains Enterprise-owned

Organization Team local slug policy
→ remains Team-owned

Repository local name / number policy
→ remains Repository-owned
```

這不是少接 dependency，而是避免 Namespace 變成所有 identifier 的 God Module。

## Expansion rule

只有真實 shared responsibility出現才擴張 executable surface，例如：

- 多個 owner真正需要共同 claim / reserve / resolve；
- rename / release跨 owner需要明確 consistency / recovery responsibility；
- 第二種 shared namespace需要共用且相同的 policy primitive。

不得因為 Repository name、Label name、Team slug、Issue number都「像 namespace」就預建 generic manager / port / adapter。Project.name 目前沒有 scoped uniqueness / active locator；Expense.number 是 persistence identity，且沒有 detail route，因此兩者都不因欄位存在而自動成為 Namespace participant。

## Validation

- `pnpm --filter @line-work/namespace build`：只證明 package compile / emit。
- `pnpm --filter @line-work/namespace typecheck`：只證明 Namespace source + tests type correctness。
- `pnpm --filter @line-work/namespace test`：驗 current root reservation、route inventory coverage、SQL enforcement parity，以及 User/Organization/Enterprise/Team/Repository 等 scoped locator ownership closure。
- 一般 repository change仍以 `pnpm check` 為 canonical fast validation；merge / release前跑 `pnpm validate`。
