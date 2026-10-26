# Storage / configuration resources

本入口預置 Vercel Blob、Global Config／既有 Edge Config 命名的設定資源與 Marketplace persistence 的責任分類；未建立 store、SDK 或存取 token。供應商實際命名、權益與計費以 [Vercel Storage](https://vercel.com/docs/storage) 及目標資源為準。

- 本產品 authoritative SQL 仍在 [Supabase schemas](../../../integration-supabase/src/schemas/README.md)，原檔生命週期仍由 [File](../../../../docs/owners/file.md) 與 [Supabase Storage](../../../integration-supabase/src/storage/README.md) 擁有。
- 不因 Vercel 提供 Blob 就平行保存第二份正式原檔；替換 store 時需獨立定義 Owner adapter、cutover 與恢復契約。
- 低延遲設定分發不作 User、permission、ledger 或其他 durable business truth。Cache 責任見 [Caching](../caching/README.md)。

後續驗收：access scope、版本、stale／outage、資料生命週期、未知寫入結果及 provider／方案成本。資源綁定見 [Integrations](../integrations/README.md)。
