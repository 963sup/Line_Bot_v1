# Validation
Repository validation 使用既有 scripts 作單一入口；不要把 typecheck、test、build、deployment、API probe 或手機驗收混成同一種證據。
`tooling:check` 與 `docs:check` 只檢查專案自有內容。`.agents/skills/` 是由 `npx skills` 與 `skills-lock.json` 管理的第三方套件，其編碼、metadata、範例與內部文件連結不套用專案內容規則；`.agents/AGENTS.md` 等專案治理文件仍須通過檢查。此邊界不代表外部技能已通過安全審查或可正常執行。

## Main commands
| Command | Responsibility |
| --- | --- |
| `docs:check` | Markdown structure、frontmatter/conflict markers 與 local file links 的機械檢查；不驗 remote URL、runtime behavior 或手機 |
| `schema:check` | `@line_bot_v1/platform` 執行 declarative schema source tests 與 PGlite clean-build / runtime-role / RLS contract tests；不代表 remote catalog 一致 |
| `lint` | `biome check .` 的 read-only static gate；驗 formatter、lint 與 assist/import ordering，不修改檔案 |
| `format` | `biome check --write .` 的 canonical local mutation；一次套用 formatter、safe lint fixes 與 assist/import ordering，之後再跑 read-only validation |
| `architecture` / `architecture:test` | dependency graph、runtime boundary、合法/違規反例 |
| `deadcode` | `knip` 的 repository reachability gate；檢查 dead file、unused export／dependency。finding 必須回到 owner／consumer／entry point 判讀，禁止用 broad `ignore` 消音 |
| `typecheck` | TypeScript contract |
| `test` | 適用 unit/integration/runtime tests |
| `build` | production build / framework compile |
| `tooling:check` | scripts、repository-owned AGENTS hierarchy、TOML、tooling metadata 與 GitHub workflow least-privilege / publication-order guard |
| `tooling:rules` | 需要既有 `CODEX_CLI` 的 Codex execpolicy semantic check；不納入一般 offline CI，也不執行被描述的業務操作 |
| `check` | 日常 fast feedback，含 lint、architecture 與 affected type/test |
| `validate` | merge/release 前完整 tooling/docs/lint/architecture/deadcode/type/test/build |

實際順序由 `scripts/tooling/validate.mjs` 與 package scripts 擁有；文件不複製 implementation 細節作 second source。VS Code workspace 使用 `.vscode/settings.json` 在 save 時套用同一 Biome formatter / organize imports；Agent／CLI 產出使用 `pnpm format`，CI 仍只做 read-only `pnpm lint`。

Biome 同時涵蓋 `knip.jsonc` 與 `architecture/**/*.json`，React Hooks 的呼叫位置與 effect dependencies 也納入 correctness gate。Knip 對 private workspace package 的 entry exports 檢查實際 repository consumer；未使用 export 應先區分內部宣告、必要公開契約與真正死碼，再收斂 public surface。
## Fast vs full validation
`check` 先依 Git 變更責任分流：純 Markdown 只跑 `docs:check`，所有 `AGENTS.md` 視為 tooling metadata 並額外跑 `tooling:check`，純 declarative schema 只跑 `schema:check`；產品／runtime source 進 Biome lint、architecture、Knip deadcode 與 Turbo affected type/test。Knip config／editor tooling 變更也會觸發對應 tooling/deadcode gate。無法可靠判斷範圍時保守退回完整 fast gates。root config / shared dependency 改動可擴張到整個 workspace；手動 filter 必須涵蓋所有 consumer，不以縮小 filter 隱藏跨 package failure。

GitHub Draft pull request 代表 active iteration，validation jobs 會 skip，避免每次 checkpoint push 都配置 hosted runner。PR 不是 Draft 時，`opened`、`synchronize`、`reopened`、`ready_for_review` 事件都會對該事件的 exact head 執行完整 validation matrix，涵蓋 fast gates，不重複執行 `pnpm check`。在 Draft 期間更新的 head，標記 Ready 後會執行完整驗證；Ready PR 後續 push 也會直接重新執行完整驗證，不需要 Draft → Ready toggle。Merge candidate 必須以目前 head 的 aggregate `validate` 成功為證據；head 或 base 改變後，舊證據不再適用。checkout 保留完整 Git history 供 Turbo 判斷 changed packages 與 transitive consumers；不在 workflow 手工維護 package path matrix。push 到 `main` 由 Release 呼叫同一 Validate workflow；`pnpm validate --group <name>` 的八組 matrix 與發布規劃並行，每組使用獨立 runner 與快取 key。Aggregate gate 只接受所有組 success，失敗、取消或跳過均不得發布。同 branch 被取代的驗證可取消，外部發布不取消。Local `pnpm validate` 保留完整順序執行，避免同目錄 Next.js 產物競爭。

`validate` 是完整 repository gate，不代表 deploy、migration、LINE API、Supabase remote project 或真機驗收已完成。PR affected check 與 main full validate 是不同證據，不以其中一者冒充另一者。

Full `validate` 可以驗 remote tooling contract tests，但不會 mutation Production，也不證明指定 remote 已收斂。External release 是另一層 evidence；publication trigger與 ordering由 [Release](../operations/release.md) 擁有，Supabase remote reconciliation semantics由 [Supabase](../platform/supabase.md) 擁有。

因此：

- `schema:check`／`schema:remote:test` 證明 schema／reconciliation code contract，不證明 remote current state。
- `pnpm validate` 證明 repository revision通過完整 gate，不等於 deployment。
- Release Supabase success才證明該 validated revision的 database contract已完成對應 remote readback。
- Vercel／LINE／provider／device evidence各自只證明自己的 external boundary。
## Concurrency

Web build 同時承擔 Sentry sourcemap 上傳，因此 `@line_bot_v1/web#build` 停用 Turbo 快取，避免重播產物而跳過上傳；其他 package build 仍可使用快取。`SENTRY_AUTH_TOKEN` 保留 passthrough，不納入 cache hash。未提供 Sentry 配置的本機 build 不證明上傳成功。

Type generation、test/build artifact 與 dependency install 在同一 checkout 可能競爭。驗證流程預設按 repository runner 順序執行；不要同時手動跑另一套會寫相同產物的 command。
## External-effect tools
以下可能需要明確環境／授權，不屬一般 offline validate：

- LINE / Supabase connection probes
- Redis probe（會建立/刪除 synthetic key）
- AI / receipt real provider probe（可能消耗 quota）
- Webhook set / restore
- Rich Menu publish / activate
- remote schema / data reconciliation / runtime-role setup
- deployment / production API checks

格式驗證、HTTP 200 或 provider 接受 request 都不等於使用者收到結果。
## Evidence
具日期的驗證結果保存於 [Acceptance evidence](../../change/evidence/)，內容標明版本、環境、範圍、結果與未驗證項。工程規範只描述如何驗，不保存歷次結果。
