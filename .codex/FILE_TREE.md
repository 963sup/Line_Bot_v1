# `.codex` 檔案樹與用途

**Owner：** Codex runtime architecture（L2–L6）  
**用途：** 以一份可導航的索引說明每個 runtime contract、catalog、schema 與支援腳本的責任邊界。  
**非用途：** 不取代各目錄的 `README.md`、`AGENTS.md` 或 repository 的 L1 authority。

## 檔案樹

```text
.codex/
├── AGENTS.md                 # runtime scope constraints；所有 .codex 子樹的 local guard
├── README.md                 # 六層架構總覽、Owner 與 context-loading 路由
├── SYSTEM_ARCHITECTURE.md    # L1–L6 layer map 與責任分離
├── ORCHESTRATION.md          # L2 Primary 如何選 scope、role、route 與 evidence
├── AGENT_ROLES.md            # L3 role taxonomy 與 executor selection rule
├── ATOMIC_INSTRUCTIONS.md    # Atomic mission、input、deliverable、stop、evidence contract
├── CAPABILITIES.md           # L4 capability route、preflight、state 與 evidence boundary
├── WORKFLOWS.md              # L5 workflow composition；不新增 role
├── HANDOFF_PROTOCOL.md       # L5 task-packet / handoff-result interchange contract
├── VALIDATION.md             # L6 claim-to-evidence routing 與 acceptance protocol
├── TASK_ROUTING_EXAMPLES.md  # 常見任務從 L1 到 L6 的可操作範例
├── config.toml               # Codex runtime、subagent defaults、MCP transport configuration
├── agents/
│   ├── AGENTS.md             # profiles 的 local constraints
│   ├── README.md             # executor profile catalog、naming、model boundary
│   └── l3-*.toml             # 七個 enabled executor profiles；每個 profile 一個 effect boundary
├── catalog/
│   ├── AGENTS.md             # catalog local constraints
│   ├── README.md             # candidate / enabled / retired promotion rules
│   ├── role-catalog.json     # 角色 taxonomy；只有 enabled role 可對應 profile
│   └── atomic-catalog.json   # Atomic task contracts；只有 enabled Atomic 可 dispatch
├── rules/
│   ├── AGENTS.md             # command-safety local constraints
│   └── README.md             # rules 的責任與使用方式
├── schemas/
│   ├── AGENTS.md             # machine-contract local constraints
│   ├── README.md             # schema index 與 interchange boundary
│   └── *.schema.json         # task packet、handoff、route、evidence plan 等 machine contracts
└── scripts/
    ├── AGENTS.md             # runtime support script constraints
    ├── README.md             # launcher / runtime helper catalog
    └── README.md             # runtime support directory contract（Serena 使用官方 executable）
```

## 進入與驗證規則

| 要回答的問題 | 先讀 | 主要驗證 |
| --- | --- | --- |
| 要由誰負責、範圍如何切 | `ORCHESTRATION.md`、`AGENT_ROLES.md` | catalog static checks |
| 要選哪個工具或 MCP | `CAPABILITIES.md` | route preflight + bounded result |
| 如何交接給另一個 role | `WORKFLOWS.md`、`HANDOFF_PROTOCOL.md` | schema validation |
| 如何證明結果 | `VALIDATION.md`、repository validation rules | claim-specific evidence |
| 要修改 role/profile | `agents/README.md`、`agents/AGENTS.md` | `pnpm tooling:check` |
| 要修改 catalog/JSON schema | 對應 `catalog/` 或 `schemas/` contract | `pnpm tooling:check`、`pnpm docs:check` |

`.codex` 內的文件只描述 Codex runtime 的協作方式。產品業務語意、授權、資料 schema、架構 topology 與測試仍以 root `AGENTS.md` 指定的 repository authority 為準。
