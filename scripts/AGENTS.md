# Repository scripts scope

Root `package.json#scripts` is the shared public command surface; `scripts/` implements repository operations. Each command has one observable result, real consumer and side-effect boundary. Product rules and persistence authority remain with their existing owners.

## Governing files

完整 authority 與讀取條件繼承 [root context contract](../AGENTS.md#effective-context-contract)；本檔只增加 local constraints，不另存 governing 清單。

Local code、workflow、schema 或 guard 不得繞過、弱化或重定義這些 governing inputs；若發生 violation，先修真正 Owner / Truth / Boundary / Dependency。

## Ownership

Before adding or moving code, identify its consumer, command, owner, source of truth and failure/recovery boundary. Reuse existing capabilities. Do not create generic wrappers, managers or abstractions to shorten YAML or reduce file counts.

Group code by independent operation responsibility; colocate tests. Share mechanisms only when real consumers need them. CLI argv/env/output adapters do not become business owners.

## Naming

- command、script 與目錄名稱表達一個可觀察的 operation/result（例如 `semantic-context`、`schema-check`），不使用 `manager`、`helper`、`common` 或 provider-name-only 的萬用入口。
- provider 名稱只在 adapter 真正只負責該 provider protocol 時出現；名稱不能把產品規則或 authority 移進 scripts。
- 舊命令是 public command surface；改名必須同一變更同步 root scripts、workflow、文件與真實 consumer，不能靠 alias/wrapper 迴避 Owner 邊界。

## Workflow contract

GitHub workflows invoke commands and own GitHub setup/routing/secrets/artifacts. Scripts own testable source classification and complete provider operations. Source changes trigger only the corresponding operation; no unconditional remote repair or unrelated-provider dependency.

Supabase schema publication consumes `packages/integration-supabase/src/schemas/*.sql`, applies the declared remote diff without migration history, and verifies the result. Rich Menu publication consumes its images/code and publishes once. Historical compatibility/data conversions are not part of either normal publication path.

## Safety / validation

- Read-only commands do not mutate remote state. Mutation names and inputs express authorization and exact targets.
- Preserve locks, transactions, bounded failures and post-write readback. Do not invent business metadata or touch provider-owned schemas.
- General check/validate stays secret-free and does not probe or mutate production.
- 所有 script 預設遵守 root bounded-output invariant：成功 stdout 只含穩定摘要；高量子程序 stdout/stderr 寫入 ignored artifact；失敗只回傳固定 bytes／行數的 root-cause excerpt 與 artifact path。不得無條件 `inherit` 高量子程序輸出，亦不得以 nested 規則放寬上限。
- Machine-readable mode 只輸出完成判斷所需欄位；大量 records 要求 caller 明確縮小 scope、分頁或寫入 artifact。診斷擴展必須針對單一失敗 owner／stage，不可重新傾倒全量 log。
- Generated evidence is reproducible and transient; it is not business authority or migration history.
- Preserve existing user changes. Update affected package commands, workflows, documentation and tests together.
- Run affected tests, `pnpm check` and documentation checks; release/merge requires `pnpm validate`. Report local and external evidence separately.
