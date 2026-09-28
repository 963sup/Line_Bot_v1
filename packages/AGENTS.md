# Packages scope

`packages/<module>` 是正式 Module Boundary。所有 package 都依 DDD + Hexagonal Architecture 管理 responsibility、language、invariant、contract 與 adapter；但 **Package ≠ Bounded Context ≠ Data Boundary ≠ Consistency Boundary**，不得用資料夾名稱直接推導其他 boundary。

本檔是所有 `packages/*` 的共同 execution contract。Child `AGENTS.md` 只能增加 owner-local constraint，不得重寫或削弱本檔。

## Governing authority

處理任何 package 前，依下列 authority 解出真實狀態，不得反向修改 governing source 來配合 implementation：

1. `architecture/semantic-model.json`
   - Product semantic authority。
   - 解出 semantic owner、Bounded Context、concept、relationship、capability、invariant、policy、integration mode、truth registry。
2. `architecture/implementation-topology.json`
   - Module implementation authority。
   - 解出 package path、`moduleKind`、`semanticOwner`、`allowedWorkspaceDependencies`。
3. `architecture/data-topology.json`
   - Persisted relation ownership authority。
   - 解出 authoritative relation、projection/reference、schema file 與 semantic owner 對應。
4. `package.json#exports`
   - Package public source boundary。
   - 只有明確 export 的 capability 才可被其他 workspace consumer 使用。
5. Source / tests / declarative schema
   - 實際 behavior、enforcement 與 evidence。

`architecture/semantic-benchmark.json` 只是 pinned external semantic evidence。它不是 Product authority；任何 GitHub-like concept 必須先在 `semantic-model.json` 有 explicit product mapping 才能進 package language 或 responsibility。

`.dependency-cruiser.mjs`、`biome.json`、`knip.jsonc` 是 governing enforcement config。一般 feature / refactor / CI 修復 **不得修改它們來消除違規**；只有任務本身明確是「修改治理規則」且有新的 canonical requirement 時才可變更。

## Mandatory package resolution

修改 `packages/<module>` 前，必須先從 machine-readable truth 解出以下欄位；任何欄位無唯一答案時先處理 architecture ambiguity：

```text
Module
├─ path
├─ moduleKind
├─ semanticOwner
├─ owned concepts / capabilities / invariants
├─ consumed relationship contracts
├─ does-not-own responsibilities
├─ allowedWorkspaceDependencies
├─ authoritative persisted relations
├─ projections / references
├─ public package exports
└─ validation evidence
```

判斷順序固定：

```text
Business intent
→ Semantic owner
→ Relationship / contract
→ Module owner
→ Data owner
→ Public surface
→ Adapter / runtime implementation
→ Validation evidence
```

禁止從 `src/adapters`、table name、route、UI 名稱或現有 import 反推 owner。

## Canonical Hexagonal template

Package 依真實 responsibility 使用下列角色。沒有 responsibility 就不建立空 layer；一旦角色存在，就必須遵守 dependency direction。

```text
packages/<module>/
├─ AGENTS.md          # owner-local constraints only
├─ README.md          # local routing only
├─ package.json       # exact public exports
├─ src/
│  ├─ domain.ts | domain/
│  │  └─ business truth, invariant, value, transition
│  ├─ contracts.ts | contracts/
│  │  └─ published DTO / stable contract where truly required
│  ├─ application.ts | application/
│  │  └─ use-case orchestration + consumer-owned ports
│  ├─ adapters/
│  │  └─ SQL / SDK / HTTP / provider implementations; package-private
│  ├─ agents/
│  │  └─ AI/provider mechanism only when owner responsibility requires it
│  ├─ testing/
│  │  └─ test-only capability; never runtime
│  └─ <public-capability>.ts
│     └─ named public composition entry when an adapter capability must be exposed
└─ test/
   └─ owner behavior / contract / integration evidence
```

### Domain

`domain.ts` / `domain/` owns business meaning、invariant、state transition 與 domain error semantics。

Hard rules enforced by Dependency Cruiser：

- Domain 不得 import `contracts`、`application`、`adapters`、`agents`、`testing`、`database`、`migration`。
- Domain 不得依賴 runtime/provider implementation。
- Persisted shape 不得反向定義 Domain Model。

### Contracts / Ports

`contracts` 表達 stable published language / DTO；Application port 表達 **consumer 真正需要的 capability**。

- Contract 可依賴 Domain，但不得依賴 Application / Adapter implementation。
- Port 不得只是 SQL client、SDK 或 foreign private API wrapper。
- Cross-owner need 必須能追到 `semantic-model.json#relationships`；consumer need 不轉移 provider authority。
- Integration mode 只能使用 semantic model 已定義的 stable identity、query、command、event、projection、snapshot、reference、external proof 等語意。

### Application

Application 只做 use-case orchestration：

- 可協調自己的 Domain / Contracts / Ports。
- 不得 import 自己的 concrete Adapter。
- 不得 import foreign package 的 `application/` source。
- 跨 owner interaction 必須透過 topology 允許的 dependency + 對應 relationship contract。
- Authorization、replay、transaction、version、tenant/data isolation 等 essential invariant 不得為了簡化 use case 被移除。

### Adapters

`src/adapters/**` 是 package-private implementation：

- 只負責 SQL / SDK / HTTP / provider translation 與 runtime mechanism。
- 不擁有新的 business truth。
- 不得被其他 package 或 app 直接 import。
- 不得成為 `package.json#exports` 的直接 target。
- 同 package 內可被 public composition entry 以 **具名 re-export** 暴露必要 constructor/capability。

當外部 composition root 必須建立 concrete adapter，使用：

```ts
// src/postgres.ts
export { PostgresExampleStore } from "./adapters/postgres.js";
```

搭配 exact export：

```json
{
  "exports": {
    "./postgres": {
      "types": "./dist/postgres.d.ts",
      "default": "./dist/postgres.js"
    }
  }
}
```

禁止：

```ts
export * from "./adapters/postgres.js";
```

也禁止 consumer 使用：

```text
@line_bot_v1/example/adapters/postgres
packages/example/src/adapters/postgres.ts
packages/example/dist/...
```

Public entry 是 Module Boundary，不是第二個 implementation；不得加入 forwarding service、compatibility facade 或 alias layer。

## Dependency contract

Dependency direction 同時受 `implementation-topology.json` 與 `.dependency-cruiser.mjs` 約束：

- Workspace dependency 必須存在於 `allowedWorkspaceDependencies`。
- `package.json` dependency 與 topology allowlist 必須一致；不得有 undeclared 或 stale dependency。
- 跨 package 只能使用 exact `package.json#exports`。
- 禁止跨 package relative import。
- 禁止 package import app。
- 禁止 cycle。
- 禁止 source import `dist` / `.next`。
- `testing` surface 不得進 runtime graph。
- Consumer 不得直接讀 foreign owner table/private schema 取代 contract。

新增 dependency 前先回答：

```text
Consumer 真正需要什麼？
→ semantic relationship 是否存在？
→ provider authority 是誰？
→ consumer-owned port 是否需要？
→ 現有 public contract 是否已足夠？
→ topology 是否允許方向？
```

沒有明確 relationship / responsibility，不新增 dependency。

## Data boundary

`data-topology.json` 與 `supabase/schemas/*.sql` 共同約束 persisted implementation：

- 每個 authoritative relation 只能有一個 semantic owner。
- Relation owner 必須和 concept owner 一致。
- Projection / reference 不得升格成第二份 business truth。
- Cross-owner mechanism 不得擁有 business truth。
- Adapter 只能操作 owner 合法持有或明確授權的 data surface。
- Transaction / consistency boundary 由 invariant 決定，不由 package/table 數量決定。

Schema source of truth 永遠是 `supabase/schemas/*.sql`；package code 不得建立第二套 schema truth。

## Public API contract

`package.json#exports` 是唯一 package public surface。

每個 export 必須：

- exact path；禁止 wildcard export。
- target `./dist/**` 的 build artifact，由 source mapping 對回 `src/**`。
- 對應真實 consumer 或外部 technology boundary。
- 以具名 export / re-export 明確列出 symbol。
- 不暴露 private adapter source、internal generated file、testing-only surface 給 runtime consumer。

刪除最後 consumer 後，同步評估刪除 export、source entry、dependency 與 dead code；不保留 compatibility surface。

## Biome contract

`biome.json` 是 formatting / import organization / selected lint rule authority：

- 不手工保留違反 formatter 的 layout。
- Import / export order 以 Biome organizeImports 為準。
- 不留下 unused import、unreachable code、duplicate keys/cases、debugger。
- 修改後先修 source，不修改 Biome config 逃避違規。

## Knip contract

`knip.jsonc` 是 reachability authority：

- Package exports 與設定的 layer/test entries 都進 reachability analysis。
- Unused file / export / exported type 必須先確認真實 consumer；無 consumer 就刪，不用 ignore 掩蓋。
- Unresolved import 必須修 public contract / source placement，不新增 compatibility alias。
- Duplicate implementation / superseded barrel 位於本次路徑時直接移除。
- 不為「以後可能會用」保留 speculative entry。

## Documentation contract

每個 `packages/<module>`：

- `AGENTS.md`：只寫 owner-local Owner / Boundary / Invariant / Change Rule / Validation delta。
- `README.md`：只做 package-local navigation，指向 authoritative source；不複製 semantic model、topology、schema、exports inventory。
- Global package template 只存在本檔與 `packages/README.md`；child 不複製 parent boilerplate。

## Change procedure

每次 package change 固定執行：

1. 讀 semantic owner / relationship / invariant。
2. 讀 implementation topology 的 moduleKind / allowed dependencies。
3. 讀 data topology 的 owner / projection / relation mapping。
4. 讀 package `package.json#exports` 與實際 consumer。
5. 沿 dependency/runtime/data flow 找 root cause。
6. 先修 owner / source of truth，再修 consumer。
7. 移除本路徑內 duplicate、dead compatibility、stale export。
8. 不修改 governing config 來讓錯誤消失。
9. 重新檢查整條 execution path。

若修法需要 alias、wrapper、ignore、fallback 或第二份 truth 才能成立，回到 Root Cause / Ownership / Boundary 重新判斷。

## Validation

依 evidence class 分開描述，不互相冒充：

- Formatting / lint：`pnpm lint`
- Module / dependency：`pnpm boundaries`
- Semantic + architecture：`pnpm architecture`、`pnpm architecture:test`
- Reachability：`pnpm deadcode`
- Type：`pnpm typecheck`
- Behavior：`pnpm test`
- Build：`pnpm build`
- 一般 repository gate：`pnpm check`
- Merge / release full gate：`pnpm validate`

任何 CI failure 都讀實際 Job Log，修最早有效 failure；不得以修改 `.dependency-cruiser.mjs`、`biome.json`、`knip.jsonc` 降低標準。
