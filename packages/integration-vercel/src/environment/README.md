# Environment configuration

Configuration 名稱與本機起點見 [.env.example](../../../../.env.example) 與 [Local environment](../../../../docs/reference/engineering/local-environment.md)；provider-owned variables 見 [Vercel](../../../../docs/reference/platform/README.md#vercel) 與 [Supabase](../../../../docs/reference/platform/README.md#supabase)。本目錄不保存 `.env`、實值、token 或帳戶識別。

- Development、Preview、Production 分開設定與驗證，Preview 不因需要測試就取得 Production credential。
- Public build-time 值與 server-only runtime secrets 分開；不得把秘密放入 `NEXT_PUBLIC_*`。
- Marketplace 注入值與 project-managed configuration 各有原 owner，不建立平行設定表或複製 provider connection URL。
- 變更值後依 provider 與 framework 的實際套用方式驗證部署，不能假定既有 deployment 自動使用新值。

後續驗收：缺值 fail closed、環境隔離、secret 不進 client bundle／log，以及 exact deployment 的設定生效結果。發布仍走 [Release](../../../../docs/reference/operations/release.md)。
