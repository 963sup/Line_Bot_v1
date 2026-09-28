# Dependency boundaries

跨 boundary 前只回答四件事：consumer需要什麼、誰擁有、現有 public contract是否足夠、方向是否正確。

## Rules

- 跨 package只用 `package.json#exports`；`import type` 仍是 dependency。
- 禁止 deep import、`dist`、testing-only surface、internal generated artifact、其他 owner private schema/table。
- Domain不依賴 HTTP/SDK/database/environment/adapter。
- Application協調 use case；external capability透過 narrow port/public contract。
- Adapter實作 capability，不取得 lifecycle/authorization authority。
- `platform` / shared只放無 business authority、修改原因真正相同的 mechanism。
- Browser-reachable graph不得包含 secrets、database adapters、Node-only/server composition。

## Cross-owner choice

```text
stable ID / primitive fact
→ current owner query
→ owner command
→ committed event（只有真實 async consumer）
→ read projection
→ ACL / translation（上游模型會污染 local language）
```

Cycle出現時先找錯誤 owner/dependency，不新增 `common`/facade藏 cycle。Machine allowlist：`architecture/implementation-topology.json`。
