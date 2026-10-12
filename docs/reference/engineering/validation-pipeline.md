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
## TypeScript safety

TypeScript 的共用編譯契約由 `tsconfig.base.json` 擁有，workspace source 與 test config 必須繼承五項安全設定；`tooling:check` 解析實際繼承結果，拒絕子設定關閉它們。此共用檔也納入 Turbo `globalDependencies`，避免設定改變後仍重播舊的成功快取。

`biome.json` 將 explicit `any`、`@ts-ignore`、非空斷言 `!`、`enum` 與 `namespace` 設為 error，經 `lint`、`check` 與 `validate` 被動阻擋。外部輸入先用 `unknown` 再驗證，nullable / indexed value 用控制流程收窄；optional property 沒有值時省略，只有契約真的接受明確 `undefined` 才標示它。有限集合使用 literal union 或 `as const`，模組使用 ESM。一般 `as` 斷言仍可能出現在驗證過的 adapter 邊界，這些靜態規則不證明外部資料有效，也不保證完全不存在型別逃生口。

防止型別漂移的目標是讓資料與契約改變時，編譯器或邊界驗證能指出失配，而不是單純減少某個關鍵字。另啟用 `noEvolvingTypes`、`noImplicitAnyLet`、`noBannedTypes`、`noUnsafeOptionalChaining`、`noUnsafeDeclarationMerging` 與 `useAsConstAssertion` 為 error；`tooling:check` 拒絕將這些規則降為 warning。

`noEvolvingTypes` 是明確的 repository policy 選擇：TypeScript strict 下的 evolving inference 本身可以合法且安全，但這裡對未初始化暫存變數要求明確契約，避免後續 assignment 靜默擴大型別。這不代表一般型別推導都應改成註記；`noImplicitAnyLet` 另外補上讀取未初始化變數的逃生口。

| 漂移來源 | 優先處理方式 | 檢查責任與限制 |
| --- | --- | --- |
| 未初始化變數隱式演化成 `any` | 標明真正的 union／契約型別 | Biome `noEvolvingTypes`；`strict` 不能完全阻止 evolving any |
| 未初始化變數的 implicit any／boxed `String`、`Object`、`Function`、`{}` 寬型別 | 明確契約、primitive、實際函式簽章或 `unknown` | Biome `noImplicitAnyLet`／`noBannedTypes`；`{}` 不代表空物件 |
| 物件／測試 mock 的 `as Contract` | 型別註記或 `satisfies Contract`；spy 參數取 `Parameters<Contract["method"]>` | TypeScript 檢查契約變更；不要改成雙重斷言 |
| URL 值斷言成有限集合 | 從允許集合找出匹配值，讓回傳型別由集合推導 | 控制流程＋既有 parser 測試 |
| 外部 JSON 的 `as T`／`as unknown as T` | 在所屬 adapter 驗證 required、optional 與 nested fields | 執行期驗證＋有效／無效 payload 測試；`satisfies` 不驗證執行期資料 |
| optional chaining 後仍直接解參考 | 明確檢查存在，或保留完整 optional chain | Biome `noUnsafeOptionalChaining` |
| class/interface 宣告合併宣稱不存在的 member | 由實際 class implementation 提供成員 | Biome `noUnsafeDeclarationMerging` |
| literal 斷言 | 使用 `as const` 保留推導 | Biome `useAsConstAssertion`；`as const` 不等於執行期 freeze |
| SQL driver 的未驗證 row 型別 | 對照 SQL projection／schema，在 owner adapter mapping | TypeScript 不會驗證 SQL；泛型 query 也不等於資料驗證 |
| 未處理 Promise／union 新增分支 | 由 owner 確認 await、錯誤處理及 exhaustive decision | 保留 TypeScript／測試；需先驗證型別 lint 的偵測限制 |

目前不全庫啟用 nursery `noUnsafeTypeAssertion`：固定版本 Biome 2.5.14 的規則禁止所有非 const 斷言，包含已驗證的 adapter 與第三方 SDK 邊界，不能用全庫禁令迫使程式改成未驗證的 type predicate。也不直接啟用 `noMisusedPromises`：對 `Map.get()` 取得 `Promise | undefined` 後檢查是否已有進行中請求，必須保留存在檢查，不能自動改成 await。`noFloatingPromises`／`useExhaustiveSwitchCases` 可在獨立變更中評估；新增規則前先用固定版本實測，再補對應 regression fixture，不加 ignore 或引進第二套重複 linter。

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
