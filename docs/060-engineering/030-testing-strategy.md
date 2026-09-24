# Testing strategy

Testing 的責任是選擇最能直接證明 claim、定位 failure 與排除替代解釋的測試層級。Command 入口與完整驗證順序由 [`040-tooling/010-validation.md`](040-validation.md) 擁有；具日期的實際結果由 `090-governance/060-acceptance/` 保存。

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

目前 root `test` 透過 Turbo 執行各 package 已定義測試。Owner-specific tests 跟隨 owning package，neutral database/testing mechanism 由 `packages/platform` 承接，`apps/web` 保留 Web/runtime tests；實際 runner 以各 package scripts 為準。Schema / Supabase checks 由既有 schema 與 verification tooling 負責。Browser flow 由 `scripts/browser/run-local.mjs` 啟動本機 production Web 與 synthetic dependencies。

Domain rule 不需要獨立 horizontal package 才能測試。當新增複雜 pure invariant 且只有上層測試難以定位 failure 時，應把能直接暴露規則根因的 deterministic test 放在 owner package，而不是為了「每層都有測試資料夾」建立空 test hierarchy。

## 測試選擇原則

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

- Validation commands：[Validation](040-validation.md)
- Architecture guards：[Architecture guards](060-architecture-guards.md)
- Acceptance evidence：[`090-governance/060-acceptance`](../090-governance/060-acceptance)
