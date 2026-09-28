# GitHub workflows

GitHub 是執行入口；`scripts/` 擁有可執行流程，`package.json#scripts` 是共用命令介面。
YAML 只設定 event、runner、權限、checkout/setup、job 相依、resource concurrency、step-scoped secrets 與 artifacts。

| Workflow | 觸發 | 工作 |
| --- | --- | --- |
| `workflows/validate.yml` | PR / Release reusable call | 呼叫 `pnpm check` 或 `pnpm validate --group`，最後呼叫 scripts 中的 aggregate gate。 |
| `workflows/release.yml` | push 到 `main` | 同時啟動 validation 與 `pnpm github:release-plan`；依 operation 自己尚未發布的 source 執行。 |

```text
main push (exact SHA)
  ├─ scripts/tooling/validate.mjs → all groups success
  └─ scripts/github/release-plan.mjs → pending sources per operation
       ├─ Rich Menu assets/code → current-main → scripts/line/rich-menu/sync.ts
       ├─ supabase/schemas SQL → current-main → scripts/supabase/remote.mjs
       └─ Web build inputs → required schema success → scripts/vercel/deploy-production.mjs
            └─ required schema/Web success → scripts/attendance/scheduler.mjs
```

每個 external operation 都要求相同 SHA 的 validation 與 planning 成功。Rich Menu 不等待 Supabase、Web 或 Scheduler；圖片推到 main 後自動發布，無需手動 dispatch。「立即」表示自動觸發，實際時間包含 runner 排隊、驗證與 LINE API。

失敗不推進該 operation 的 successful baseline；後續 main push 仍會帶上尚未成功發布的內容。每次寫入前重新確認 current main，同一 provider resource 不並行寫入，也不取消已開始的 mutation。

Supabase 直接比較 `supabase/schemas/` 建出的 desired database 與遠端 application schema。同步不建立、replay、repair 或清除 migration history；驗收包含 second diff = 0、權限 readback 與 history fingerprint 不變。

命令、責任與本機操作見 [scripts](../scripts/README.md)；完整流程與證據邊界見 [Release](../docs/reference/operations/release.md)。
