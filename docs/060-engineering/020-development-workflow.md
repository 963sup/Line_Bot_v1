# Development workflow

## Codex project development

共用工作行為只由 repository AGENTS 維護；Codex config/rules/agents/skills 是工程工具設定，不是產品契約，也不證明目前工作階段已載入。

## Project configuration

- `.codex/config.toml`：專案 Codex 設定；agent concurrency 是上限，不是每次都要委派。
- `.codex/agents/`：專案角色責任；當前工具權限與使用者指示優先。
- `.codex/rules/default.rules`：只約束列出的 command patterns；不能取代 GitHub/Supabase/LINE 等實際平台授權。
- `skills-lock.json`：專案 skill source/version metadata；skill 不取代 code/docs source of truth。

## Working principle

Agent 修改前仍須按 repository source priority 檢查 code / manifest / schema / tests / nearest AGENTS。Tool configuration 不建立 compatibility layer、business abstraction 或 architecture exception。

## Validation

修改 Codex config、agent、rules、skill metadata 時，使用 repository 現有 tooling checks，包括 `tooling:check`、必要的 `tooling:rules` 與 `docs:check`。

靜態檔存在或 test case 通過不證明新的 ChatGPT/Codex session 已實際載入；需要時在新 session 讀回當前 config/agents/skills。

一般程式與文件驗證入口見 `../040-tooling/010-validation.md`。


## Commit and PR workflow

Git history 保存可理解的工程決策，不保存完成工作的每一步操作。Commit 邊界由變更責任、驗證與 rollback boundary 決定，不由檔案數、行數、layer 或工作時間決定。

## Commit boundary

一個 commit 應同時滿足：

- 可以用一句話說明它改變的行為、契約或責任。
- 可以用對應的 test / static check / docs check 獨立驗證。
- revert 時只撤銷一個合理的工程決策，不需要連帶撤銷無關能力。
- 完成該決策所需的 code、tests、schema、docs 與 references 一起提交；不要為了讓 commit 變小而留下中間不一致狀態。

因此不要按「一個檔案一個 commit」或「一個 layer 一個 commit」切割。跨 `web / application / domain / infrastructure` 的單一 use case 可以是一個 commit；相反地，同一個大 commit 若同時改變互不相干的 authorization、Attendance、LINE asset 與 documentation taxonomy，應依責任拆開。

## Branch history

開發中的 branch 可以有 checkpoint、WIP、review fix 或暫時驗證 commit，但 merge 前應整理成 logical history：

1. 對原決策的補漏使用 `fixup`，在送出或合併前 autosquash 回 owner commit。
2. 全域 rename、reference synchronization、format follow-up 等若只是同一決策的完成條件，合併回該決策，不按檔案拆成多個永久 commits。
3. 暫時 workflow、scan、debug 或 verification artifact 若最終不屬產品／工程契約，移除後不要讓「加入」與「刪除」兩個互相抵消的 commits 留在 `main` history。
4. branch 同步 `main` 時優先保持線性歷史；只為解 conflict 或同步進度產生的 merge commit 不應成為永久工程決策。

一般 PR 目標是 1–3 個 logical commits。超過 5 個不是錯誤，但應重新檢查：是需求本身過大、存在多個 rollback boundaries，還是只是 fixup noise。數量只是 review signal，不是機械限制。

## When to split

出現以下任一情況時，優先拆 commit，必要時拆 PR：

- 不同 domain / module owner，且可以獨立交付或回滾。
- 不同 security / transaction / data-isolation 風險，需要不同驗證或 review。
- 一部分失敗時，另一部分仍應安全保留。
- commit message 需要用「以及」「順便」「同時」描述數個無共同 invariant 的改動。

不要為了製造漂亮歷史拆出 compatibility layer、wrapper、placeholder 或中間 abstraction。

## Commit message

沿用 repository 現有語意化格式：

```text
<type>(<scope>): <single decision>
```

`scope` 只在能準確表達 owner 時使用。標題描述完成後的結果，不描述操作過程，例如：

```text
feat(attendance): add replay-safe auto clock flow
docs(attendance): clarify work-session ownership
fix(identity): preserve membership when Google linking fails
```

避免永久歷史出現只描述過程的訊息，例如 `rerun check`、`fix link again`、`sync latest main`、`format follow-up`；這些通常應 fixup 到真正的 owner commit。

## Pull request and merge

PR 描述的是完整 change set；commit history 描述其中值得保留的獨立決策。Active iteration 與 remote CI intent 必須分開：開發／Agent 高頻修改期間 PR 保持 **Draft**，local commit 可以頻繁，但 push 應以 coherent checkpoint 為單位；Draft PR 的 synchronize 不配置 validation runner。準備取得 remote PR evidence 時才標記 **Ready for review**，由該 head SHA 執行 `pnpm check`。Ready PR 後續若再 push，視為新的 CI intent。

GitHub workflow 的原子邊界是獨立 trigger、permission、external effect 或 rollback responsibility，不是 YAML step 數量；checkout/setup/verify 的重複不足以建立 reusable workflow。只有已有至少兩個真實 consumer，且 inputs、permissions、failure semantics 一致時才抽 reusable owner。

- 預設使用 **Squash merge**，讓 `main` 保留一個完成的 change set。
- 只有 PR 內存在 2–4 個可獨立理解、驗證與 revert，而且保留各自歷史有實際價值的 commits 時，才使用 **Rebase merge**。
- 一般 feature / docs PR 不以 **Merge commit** 保存 branch topology；只有 topology 本身有需要保留的整合意義時才例外。
- 已經進入共享 `main` 的歷史不為了美觀 force rewrite；規則從後續變更開始適用。

## Validation

Commit 整理不能替代 repository validation，也不能藉 rebase / squash 隱藏失敗。

- 文件修改：`pnpm docs:check`
- 一般程式修改：`pnpm check`
- 合併／發布前：`pnpm validate`

實際驗證責任與證據邊界由 [Validation and tooling entry points](040-validation.md) 擁有。PR 應分開說明本地 static/test/build 與 deployment、remote API、LINE 真機等外部證據。
