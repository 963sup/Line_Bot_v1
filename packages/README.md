# Packages router

從業務結果找到真正 Owner，再沿其 public contract 與 evidence 修改；package/folder 名稱不取代領域模型。

| 要做什麼 | 入口 |
| --- | --- |
| 修改任何 package | [開發契約](./AGENTS.md)；完整繼承 [root contract](../AGENTS.md) |
| 找目前 module、semantic owner 與 context status | [Generated packages semantics](./SEMANTICS.md) |
| 理解 Owner 的語言、能力與合作關係 | `packages/<owner>/SEMANTICS.md` → 該 Owner README/AGENTS 與 [owner contracts](../docs/owners/README.md) |
| 修改 scoped number 或 business name registry | [Numbering](../docs/owners/numbering.md) / [Namespace](../docs/owners/namespace.md)；resource lifecycle 與 authorization 仍查原 Owner |
| 查 DDD/六邊形詞義與選用模式 | [共用詞彙表](../docs/facts/glossary.md#ddd-策略建模) |
| 找修改影響與最小相關 context | bounded `rg`、package exports、source/tests；[task router](../docs/README.md) |
| 查所有 current modules 與 selected targets | 直接讀取 `architecture/registry.json#modules` |
| 查驗證與證據邊界 | [Validation rules](../docs/rules/validation-evidence.md) |

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
