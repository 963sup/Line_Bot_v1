# Deployment

## Scope

本文件只定義「指定版本準備部署到指定環境」前必須確認的條件。部署準備不代表 database reconciliation 已完成、LINE 設定已更新、Rich Menu 已發布或手機驗收已完成。

## Required context

部署前必須明確指定：

- source commit / release candidate
- target environment / project
- schema / reconciliation baseline
- configuration source and version
- authoritative business data source
- operator and recovery owner
- external write authorization and cost boundary

Preview、local、test 與 production 不共用假定的帳號、資料或秘密。

## Pre-deployment checks

先完成適用的 repository validation，再檢查目標環境依賴：

- fixed application origin
- LINE Provider / Channel / webhook / MINI App entry
- Google callback / OAuth entry（若該版本使用）
- Supabase runtime database role / TLS / pooler
- Redis or other required coordination dependency
- required secrets and environment variables

本地 `.env`、repository config、schema 或 adapter 存在都不能當成遠端已配置的證據。

## Database and writer safety

Web runtime 不執行 DDL。Schema 變更使用 forward reconciliation，operator credential 與 runtime credential 分離。若新 runtime 依賴新的 relation/constraint/function，該 database contract 的 apply + post-write readback 必須先成功，Production promotion 才可開始；不能以 Vercel Git main auto-deploy 讓 runtime 越過 database gate。

需要切換資料來源時，先指定唯一 writer、停止舊 writer、處理未完成操作並取得備份，再做隔離 data transition / reconciliation。不得用雙寫或自動 fallback 掩蓋切換不確定性。

## Release boundary

Web deployment、database reconciliation、scheduler/worker、LINE Rich Menu、LINE webhook、Google/Supabase console 設定都是不同外部變更。它們必須分別有版本、結果與恢復方式；其中一項成功不能代表其他項已完成。當 runtime 與 database contract 有明確 dependency 時，Release ordering 仍必須先 database convergence、後 exact revision Production deployment。

正式放行流程見 [Release](020-release.md)；資料恢復見 [Recovery](030-recovery.md)；外部平台操作見 [External change control](050-external-change-control.md)。
