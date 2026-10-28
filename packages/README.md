# Packages router

從業務結果找到真正 Owner，再沿其 public contract 與 evidence 修改；package/folder 名稱不取代領域模型。

| 要做什麼 | 入口 |
| --- | --- |
| 修改任何 package | [開發契約](./AGENTS.md)；完整繼承 [root contract](../AGENTS.md) |
| 找目前 module、semantic owner 與 context status | [Generated packages semantics](./SEMANTICS.md) |
| 理解 Owner 的語言、能力與合作關係 | 先由 `architecture/registry.json#modules` 取得 `semanticOwner`，再讀 selected module 的 `SEMANTICS.md`、README/AGENTS 與 [owner contracts](../docs/owners/README.md) |
| 修改 scoped number 或 business name registry | [Numbering](../docs/owners/numbering.md) / [Namespace](../docs/owners/namespace.md)；resource lifecycle 與 authorization 仍查原 Owner |
| 查 DDD/六邊形詞義與選用模式 | [共用詞彙表](../docs/facts/glossary.md#ddd-策略建模) |
| 找修改影響與最小相關 context | bounded `rg`、package exports、source/tests；[task router](../docs/README.md) |
| 查所有 current modules 與 selected targets | 直接讀取 `architecture/registry.json#modules` |
| 查驗證與證據邊界 | [Validation rules](../docs/rules/validation-evidence.md) |

## Owner-first batch workflow

每次跨檔案整理固定沿同一條路徑，讓語意工具可以按 owner 限定範圍：

1. 從 `architecture/registry.json#modules` 取得 target module 的 `semanticOwner`；owner ID 不直接由資料夾名稱推導。
2. 讀該 owner 的 `docs/owners/<owner>.md`、package `README.md`、nearest `AGENTS.md` 與 `package.json#exports`。
3. 由 exports、references 與實際 consumers 決定批次範圍；provider／database 技術內容回到 integration package，business rule 回到 owner package。
4. 只修改 canonical source 與必要的 cross-package index；不在 `docs/reference`、owner docs、README 之間複製同一規則。
5. 以 owner tests、affected typecheck/lint、`check:repository`、`patch` 與 diff/reference 搜尋完成驗收。

批次修改不以「所有 package 都有相同目錄」為完成條件；只有真實 consumer、獨立責任或可驗證的 dependency boundary 才建立新檔案或新 abstraction。沒有對應 owner、source 或 consumer 的文件／task 歸為 stale candidate，先確認引用後才刪除。

## Authority routing

| 真相 | Canonical owner |
| --- | --- |
| GitHub GraphQL domain semantics | [Pinned FPT JSON](../architecture/fpt/)；[provenance](../architecture/fpt-source.json) |
| Product owner、invariant、relationship、capability、context | [Semantic model](../architecture/registry.json#domain) |
| Module path/kind、dependency allowlist、selected targets | [Implementation topology](../architecture/registry.json#modules) |
| Persisted relation authority / projection / reference | [Data topology](../architecture/registry.json#data) |
| SQL / constraints / RLS | [Declarative schemas](../packages/integration-supabase/src/schemas/README.md) |
| Public package surface | 各 package 的 `package.json#exports` |
| Dependency / formatting / reachability checks | [Dependency Cruiser](../.dependency-cruiser.mjs)、[Biome](../biome.json)、[Knip](../knip.jsonc) |

DDD/六邊形的 responsibility、placement、consistency 與完成規則只由 [AGENTS](./AGENTS.md) 擁有。本 README 不複製模板、手工 inventory 或另一套 change rules。

## Generated semantics

根層 SEMANTICS 提供精簡的跨 package 索引；Owner-local SEMANTICS 提供各自語言、能力與 relationship。兩者由同一組 canonical models 產生：

```bash
pnpm exec biome check architecture
```

Generated projection 可查閱，不作獨立語意 authority，也不證明 capability、DDD 分層或 runtime 已驗收。Selected targets 的完整資料直接從 topology JSON 按需取得。
