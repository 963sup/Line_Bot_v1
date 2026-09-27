# Supabase operation scripts

Provider contract 見 [Supabase platform](../../docs/030-platform/020-supabase.md)；publication ordering 見 [Release](../../docs/070-operations/020-release.md)。

- `schema-source.mjs` owns ordered declarative SQL reading；`schema-local.mjs` owns clean local rebuild；`remote.mjs` owns remote `repair|prepare|plan|recovery|sync|verify` semantics；`postgres.mjs` owns SQL transport helpers。
- Scripts 必須分開 source/rebuild、local verification、remote reconciliation 與 remote mutation；local success 不能冒充 remote convergence。
- Remote access 必須驗 exact project、explicit target、bounded timeout、least-privilege connection 與 PostgreSQL advisory lock；不得從 runtime connection 或 provider metadata 猜 target。
- Plain `sync` 對 generated declarative diff 做 transaction apply，完成後要求 second diff = 0、ownership/security readback 與 migration-history fingerprint unchanged。`noop / routine / sensitive` 只作診斷，不作 DDL approval gate。
- `prepare`、`recovery` 與 `sync --reviewed-plan` 只承接 explicit data-cutover/recovery 責任；不得讓 script 自行創造 business metadata。
- `supabase_migrations` 只作 readback evidence；operation script 不得新增、replay、repair 或改寫 migration history。
- Failure after external write 是 unknown result，先 readback 再決定下一步；不得盲目重送 mutation。 Lock cleanup／rollback 屬 recovery responsibility；cleanup failure 不得覆蓋原始 reconciliation error。
- `.artifacts/supabase-remote/` 只保存 transient plan/readback evidence，不手工編輯、不提交、不作長期 business truth。
- 修改 remote command、target check、lock、evidence 或 acceptance semantics 時，補 `scripts/supabase/*.test.mjs` 對應正反測試並同步受保護的 tooling contract。
