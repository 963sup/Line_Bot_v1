# GitHub operation scripts
本 scope 是 `.github/` GitHub integration contract 的 executable implementation；authority仍由 [GitHub integration](../../.github/AGENTS.md) 與 canonical release docs定義。
## Owns
- Read-only GitHub Actions / branch evidence retrieval。
- Release routing 所需的 owner-specific baseline selection、changed-source classification與 dependency planning。
- 可重用的 current-`main` / exact-SHA GitHub evidence check。
## Must not own
- Supabase reconciliation / migration-history semantics。
- Vercel deployment / recovery semantics。
- LINE Rich Menu definition、desired state或publication transaction。
- Product business rule、authorization transition或provider credential policy。
## Structure
- 每個 CLI只對應一個 operation responsibility；argv/env/output adapter與可測試 behavior可在同檔案內，但不得建立無第二 consumer或無 technology/policy boundary的 wrapper。
- GitHub API transport若被兩個以上 operation真實重用，可共用 read-only capability；不得把 provider-specific policy塞進 transport helper。
- Release planning輸出只描述 routing facts，例如 pending owner、changed state與真實 dependency；不直接執行 external mutation。
- Web affected 判斷以 Turborepo `@line_bot_v1/web#build` graph 為 build dependency Source of Truth；不得再維護平行的 general path denylist。只有具明確 semantic owner 的 publication-only source 可作 bounded override。
- Current-main check只證明 supplied exact SHA仍是 repository `main`；不順手判斷 provider readiness。
## Safety
- Read-only GitHub token即可完成本 scope operation；不得要求 contents/actions write permission。
- Network/readback failure fail closed。
- Release baseline只接受 current target SHA的 ancestor，且必須使用對應 owner job的成功 evidence；不同 owner不得共用 cursor。
- 不建立 receipt作新的 authority；GitHub run/job readback與Git history是 operation evidence。
## Validation
Behavior由同目錄 tests驗；`scripts/tooling/check-tooling.mjs`只驗 workflow經 canonical command進入本 scope且未內嵌同一套 planning implementation。
