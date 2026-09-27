# Fix a bug

## Load

1. Root + nearest `AGENTS.md`.
2. Affected owner contract。
3. 只有 failure涉及的 cross-cutting rule（authorization / database write / runtime / external effect）。

不要先讀完整 architecture、platform或Governance。

## Work

```text
repro input
→ observable failure
→ consumer
→ contract
→ dependency
→ owner
→ source of truth
→ original trigger
```

先建立能區分修正前後的 evidence。若 bug涉及 permission、state transition、replay/version、tenant isolation或external side effect，同時驗拒絕、retry、partial/unknown-result path。

## Finish

跑最小能證明根因的 test，再跑 `pnpm check`；merge前 `pnpm validate`。
