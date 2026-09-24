# Repository scripts scope

- `scripts/` 只擁有 repository operation orchestration；產品 domain/application rule 必須留在真正 package owner。
- Root `package.json` scripts 是人、Agent、CI 共用的 canonical command surface；`scripts/**` 是其 implementation，除非開發 script 本身，不要求 consumer 記住 implementation path。
- 操作預設 read-only。Local mutation、remote mutation 必須由名稱與入口明確表達；remote mutation 另需 explicit authorization、exact target、precondition 與 post-write readback。
- 一般 `check` / `validate` 不隱式執行外部 mutation 或需要正式 credential 的 probe。不同 evidence 類型分開回報。
- 腳本按責任就近放置，測試與被測 script 共置；不建立通用 `utils` / wrapper / facade 只為整理目錄。
- 參考 [GitHub GraphQL sync/data pipeline](https://github.com/github/docs/blob/main/src/graphql/README.md)：source／schema → normalize → validate → category/version partition → index/load → consumer。專案 script 應維持相同可重跑、可定位、可驗證的責任分段。
- `fpt` 的 49 個檔案是 pipeline output family 的 reverse-engineering indicator，不是手工維護清單；新增 generator 時要明確標示 source、生成責任、輸出 family、consumer 與 failure/recovery 行為，並由 validator 檢查 output family 間的 reference/version consistency。
- 生成型 script 必須區分 editable source、generated snapshot/index、change record 與 rendered consumer；任一階段失敗不得以部分輸出覆蓋上一個可用版本，也不得直接手改 generated output 當永久修復。
- Validator 必須檢查 owner/category、版本、identity/reference 完整性與必要 metadata；JSON 可解析或文件能渲染，不代表 owner contract、runtime、schema/RLS 或 external state 相容。
- changelog、future/target、preview/activation signal 只能驅動 review 與 validation；不得自動啟用未核准 capability、改寫 migration、放寬 authorization 或刪除歷史 evidence。
- 修改 script 時同步其 canonical command、tests、受影響 workflow/docs；沿更深層 AGENTS 套用 browser、LINE 等特殊 operation constraints。
