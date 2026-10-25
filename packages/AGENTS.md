# Packages scope

每個 package 是正式 Module Boundary。開發必須以 DDD + Hexagonal Architecture 分清業務決策、用例協調、交換契約、外部實作與組裝；folder shape 不構成符合架構的證據。

精簡只去重；保留可直接套用的放置、流程與驗收標準，降低每次重新推理成本。變更規則須有 authority/contract 理由，不以篇幅為由刪除約束。

## Authority

- 完整繼承 [root contract](../AGENTS.md)，尤其是 Mandatory governing set、禁止弱化 governing files 與 system invariants；本檔不減少其讀取或驗證要求。
- GitHub GraphQL meaning 直接取 pinned [FPT JSON](../architecture/domain/fpt/) 的 file/symbol/field；provenance 不取得語意 authority，不手改 vendored truth。
- Product Owner、invariant、relationship、capability 與 implementation expectation 由 [semantic model](../architecture/semantic-model.json) 決定；module kind/dependency 由 [implementation topology](../architecture/implementation-topology.json) 決定；persisted relation owner 由 [data topology](../architecture/data-topology.json) 決定。
- Public surface 由各 package 的 `package.json#exports` 決定；runtime behavior 以 source、tests、declarative schemas 確認。Dependency Cruiser、Biome、Knip 是 governing inputs，不是消除 violation 的 escape hatch。
- [SEMANTICS](./SEMANTICS.md) 與各 Owner 的 SEMANTICS 是 generated projection，不取代 canonical authority；[README](./README.md) 只導覽。

## Mandatory package resolution

修改前依序確認：

```text
業務結果與 invariant → 子域／模型適用邊界 → Owner → 既有 package 能否承接
→ Aggregate／用例 → public contract／dependency／data／consistency boundary → 實作與證據
```

- 以簡短責任聲明交代：business result、Owner、invariant、真實 consumer、public contract、transaction/recovery boundary 與 validation；引用 authority，不另建重複設計或 review database。
- Boundaries 分開判斷：Subdomain、Bounded Context、Module、Data、Consistency、Trust、Runtime 不因同 package、folder、table 或 provider 就等同。詞義見 [glossary](../docs/facts/glossary.md#ddd-策略建模)。
- 先追 Symptom → Consumer → Contract → Dependency → Owner → Source of Truth → Original Trigger，再決定刪除、合併、簡化、重用、搬移或拆分。
- 只有既有 Owner 無法正確承接，而且有真實 language、lifecycle、invariant 與 consumer，才考慮新 Owner/package；FPT category、feature 數、檔案數與目錄對稱不構成理由。
- 新 abstraction 必須有真實 consumer、variation、technology/policy、transaction/recovery 或 isolation responsibility，不能為套架構而建立。
- Member 是 Organization/Team 的成員關係；Collaborator 是 Repository 存取關係，不因名詞存在就新增 package。Code/SCM 未實作只代表產品 scope，不改 FPT truth。
- Selected target 不建立空 workspace、source、route 或 schema；預留/inactive 模組沒有真實 consumer 與測試契約前，不開放 host 依賴。Promotion 必須同步真正 ownership、consumer 與 runtime evidence。

## Canonical DDD + Hexagonal structure

每個 production source 必須有且只有一個 primary role。先解責任混合，再新增功能；不以搬檔、改名、介面或 folder 數宣稱已修正。

先用角色總覽快速定位，再用下方 placement 表檢查細項與禁止位置。

| Role | 責任 | 需要展開時的 canonical placement |
| --- | --- | --- |
| Domain | Entity、Value Object、Aggregate、Domain Service/Event、Policy/Specification；業務規則與合法轉移 | `domain/**` |
| Application | Use Case、Command、Query；協調資格、load/decision/save、必要 Port 與結果 | `application/use-cases/**`、`application/commands/**`、`application/queries/**` |
| Contracts | Repository、Input/Output Port、Published DTO；Ports 與穩定交換語意 | `contracts/repositories/**`、`contracts/input/**`、`contracts/output/**`、`contracts/dto/**` |
| Adapters | Inbound transport；outbound persistence/provider implementation | `adapters/inbound/**`、`adapters/outbound/**` |
| Composition | 建立 Adapter、注入 Port、組裝 Use Case/worker dependency graph | `composition/bootstrap/**` |
| Testing | test-only helper；production 不依賴它 | `testing/**` |

- 這是責任分類，不是 mandatory folders。單一清楚責任可維持單一 source；責任成長或混合時才展開 directory。同一 responsibility 只有一個 canonical location。
- `domain-module` 依實際業務責任建模；`application-module` 只擁有 orchestration/read composition；`integration-adapter` 擁有 provider protocol；`support-module` 只放中立 mechanism。後三者不建立假的 business Domain。
- 不建立空 folder、`.gitkeep`、pass-through service、facade、wrapper 或平行 compatibility 路徑。真需要搬移時，直接同步 consumer 與 exports。
- Root named entry 只有自身 narrow public/composition contract 且有實際 consumer 時保留；單純舊路徑 forwarding 刪除。任何 package 都不是免檢查的全面樣板。

### Naming and gradual convergence

- package source path 以 owner 的 ubiquitous language 加唯一 primary role 命名，採 lower-kebab-case；例如 business policy、use case、port 或 adapter，而非 `manager`、`helper`、`common`、`utils` 等無責任名稱。
- `service` 僅能指符合本檔 Domain Service rule 的 `domain/services/**`；不得用作 application orchestration 或 pass-through 的模糊名稱。
- 檔名不能取代 owner/contract 判定，也不能用 rename 假裝完成搬遷。新 source 必須遵守；既有公開或歷史名稱只在負責的 capability 變更已同步 consumer、exports、tests 與文件時收斂，不做全庫 cosmetic rename。
- 子 scope 只記錄不可由父層推導的命名例外；不要複製本節或另建第二套命名表。

### Canonical maximum shape

責任需要展開時直接使用下列標準位置；只建立真實存在的部分，不逐案另想一套目錄，也不預先建立空模板。

```text
packages/<owner>/src/
├─ domain/
│  ├─ entities/
│  ├─ value-objects/
│  ├─ aggregates/
│  ├─ services/
│  ├─ events/
│  └─ policies/
├─ application/
│  ├─ use-cases/
│  ├─ commands/
│  └─ queries/
├─ contracts/
│  ├─ repositories/
│  ├─ input/
│  ├─ output/
│  └─ dto/
├─ adapters/
│  ├─ inbound/
│  │  ├─ http/
│  │  ├─ graphql/
│  │  ├─ cli/
│  │  └─ consumers/
│  └─ outbound/
│     ├─ persistence/
│     ├─ email/
│     ├─ payment/
│     ├─ cache/
│     └─ external-api/
├─ composition/
│  └─ bootstrap/
└─ testing/
```

## Single-owner placement when a role is expanded

同一 responsibility 只有一個 canonical location；單一清楚責任可維持單一 source。下表供直接分類與審查，不用檔名代替責任判斷。

| Responsibility | Canonical placement | 禁止平行位置／責任 |
| --- | --- | --- |
| Entity / Value Object / Aggregate / Domain Event / Policy / Specification | `domain/**` | Application / Contracts / Adapter |
| Domain Service | `domain/services/**` | `application/services/**`、generic manager/helper |
| Use Case | `application/use-cases/**` | Adapter / Domain Service |
| Command / Query | `application/commands/**` / `application/queries/**` | DTO / Domain Entity |
| Aggregate Repository contract | `contracts/repositories/**` | `domain/repositories/**`、`application/ports/**` |
| Inbound Port | `contracts/input/**` | Application duplicate interface |
| Outbound Port | `contracts/output/**` | Domain / Adapter duplicate interface |
| Published / boundary DTO | `contracts/dto/**` | persistence row / Domain model duplicate |
| Inbound transport | `adapters/inbound/**` | Application / Composition |
| Concrete outbound implementation | `adapters/outbound/**` | Contracts / Composition / Infrastructure |
| Dependency wiring | `composition/bootstrap/**` | service locator / hidden registry |
| Test-only helper | `testing/**` | production runtime |

## Domain

- Domain 擁有 ubiquitous language、invariant、合法 state transition、Aggregate boundary；建立與轉移後的模型必須有效。純函數或物件皆可，不為套模式強制 class/factory。
- Entity 有 identity/lifecycle；Value Object 以 value equality 表達 meaning；Aggregate Root 是保護同一組 consistency invariants 的唯一 mutation entry。不能以 SQL row/provider DTO 代替模型。
- Domain Event 描述已成立事實；發布、傳遞、排程與 I/O 不屬 Domain。
- Policy / Specification 是可命名、可組合的純 business decision rule；有自然 Entity/Value Object/Aggregate owner 的行為留在該模型，不改放 generic service。
- 禁止依賴 Application、Contracts、Adapters、Composition、testing、SQL、SDK、HTTP、LINE/Google protocol、framework、network、environment 或 runtime mechanism。
- 禁止用例協調、transport mapping、技術重送與退避。業務上的重新執行、重試、取消或重新申請，其合法轉移仍由 Domain 決定。
- 不把整套資格查詢或 transaction 搬入 Domain；Domain 接受必要 facts/value，Application 透過 Port 取得目前 facts 再呼叫 Policy。

### Domain Service rule

只有 `domain/services/**` 可以出現 Service；Application 不建立 `services/`。

Domain Service 必須同時滿足：

1. 是純 business behavior。
2. 無自然 Entity/Value Object/Aggregate owner。
3. 不做 use-case orchestration。
4. 不依賴 Repository/Port/Adapter/network/environment，不做 I/O。
5. 使用 domain language 命名，不使用 Manager、Helper、CommonService。

## Contracts

Contracts 是 Ports 與 stable exchange semantics 的唯一 owner，可以依賴 Domain type，不能依賴 Application、Adapter 或 Composition。

### repositories/

- Aggregate Repository 只表達 Domain ID/Value/Aggregate 的 load、save、existence、expected-version 等 persistence capability；不暴露 SQL row、SDK 或 Supabase type。
- 禁止以 Repository `execute/apply/dispatch` 承接整套命令、資格決策、Domain transition、receipt 協調或 worker 流程；判斷依實際責任，不只依方法名稱。
- Transaction、qualification/read query、durable replay/receipt、event acceptance、claim/lease/fenced completion 是 Output Port capability，不塞回 Aggregate Repository。
- Contract 不實作 transaction、lock、retry 或 mapping；Persistence Adapter 實作原子保存與條件寫入。
- 不在 `domain/repositories/**`、`application/ports/**` 再建立同義 Repository/Store。

### input/ 與 output/

- Input Port 只在真實 stable public application capability、第二個 inbound adapter 或明確 inbound variation 時建立；Use Case 已足夠時不建立 pass-through interface。
- Output Port 只描述 Application 真正需要的外部能力：資格、clock、跨 Owner query/command、通知、provider、storage/cache、transaction、receipt 或 worker recovery。
- Port 使用必要 Domain values、scope 與 evidence；不得反向 import Application Command，或複製同形 Command/Query、改名 DTO 來掩蓋錯誤依賴。
- Repository 與其他 Output Port 可共享同一個 concrete transaction；不為分層拆壞 atomicity，也不暴露 SQL/SDK transaction 給 Application。

### dto/

- DTO 只表達 boundary exchange semantics；Published DTO 不直接別名、展開或序列化 Domain Entity、persistence row 或 provider DTO。
- 依公開 contract 明確投影欄位；mapping 位於相應 Application/Adapter。必要時隔離 nested mutable state，不能只靠 TypeScript readonly 宣稱隔離。
- 可重用 Domain ID/Value Object/value type；不得複製 enum/invariant 形成另一份 business truth。無實際 translation 需求，不新增同形 DTO/mapper 層。

## Application

### use-cases/

- 一個 Use Case 對應明確 business intent；協調 Command/Query、目前資格、Repository、Domain、必要 Port、transaction 與 result/error。
- Application 決定呼叫次序；Domain 決定業務上允許什麼與下一狀態。不得在 Application 複製 invariant，或以自行組裝／改寫 state 取代 Domain 的建立、轉移與 step result 決策。
- 透過 Repository load/save，透過 Output Port 取得 external capability；不依賴 concrete Adapter/Composition、SQL、SDK、provider protocol 或另一 Owner 的 private implementation。
- Pre-read 可作 UX/optimization；不可作 concurrency correctness 的唯一依據。
- Read-only Query 消費授權後 projection，不載入無必要的肥大 Aggregate，不偷偷初始化 authoritative state。

### commands/ 與 queries/

- Command 是可能改變 state 的 business request model；Query 是 read intent；兩者的 canonical owner 是 Application，不放 Domain Entity 或 Contracts DTO。
- 可共用的 unknown input → canonical Command/Query 正規化留在 Application；framework/transport decoding 留在 Inbound Adapter，business validity 留在 Domain。
- Command/Query model 與 parser 不承接 use-case orchestration、SQL、I/O 或另一套業務決策。

## Adapters

### inbound/

- HTTP/GraphQL/CLI/webhook/queue consumer 負責 transport decoding、authentication proof/context、request identity、transport DTO → Command/Query、呼叫 Use Case、result/error 投影。
- 輸入 UserId/role 只能表達定位或 intent，不能成為身分或資格憑證。資格與 scope 由真正 Owner 的 current contract 重驗。
- 禁止 business invariant、SQL 與 cross-owner private-table query。
- Host framework route 可以直接當 Inbound Adapter；Request/Response、Next.js、LIFF、browser API 留在 host delivery。
- 單一 route family 的 server wrapper 若只有 parsing/error mapping/pass-through，將共用 input/business contract 收回 Owner，由 route 承接 transport；不為減少行數保留中介層。
- 只有第二個真實 transport consumer、獨立 protocol responsibility 或 variation，才建立 package-level inbound adapter。

### outbound/

- Concrete implementation 實作 Repository/Output Port；負責 row/provider mapping、SQL、conditional write、lock、transaction、receipt/outbox 與 fencing persistence。
- Adapter 可 enforce Domain invariant 的原子 predicate、取得 qualification facts 並實作 Owner query，但不取得 business semantic authority；不得自行定義資格 policy、案件轉移或藏整套用例。
- Owner-specific implementation 留在 owner；LINE/Google provider protocol 留在 integration owner；不以平台層吸收業務 Adapter。

## Infrastructure policy

Owner package 不另建 `infrastructure/`。中立 database client、pool、generic transaction runner、runtime/config/framework mechanism 由 `@line_bot_v1/platform` 承接；知道業務 Owner 的 technology implementation 屬該 Owner 的 Adapter。

## Composition

- 只組裝 concrete dependencies、注入 Repository/Port、建立 Use Case/worker graph；library 不必有 `main.ts`，executable entry 由真正 host/runtime owner 提供。
- 禁止 business invariant、SQL/business query、第二套 Application flow、service locator 或 global registry。組裝必須顯式，import 不觸發外部副作用。

## Hexagonal dependency direction

```text
Inbound Adapter → Input Port / Use Case → Application → Domain
                                            ├──────→ Repository Contract
                                            └──────→ Output Port ← Outbound Adapter
Composition wires Application + Adapters; platform provides neutral mechanisms.
```

- Domain 不依賴外層；Contracts 不依賴 Application/implementation；Application 不依賴 concrete Adapter/Composition；production 不依賴 testing-only surface。
- 跨 package 含 type-only import 都只用 exact public exports；禁止 private source、dist、testing-only surface、internal generated artifact 與其他 Owner private schema/table。
- Host 只使用 topology 開放的 workspace dependencies；ledger 等底層一致性機制由 wallet/daily-check-in 等真正 Aggregate owner 封裝，不直接向 Web 開放。

## Correctness ownership

| Concern | 決策／協調／enforcement owner |
| --- | --- |
| 合法 transition、invariant、Domain Event | Domain |
| 資格與 replay 次序、request identity/version 傳遞、用例協調 | Application，依 Owner contract |
| Aggregate load/save 與 expected-version semantics | Repository Contract |
| Qualification/query、transaction、receipt、worker recovery capability | Output Port |
| Lock、conditional write、atomic state/receipt/outbox、lease fencing | Persistence Adapter + Database constraint/predicate |
| Authentication/request identity extraction、transport projection | Inbound Adapter |
| Provider protocol 與 retry outcome | Provider Adapter；業務 recovery 由其真正 Owner 協調 |

業務 mutation 的典型流程：

```text
Inbound Adapter: verified proof / scope / requestId
  ↓
Application / transaction Output Port
  ↓ current qualification / archive / exact replay（依 Owner 契約排序）
Repository.load()
  ↓
Aggregate / Domain Policy: valid transition + required Domain Event
  ↓
Repository.save(expectedVersion)
  ↓
Persistence Adapter: conditional state write + durable receipt + required outbox
  ↓ atomic commit / rollback
Consumer / worker: external effect + stable dedupe / retry / fenced completion
```

- 此流程是責任分工，不是所有用例的固定順序；Owner 明定 qualification、archive 與 replay 的先後。授權 replay 不繞過目前資格；不得改變既有封存/撤權/replay semantics。
- Mutable conditional state 必須由 expected version、atomic predicate、lock、constraint 或 unique key enforce；affected rows = 0/version mismatch 必須 conflict，禁止 silent overwrite。
- 命令有 durable request identity 或天然業務複合鍵；same identity + same fingerprint replay，different fingerprint conflict；memory/middleware dedupe 不作 durability truth。Event consumer 強制去重。
- 共同維持 invariant 的 state、receipt 與必要 outbox 同 transaction commit/rollback。只有真實 async publication/consumer 才建立 event/outbox；既有可靠發布責任不可省略。
- External publish 在 commit 後由 worker 恢復；timeout 不回滾已成立的 Domain fact。Worker 的 claim/lease/fenced save 與 bounded retry 必須有 durable owner；失效 worker 不得保存結果。
- Cancellation 不宣稱撤銷已成立效果；retry/resume 保留穩定 effect identity。Provider acceptance、unknown outcome 與 device delivery 分開表達。

## Cross-package boundary

- 先確認 consumer need → semantic owner → relationship/integration contract → module allowlist → data owner → public export → implementation/evidence。
- Owner 分離不隔離 Capability；用明確 public query/command、stable ID/value、committed event 或 read projection 合作。Consumer need 不轉移 Provider authority。
- Relationship contract 明確交代 Provider、Consumer、Meaning、Integration mode、Authority、Consistency；實際值與必填欄位仍由 semantic model 擁有。
- 不以 common、alias、facade、wrapper、compatibility surface、ignore 或 exception 隱藏 cycle、ownership 或 dependency 問題；需要 translation 時必須有真實 upstream/local model 差異。
- Workspace dependency 新增/刪除/改變，同 changeset 更新 owner manifest、implementation topology 與 lockfile；ownership/capability/data 語意變更同步 canonical model、consumer、guard、tests、docs 與證據。

## Data / consistency invariants

- 每個 authoritative persisted relation 只有一個 semantic owner，必須對齊 concept owner；projection/reference/cache/cross-owner mechanism 不取得 writable authority。
- 預設單一 Aggregate 保護自己的 consistency boundary；跨 Aggregate/Owner 優先 committed event + transactional outbox。只有拆開會破壞必要 atomic invariant 時，才用明確 owner 的 cross-owner transaction coordinator，並以 constraint/transaction tests 證明。
- Saga/Process Manager 只在真實跨 Aggregate/Context 長流程存在；不為架構外觀新增，也不為一律 eventual consistency 拆壞 atomicity。
- Authorization、isolation、replay/version、audit、recovery、privacy 不因 placement/refactor 簡化而降低；保持 [system invariants](../docs/rules/system-invariants.md)。
- Business failure 由真正 Owner 定義 explicit typed semantics；可用既有 Result/DomainError，不強制特定包裝。Uncontrolled provider/infrastructure exception 不直接成為 public business contract。
- Generated/reference data 追到 canonical source；history、proposal、target、runtime feedback 或 validation success 都不能取代 current authority。

## Child package docs

- 每個 package 保有 AGENTS、README 與 generated SEMANTICS。
- Child AGENTS 只增加 owner-local constraints，不能削弱本檔/root；README 只 routing，不複製 inventory、schema、exports、capability 或 validation truth。
- Root/child SEMANTICS 是 canonical models 的 generated projection；語意修改先改真正 authority，再執行 `pnpm semantic package-docs`。
- `pnpm architecture` 檢查缺檔與 drift；generated projection 不證明 source 已符合 DDD，也不證明 runtime/deployment/device acceptance。

## Validation

| Change | 必要驗證入口 |
| --- | --- |
| 文件 | `pnpm docs:check` |
| 一般 source / use case | owner tests + `pnpm check` |
| Dependency / public export / boundary | `pnpm boundaries` + `pnpm architecture` |
| Semantic / architecture / guard | `pnpm semantic check` + `pnpm architecture` + `pnpm architecture:test` |
| Schema | `pnpm schema:check` |
| Merge / release | exact-head `pnpm validate` + CI；base 前進後更新並重驗 |

分項 canonical commands：`pnpm lint`、`pnpm boundaries`、`pnpm architecture`、`pnpm architecture:test`、`pnpm deadcode`、`pnpm typecheck`、`pnpm test`、`pnpm build`。執行範圍與 evidence 規則見 [validation rules](../docs/rules/validation-evidence.md)。
- 新增/修正 guard 要有 legal、deliberately violating、repaired cases；不以方法/檔名關鍵字代替語意判斷，不加 broad ignore 或路徑例外。
- 本次觸及用例沿 consumer → Command/Query → Application → Domain → Port → Adapter → composition → tests 完整核對；不留下只是換位置的混合責任或平行 writer。
- 依實際風險驗證非法轉移、目前資格/跨 scope isolation、version/replay、rollback/recovery、競爭與 stale-worker fencing；無關既有債明示，不強制重構整個 package。
- 完成證據同時包含 responsibility/dependency review 與對應 behavior evidence；CI green 不單獨證明語意分層正確。Lint、typecheck、test、build、schema、deployment、provider、device 證據不互相替代。
- 回報精確到本次 flow/capability、revision 與實際 checks；部分流程完成不可宣稱整包或全部 packages 已清理。未知明示，不以 generated docs 或待實作 target 宣稱能力已完成。
