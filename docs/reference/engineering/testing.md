# Testing strategy

Testing 的責任是選擇最能直接證明 claim、定位 failure 與排除替代解釋的測試層級。Command 入口與完整驗證順序由 [Validation](validation-pipeline.md) 擁有；具日期的實際結果由 `docs/change/evidence/` 保存。

## Evidence layers

| Layer | 適合證明 | 不能單獨證明 |
| --- | --- | --- |
| Pure / unit | parser、state transition、calculation、validation、deterministic policy | database transaction、framework/runtime、remote provider |
| Application | use case orchestration、port interaction、authorization decision wiring with controlled doubles | concrete SQL locking、remote API behavior |
| Infrastructure integration | SQL/schema、transaction、idempotency、locking、adapter request/response mapping | production provider config、real mobile delivery |
| Web/runtime | route parser、HTTP semantics、server/client boundary、framework composition | full user navigation or remote release |
| Browser | production-mode local UI flow、loading/error/retry/navigation、synthetic LINE/API behavior | LINE Console、real device、production data |
| Acceptance | 指定版本/環境的 remote migration、deployment、real API/device/business sign-off | 不可由其他層自動推定 |

## Repository baseline

PGlite integration tests use `node --no-wasm-code-gc --import tsx --test --test-concurrency=2` under the pinned Node 24 runtime. The same WASM protection already applies to schema tests. Node's WASM import-wrapper code GC can abort a process while fixtures are repeatedly created/closed ([upstream issue](https://github.com/nodejs/node/issues/66366)); this flag changes code reclamation, not SQL/test semantics. The shared fixture refuses an unprotected process, and tooling tests verify all PGlite consumer entrypoints. Test-file concurrency is bounded because each process allocates its own PostgreSQL WASM instance; limiting Turbo tasks alone does not bound that nested fan-out. Test cases retain their explicit concurrent connections and operations. Revisit the flag only after a pinned runtime containing the upstream fix passes the fixture lifecycle regression. Real PostgreSQL multi-session tests remain independent of this WASM mechanism.

目前 root `test` 透過 Turbo 執行各 package 已定義測試。Owner-specific tests 跟隨 owning package，neutral database/testing mechanism 由 `packages/platform` 承接，`apps/web` 保留 Web/runtime tests；實際 runner 以各 package scripts 為準。Schema / Supabase checks 由既有 schema 與 verification tooling 負責。Browser flow 由 `scripts/providers/browser/run-local.mjs` 啟動本機 production Web 與 synthetic dependencies。

Domain rule 不需要獨立 horizontal package 才能測試。當新增複雜 pure invariant 且只有上層測試難以定位 failure 時，應把能直接暴露規則根因的 deterministic test 放在 owner package，而不是為了「每層都有測試資料夾」建立空 test hierarchy。

## 測試選擇原則

跨 session 的治理鎖驗證使用 `platform/testing/postgres-sessions` 的隔離資料庫與 `line_app` transaction。Repository access tests 驗 competing expectedVersion、exact replay 與失敗不留回執；Attendance governance tests 驗 Repository 撤權／Account 停權與打卡的 shared/exclusive waiting、commit/rollback、原始打卡點及原子 effects。Account 停權使用真實 Adapter／SQL lifecycle guard，無管理員 fixture 的外部管理員 Port 固定放行，不宣稱驗證該 Port 的政策。CI 的 `test-database` group 提供 PostgreSQL 17 與 `CAPABILITY_TEST_DATABASE_URL`；本機缺 URL 明示 skip，CI 缺 URL 必須失敗。`test-unit` 與 `typecheck` groups 不啟動 PostgreSQL service，並與 `test-database` 分離執行。

需要完整 Supabase local schema／RLS／PostgreSQL runtime 時，執行 `pnpm test:database`。此命令會使用 `packages/integration-supabase/src/config.toml`、自動建立暫存 `SUPABASE_HOME`、啟動並重建 local stack、注入測試 URL、執行 `test-database` validation，最後清理 stack。Supabase Docker image 使用本機 Docker cache；首次下載可能較久，後續會跳過已存在的 image。命令設有 15 分鐘 timeout，完整輸出保留在 `.artifacts`。

`waitForBlocked` 以 `pg_stat_activity` / `pg_blocking_pids` 確認不同 backend 真正等待指定 transaction，再由測試釋放 barrier；20ms polling interval 不是排程依據。等待有期限，finally 先釋放 transaction 並等 pending operations 結束，再清理資料庫。WBS 既有測試亦以可觀測條件輪詢，不因出現 polling timer 就改寫其正確結構。這些案例不代表所有 Owner／交錯排列或 production 已驗收。

Validation responsibility：`test-database` 只在 changed code 或 schema 會影響 database-backed owners 時選取，並透過 Turbo affected selection 只測受影響 workspace；乾淨文件或純 tooling 變更不會啟動該 group。其 `--concurrency=2` 是為了避免每個 package 內部的資料庫／WASM test fan-out 造成記憶體競爭，仍受 Turbo cache 與每個 Owner 的資料庫契約限制。

- 優先在最靠近 invariant 的層驗證；只有跨 adapter / runtime 的 claim 才往外擴。
- Authorization、version conflict、replay、tenant/scope isolation 與 recovery 必須有拒絕／衝突反例，不能只測 happy path。
- 需要 transaction 保護的 invariant 必須由 concrete persistence / concurrency evidence 覆蓋；mock repository 只能證明 application orchestration。
- Provider mock 可以證明 request shaping、local error mapping 與 retry policy，不能證明 LINE / Google / Supabase / AI remote environment 已配置或可用。
- Browser synthetic identity 只證明本機產品 flow；真機、Console、remote migration 與真人收件仍屬 acceptance。
- 測試不得依賴正式 secrets、私人資料或不可重建的 production state。

## Regression scope

修 bug 時先加入能精確重現原失敗並鎖定根因的測試，再保留必要的較外層回歸。Architecture guard 修改需要合法案例與能直接暴露根因的違規反例；不能只放寬規則讓當前 source 通過。

## 與 build / deployment 的邊界

Test 通過不等於 TypeScript contract、production build、deployment 或 remote provider 通過；反過來 build 成功也不證明 business invariant。交付回報必須分開說明各種 evidence。

## 相鄰 owner

- Validation commands：[Validation](validation-pipeline.md)
- Architecture guards：[Architecture guards](architecture-guards.md)
- Acceptance evidence：[Acceptance evidence](../../change/evidence/)
