# Release

## Principle

Release 是把已驗證的版本與必要外部變更放行到指定環境的受控流程。`READY`、HTTP 200、migration file 存在或 Rich Menu definition 存在都不能單獨宣稱整體發布完成。

## Sequence

一般順序：

1. 確認 release candidate、target environment、operator、recovery owner 與已有外部操作授權。
2. 完成 repository validation，再依 runtime dependency order 放行外部 contract；validation、database convergence、deployment 與 provider publication 是不同 evidence，但需要彼此相容的 revision 必須由同一 Release ordering 約束。
   - Current GitHub `Release` 由 `main` 的 `Validate` 成功完成後觸發，不在平行 runner 內 sleep 等待 validation。它只接受同 repository、同 `main` head SHA 的 successful push validation。Affected-source baseline 只信前次 completed workflow_run Release 的 `run-name`／display title `Release <validated-sha>`、成功的固定 `gate` job 與 git ancestor check；整體 Release conclusion 是 downstream external-effect evidence，不是 routing authority。failed downstream Release 仍可成為下一次 affected-source cursor，後續 Supabase safe sync／verify 仍負責阻止未收斂 remote state 進入 Production；沒有合格 baseline 時才以 empty tree 比對 current tree。
   - 每個 validated main 的 Supabase job 先執行 metadata-free additive `repair`，只復原可由 current declarative source 完整決定的 runtime compatibility；這層 repair不等於 full convergence。若 `supabase/schemas/*.sql` 受影響，validated current-main source change直接授權 history-free plain `sync`：clean-local desired → remote diff → transaction apply → second diff → ownership/security readback；`routine / sensitive` plan classification只作診斷，不再建立 DDL manual gate。只有需要 explicit business metadata或 data-cutover recovery authorization的情況才走 manual reconciliation `prepare-plan → retained provenance artifact → review → apply`。Apply 必須證明 reviewed artifact來自同一 current source SHA 的成功 prepare-plan run、Enterprise owner-confirmed identity fingerprint與 reviewed plan SHA-256完全一致；單獨貼一個 SHA-256 不構成完整 authorization provenance。Destructive apply 前還必須執行 `schema:remote recovery`，直接從 Supabase Management API read back PITR/WALG或 completed managed backup，並將 readback hash綁入 manual authorization。若 declarative schema 未變，`repair` 後仍執行 remote `verify`。只有同一 validated SHA 的 schema diff/readback 與 migration-history fingerprint成立後，database contract 才算 converged。
   - Vercel Git integration 不直接把 `main` 推成 Production。Supabase gate必須成功（schema changed 時 safe sync；unchanged 時 verify）後，Release才呼叫 `pnpm vercel:deploy:production -- --live --sha <validated-sha>`。Adapter先向 Vercel查 exact project + Production target + Git SHA；既有 READY deployment直接 read back、in-flight deployment續 poll，只有沒有可恢復 deployment時才建立新 mutation。未知 POST結果由下一次 invocation先 provider reconciliation，而不是再次盲目建立。
   - Rich Menu publication 只在 desired state 受影響時執行，且依賴上述 Production deployment 成功。Manual Supabase reconciliation 只負責 database prepare/plan/reviewed apply/evidence；它不要求尚未安全發布的 Web 當前置條件，也不自行部署 Web。完成 replacement 後由 Release/rerun 對 exact validated SHA 執行 Production deployment。
3. 必要時暫停舊 writer / 舊管理入口，取得備份與 migration 前對帳。
4. 依相依順序套用 forward migration、runtime role/config 與 Web deployment。
5. 驗證 deny path、authorized read/write、version/replay、durable readback。
6. 各自套用需要的 LINE / scheduler / external platform change，並逐項 readback。
7. 完成指定 Android / iOS 或其他必要 real-client acceptance 後才放行對應能力。

## Compatibility

Schema 與 Web 若需要協調切換，必須先建立向前相容的 database contract，再 promotion 新 runtime；不能先讓新 Web 依賴尚未存在的 relation，也不能讓舊 Web 在已移除舊 schema contract 的資料庫上繼續服務。Database convergence 失敗時維持上一個 Production runtime；migration 已套用後若舊版本不再相容，應維持入口關閉並向前修復，不以單純程式 rollback 破壞新資料。

## Authorization changes

管理 permission、member management、partner management 等能力的 release 不得自行產生 administrator，也不從第一位註冊者、LINE ID、email 或既有 UI 可見性推定資格。授權來源與變更命令由 `050-security/030-authorization/` 擁有。

## Evidence

每個 release 必須分開記錄：

- code/build version
- schema/migration result
- runtime/deployment result
- external platform change result
- API/readback result
- real-device / acceptance evidence where required

具日期驗收證據放 `090-governance/060-acceptance/`，不累積在本文件。
