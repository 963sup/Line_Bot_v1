# Repository architecture

執行期 consumer 只依賴 `packages/<owner>` 公開 surface；cross-context semantic ownership 以 [semantic model](../../architecture/semantic-model.json) 為 machine truth，現有 module path 與允許依賴以 [manifest](../../architecture/implementation-topology.json)、各 package.json 與 architecture guards 為準。新功能不得加入 horizontal compatibility packages。

## Workspace

Repository 使用 pnpm workspace；`pnpm-workspace.yaml` 只納入：

```text
apps/*
packages/*
```

目前 `apps/` 只有 `apps/web`。

目前正式 owner packages 為：

```text
packages/
├─ account/
├─ notifications/
├─ asset/
├─ assistant/
├─ audit/
├─ attendance/
├─ daily-check-in/
├─ enterprise/
├─ expense/
├─ google-workspace/
├─ identity-access/
├─ ledger/
├─ line-channel/
├─ organization/
├─ partners/
├─ payroll/
├─ platform/
├─ project/
├─ repository/
├─ team/
├─ wallet/
└─ workforce/
```

舊的 horizontal compatibility packages `contracts`、`infrastructure`、`domain`、`application` 與 `agents` 已移除。Domain/Application/Contracts/Adapters/Agents 等技術責任由真正 owner package 直接擁有，不重建同名水平 package，也不保留 redirect/facade 作為第二個 source of truth。

Package boundary 是 Module Boundary，不自動等於 Bounded Context 或 Data Boundary。Business Context 仍由 domain design 與 module owner 定義；integration/support package 也可有獨立 package boundary。

此系統採 GitHub-like owner model：Account、Organization、Team、Enterprise 等概念各自有明確 owner 與 public contract；consumer 透過 owner 的 public exports 組合能力，不共享私有模型，也不以全域 horizontal layer 取代 owner boundary。

## Non-workspace repository roots

`apps/`／`packages/` 之外的根目錄不因存在檔案就成為新的 runtime 或 Domain boundary：

```text
scripts/   # 開發、驗證、維運與 provider operation orchestration
assets/    # repository-owned 非程式素材，依 provider / capability 分類
supabase/  # declarative database structure 與本地 Supabase 設定
```

`scripts/` 不保存產品業務規則；CLI 只組合既有 owner capability。需要正式圖片等 repository asset 時放 `assets/<provider>/<capability>/`，不要與執行腳本混放或複製到 Web/package source。以 LINE Rich Menu 為例，operator entry 是 `scripts/line/rich-menu/sync.ts`，圖片是 `assets/line/rich-menu/*.png`；script 只處理 env／argv／輸出，產品 definition／desired state／publication transaction 由 `apps/web/src/modules/assistant/rich-menu/` 擁有，Rich Menu protocol/client 仍由 `@line-work/line-channel` 擁有。

## Owner module shape

Owner module 依真實責任採需要的 layer，不要求每個 package 都有完整目錄；module existence 不等於 Bounded Context existence：

```text
packages/<owner>/
├─ src/
│  ├─ domain/        # owner 的純規則；需要時才存在
│  ├─ application/   # use case / query / orchestration
│  ├─ contracts/     # 真正跨 boundary 的 owner contract
│  ├─ adapters/      # database/provider/runtime adapter
│  ├─ agents/        # owner-specific AI extraction/draft boundary
│  └─ testing/       # 明確 test-only support
├─ package.json      # 唯一公開 export surface
├─ AGENTS.md         # owner-local constraints
└─ README.md         # navigation only
```

`packages/AGENTS.md` 是所有 package 的共通 agent scope；每個 `packages/<owner>` 依 packages scope contract 保有精簡 `AGENTS.md` 與 `README.md`，只增加 owner-local constraint / routing，不複製 parent truth。`scripts/architecture/check-implementation-topology.mjs` 驗證 package registry、workspace dependency allowlist、public exports、packages scope 與未註冊 workspace package。

## Semantic architecture tooling

`architecture/semantic-model.json` 是 structured product semantic authority；`architecture/implementation-topology.json` 擁有 module topology；`architecture/data-topology.json` 擁有 SQL surface ownership / Data Boundary mapping；`supabase/schemas/` 擁有實際 database structure。以下 CLI 只 compile／query／derive，不保存第二份 business truth：

四份模型的責任與查核入口見 [Architecture routing](../../architecture/README.md)。能力按可觀察的操作細分為 leaf；只有需要表達整體能力時才使用 aggregate。Aggregate 的存在不表示每個成員已實作。`runtimeExpectation` 是產品期望，implementation source／public export／entrypoint／test path 是靜態追溯資料；測試檔存在不等於測試已通過。

Locator 貼在原 concept 上，不形成新的 owner。已存在的 route file 是 URL 結構的來源；stable identity、可變的 login／slug／number 與目前 authorization 分開。尚未啟用的 Project 等能力不能因有 module 或 schema，就宣稱有 active route。

| Command | Responsibility |
| --- | --- |
| `pnpm semantic check` | 驗 semantic type、ownership、contract、boundary mapping、evidence profile 與 implementation mapping |
| `pnpm semantic <query> ...` | 查 owner／concept／contracts／consumers／dependencies／invariants／boundaries／evidence／path／impact |
| `pnpm semantic capability <id>` | 查單一 leaf 或 aggregate 的 runtime expectation、成員與 implementation evidence |
| `pnpm semantic plan "<intent>"` | 將 Change Intent 編譯成 owner、impact、contracts、module/data boundaries、candidate code/SQL surfaces 與 required validation |
| `pnpm semantic context "<intent>"` | 從 change plan 蒸餾與 task / owner / boundary 直接相關的 authoritative context |
| `pnpm semantic diff <before> <after>` | 將 semantic change 分類為 ownership／authority／boundary／contract／invariant／policy／evidence 等 change |
| `pnpm semantic drift <before-benchmark> <after-benchmark>` | 比較 pinned external benchmark 的來源、契約與 graph；區分已採用語意的影響與需重新評估的外部變化，不自動採用 |
| `pnpm semantic feedback <bundle.json>` | 將具時間、來源與 evidence channel 的 capability observation 與 runtime expectation 比較，輸出 aligned／drift／review／inconclusive 與 derived revision proposal |
| `pnpm semantic view <view>` | 從同一 model 產生 ownership／glossary／contracts／invariants／capabilities／locators／benchmark-coverage／evidence／Mermaid／docs read model |

任何 projection、plan、context、diff、drift 或 feedback comparison output 都是 derived read model；不得反向成為 Source of Truth。Observation bundle 屬 external evidence，不是 semantic authority；revision proposal 必須經 owner review 後才可顯式修改 canonical model。

## Web source

`apps/web/src` 採三個頂層責任：

```text
apps/web/src/
├─ app/       # Next.js routes、layout、頁面組裝與最外層 runtime composition
├─ modules/   # 特定業務能力的 Web presentation / interaction / HTTP projection
└─ shared/    # 不決定業務行為的 Web 共用機制
```

### app

`app/` 擁有正式 URL、route groups、layout 與跨功能頁面組裝。`app/api/_composition` 可以在最外層把 concrete ports / adapters 注入各功能 use case；它不是第二個 application layer、global container 或 service locator。

### modules

`modules/<business>` 擁有功能畫面、專用文案、瀏覽器暫存與該功能 Web 接線。Module 不因需要 server code 就另複製完整 Domain/Application/Infrastructure 四層；真正跨 runtime 或業務層的責任由 owning workspace package 承接。

### shared

`shared/` 只保存責任、契約與修改原因真正相同的 Web 共用機制，例如中立 HTTP parsing、安全的 browser runtime、共用 presentation。純函式、多處引用或「看起來通用」都不足以把業務規則提升成 shared。

## Workspace package ownership

| Package 類型 | Owner responsibility |
| --- | --- |
| `account / attendance / expense / repository / ...` | 已啟用 runtime capability 的 owner；只建立真實需要的 Domain/Application/Port/Adapter responsibility |
| `audit` | 已保留的 Audit module owner；目前只有 workspace foundation，正式 Audit runtime、public export 與 persistence boundary 尚未啟用 |
| `project / workforce` | 已註冊 module owner；Project runtime 與 Employment runtime 尚未啟用，狀態以 semantic model 為準 |
| `notifications` | Notification read/delivery projection；不擁有 issue 或 discussion source |
| `line-channel` | LINE protocol、identity proof、Messaging API 與 MINI App integration |
| `google-workspace` | Google provider integration |
| `platform` | 真正中立且跨 owner 的 runtime / persistence mechanism 與 testing support |

Layer responsibility 見 [Hexagonal architecture](020-hexagonal-architecture.md)，依賴方向見 [Dependency rules](040-dependency-rules.md)；本文件只回答「程式責任放在哪裡」。

## Change placement decision

新增檔案前先找真正 owner，不以「哪裡比較方便 import」決定位置：

| 變更的真正責任 | 預設 owner |
| --- | --- |
| business invariant、state transition、value validation | `packages/<business-owner>/src/domain` |
| use case、query、流程協調、port | `packages/<business-owner>/src/application` |
| owner-specific database adapter | `packages/<business-owner>/src/adapters` |
| LINE / Google provider protocol | 對應 integration package |
| 真正跨 owner 且無 business authority 的 runtime mechanism | `packages/platform` |
| owner-specific AI extraction / draft | `packages/<owner>/src/agents` |
| feature-specific Web UI / interaction / browser presentation state | `apps/web/src/modules/<owner>` |
| 正式 URL、layout、route handler 與最外層 dependency composition | `apps/web/src/app` |
| 多 feature 真正相同的 Web mechanism，且沒有 feature-specific rule | `apps/web/src/shared` |
| 開發／驗證／外部操作 orchestration | `scripts/<responsibility>`；不得吸收產品規則 |
| repository-owned 非程式素材 | `assets/<provider>/<capability>`；由實際 consumer/test 指向單一位置 |

若一個 use case 需要其他 owner，透過對方 public contract / port 組合；不要把 producer private model 搬進 consumer，也不要為了避免相對路徑建立新的 common package。

## Convergence rule

完成 horizontal compatibility migration 後，後續結構調整遵守：

1. 確認 owner、consumer、public exports、transaction / authorization / replay invariants。
2. 只在真正 owner 內調整 implementation placement；保持 wire、SQL、authority、transaction、history 不變。
3. 語意／ownership 改變時先更新 `architecture/semantic-model.json`；implementation topology 改變時更新 `architecture/implementation-topology.json`，再同步 guards、tooling、Knip 與必要 docs projection。
4. 不重建 compatibility package、wrapper 或 alias 來掩蓋 owner 問題。
5. 使用 repository validation；database/deployment/device evidence 另行驗證，不混稱。

上述是 ownership / tooling convergence，不是所有功能開發的前置總關卡。Workforce／Attendance／Payroll 依 [業務演進 slices](../090-governance/030-migrations/040-enterprise-organization-workforce-payroll.md#workforce--attendance--payroll-implementation-slices) 推進；各 slice 必須完成自己涉及的 owner、consumer、依賴與驗證，不等待無關結構清理，也不把業務改動包裝成搬檔。

## 新增結構原則

新增 app、workspace package、Web module 或子目錄前，必須有目前 owner 無法合理承接的獨立責任或 runtime boundary。不要因分類圖、未來可能需求、單次檔案數增加或「想讓 Context 1:1 對齊 package」而建立空 package、wrapper、facade 或平行框架。

新增 workspace package 的門檻高於新增 owner subdirectory：只有當依賴規則、runtime、release/public surface 或責任真的需要獨立 package boundary 時才建立。單純想少寫相對路徑或避免循環依賴，先修正 owner/dependency design。
