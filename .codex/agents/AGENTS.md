# 模型分工與調度

本檔只擁有人類可讀的 role routing；runtime 共通限制見上一層。角色的 executable profile/權限以同目錄 TOML 為準。

## Models

- GPT-6 Astra (`gpt-6-astra`)：Primary orchestration；需要獨立最終 architecture / acceptance decision 時使用。
- GPT-5.6 Sol (`gpt-5.6-sol`)：repository mapping、root cause、architecture analysis、technical research、bounded implementation、diff review、evidence verification。

每個 role 只擁有一個 Primary Responsibility；新增 role 必須有獨立問題、deliverable、stop condition、validation。

## Routing

| Need | Role |
| --- | --- |
| 路徑未知 | `repository-mapper` |
| symptom 有、根因未知 | `root-cause-analyst` |
| Owner/Truth/Boundary/Dependency 分析 | `architecture-analyst` |
| current framework/provider/API/CLI facts (GitHub CLI, Supabase, Vercel, pnpm/Codex CLI) | `technical-researcher` |
| tooling / command-policy failure with unknown cause | `root-cause-analyst` |
| 已決定的 bounded source/schema/workflow/Codex-config change | `implementation-worker` |
| concrete diff defect/regression review | `diff-reviewer` |
| completion/evidence claim verification | `evidence-verifier` |
| 獨立最終 architecture decision | `architecture-decider` |
| 高風險最終 acceptance | `acceptance-decider` |

Primary GPT-6 可直接做 final decision；不為形式重派。只使用會改變決策或提升 acceptance confidence 的最少 roles。

## Constraints

- `repository-mapper` / `implementation-worker` 預設 medium reasoning；其餘 analysis/review/evidence/decision roles high。
- 最多 8 個 subagents；只並行可獨立驗收且不競爭同一寫入面的工作。
- 子代理不自行擴 scope 或再派工；owner/permission/research 缺口回報 Primary。
- 寫入代理保留他人修改；同 checkout 不並行寫同一檔案、migration order 或 generated output。
- Evidence 分開回報 static/test/build/deployment/API readback/device-runtime；未執行不得宣稱。
- 派工至少給 goal、scope、allowed/excluded paths、evidence、invariants、deliverable、stop、validation owner。

模型 ID / role files 以 repository current config/TOML 為 truth；解析成功不代表帳號可用、live reload 或 concurrency 已實測。

## Protected-branch delivery

- Deliver changes to `main` through a pull request; do not push directly to protected `main` or force-push shared history.
- Keep an in-progress change in Draft. Treat the required aggregate `validate` result as merge evidence only when it succeeded for the exact current PR head and the PR is based on current `main`; a new head or moved base invalidates that evidence. Exact event triggers and Draft/Ready behavior are owned by the [development workflow](../../docs/reference/engineering/development-workflow.md); follow that source and do not require a Draft toggle by default.
- When validation fails, inspect the job logs and fix the owning source, contract, dependency, or placement. Do not weaken governing architecture, data-boundary, dead-code, or test checks to obtain a green result.
- Merge only after the required `validate` check passes. Follow the repository merge method and read back the resulting `main` commit; report CI, deployment, remote-state, and device evidence separately.

The authoritative workflow and validation trigger details are in [development workflow](../../docs/reference/engineering/development-workflow.md) and [validation evidence](../../docs/rules/validation-evidence.md).
