# Validation
Repository validation 使用既有 scripts 作單一入口；不要把 typecheck、test、build、deployment、API probe 或手機驗收混成同一種證據。
Stage 與執行順序以 [`scripts/check.mjs`](../../../scripts/check.mjs) 為準；用 `pnpm check --help` 查看目前入口。Repository 沒有獨立的 `docs:check` 或 `validate` 指令；文件變更須另驗本地連結。

## Main commands
| Command | Responsibility |
| --- | --- |
| `check:repository` | repository contracts、文件邊界與相關 tooling tests；不等於完整 Markdown／連結驗證 |
| `schema:check` | `@line_bot_v1/platform` 執行 declarative schema source tests 與 PGlite clean-build / runtime-role / RLS contract tests；不代表 remote catalog 一致 |
| `lint` | `biome check .` 的 read-only static gate；驗 formatter、lint 與 assist/import ordering，不修改檔案 |
| `format` | `biome check --write .` 的 canonical local mutation；一次套用 formatter、safe lint fixes 與 assist/import ordering，之後再跑 read-only validation |
| `dependencies` | adapter boundary tests 與 Dependency Cruiser dependency graph |
| `knip` | repository reachability；finding 回到 owner／consumer／entry point 判讀，禁止用 broad `ignore` 消音 |
| `typecheck` | TypeScript contract |
| `test` | 適用 unit/integration/runtime tests |
| `build` | production build / framework compile |
| `check [stage...]` | 依序執行指定 stages；未指定時執行 runner 定義的全部預設 stages，`format` 須明確指定 |

額外工具參數只可傳給單一 stage，例如 `pnpm check lint -- path/to/file.ts`。VS Code save 設定見 `.vscode/settings.json`；Agent／CLI 格式修正使用 `pnpm format`，CI 使用 read-only `pnpm lint`。

Biome 同時涵蓋 `knip.jsonc` 與 `architecture/**/*.json`，React Hooks 的呼叫位置與 effect dependencies 也納入 correctness gate。Knip 對 private workspace package 的 entry exports 檢查實際 repository consumer；未使用 export 應先區分內部宣告、必要公開契約與真正死碼，再收斂 public surface。
## Validation scope

依變更選取 `pnpm check [stage...]`；不傳 stage 會執行全部預設檢查，runner 不會自動依 Git diff 縮小範圍。Public contract 或 shared config 變更須涵蓋 consumers。CI 的選擇與 aggregate 條件以當前 workflow 為準。

各層證據的限制由 [validation evidence](../../rules/validation-evidence.md) 擁有；測試選擇由 [testing](testing.md) 擁有。外部發布順序見 [Release](../operations/release.md)，Supabase remote readback 見 [Supabase](../platform/supabase.md)。

## TypeScript safety

TypeScript 的共用編譯契約由 `tsconfig.base.json` 擁有，workspace source 與 test config 必須繼承五項安全設定。此共用檔也納入 Turbo `globalDependencies`，避免設定改變後仍重播舊的成功快取。

`biome.json` 將 explicit `any`、`@ts-ignore`、非空斷言 `!`、`enum` 與 `namespace` 設為 error，經 `lint`、`check` 與 `validate` 被動阻擋。外部輸入先用 `unknown` 再驗證，nullable / indexed value 用控制流程收窄；optional property 沒有值時省略，只有契約真的接受明確 `undefined` 才標示它。有限集合使用 literal union 或 `as const`，模組使用 ESM。一般 `as` 斷言仍可能出現在驗證過的 adapter 邊界，這些靜態規則不證明外部資料有效，也不保證完全不存在型別逃生口。

防止型別漂移的目標是讓資料與契約改變時，編譯器或邊界驗證能指出失配，而不是單純減少某個關鍵字。另啟用 `noEvolvingTypes`、`noImplicitAnyLet`、`noBannedTypes`、`noUnsafeOptionalChaining`、`noUnsafeDeclarationMerging` 與 `useAsConstAssertion` 為 error。

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

全庫啟用 nursery `noUnsafeTypeAssertion` 為 error，保留 `as const`，禁止其他型別斷言。資料庫透過 `Sql.query(text, values, decodeRow)` 在各 Owner adapter 驗證 projection；無 decoder 的查詢只回傳 unknown-valued row，不能以泛型宣稱資料已驗證。HTTP、JSONB、storage 與 SDK 邊界使用真實 narrowing 或重建已驗證資料，不得改成說謊的 type predicate。Web tests 也納入 TypeScript 檢查，測試 fake 必須符合正式契約。Biome 尚未涵蓋宣告上的 definite assignment `!`，由 TypeScript 與測試契約補足，要求明確初始化。

不直接啟用 `noMisusedPromises`：對 `Map.get()` 取得 `Promise | undefined` 後檢查是否已有進行中請求，必須保留存在檢查，不能自動改成 await。`noFloatingPromises`／`useExhaustiveSwitchCases` 可在獨立變更中評估；新增規則前先用固定版本實測，再補對應 regression fixture，不加 ignore 或引進第二套重複 linter。

## Concurrency

Web build 同時承擔 Sentry sourcemap 上傳，因此 `@line_bot_v1/web#build` 停用 Turbo 快取，避免重播產物而跳過上傳；其他 package build 仍可使用快取。`SENTRY_AUTH_TOKEN` 保留 passthrough，不納入 cache hash。未提供 Sentry 配置的本機 build 不證明上傳成功。

CI 的 validation 與 Copilot setup 共用 pnpm store、Turbo cache 與 Next cache；快取 key 只由 Node／manifest／lockfile／Turbo 設定決定，不綁定 commit SHA，讓不同 revision 重用內容雜湊相同的產物。測試結果本身仍不直接快取，避免資料庫與外部狀態被錯誤重播。

Type generation、test/build artifact 與 dependency install 在同一 checkout 可能競爭。驗證流程預設按 repository runner 順序執行；不要同時手動跑另一套會寫相同產物的 command。

Typecheck 與 test 的 Turbo concurrency 由 runner 固定為 2；package 內部 worker 設定另由各 manifest 擁有。跨 package 與 package 內的 fan-out 會相乘，直接執行 Turbo 時也須限制總量。PGlite 的 WASM 保護與 PostgreSQL 多連線驗證見 [Testing](testing.md#repository-baseline)。

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
具日期的驗證結果保留於實際 CI／provider／deployment evidence；工程規範只描述如何驗，不保存歷次結果。
