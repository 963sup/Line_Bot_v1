# Marketplace / integrations

本目錄預置 Marketplace resource、環境注入與外部供應商整合的入口；不安裝 integration、建立付費資源或修改 project 綁定。現有 provider contract 見 [Vercel](../../../../docs/reference/platform/README.md#vercel)、[Supabase](../../../../docs/reference/platform/README.md#supabase) 與 [Platform owner](../../../../docs/owners/platform.md)。

- 綁定前確認 exact team／project／resource、consumer、環境範圍與 credential owner。
- Vercel Hobby 與外部供應商的方案、試用及費用各自確認；Marketplace 可安裝不代表資源免費。
- Provider URL／token 的注入沿原有契約，不加 fallback connection、平行 env manifest 或第二個 business writer。
- 新增／移除 integration 需檢查 build、runtime、callback、recovery 與 credential rotation 的實際影響。

後續驗收：環境隔離、resource identity readback、錯誤資源拒絕、credential 失效與解除綁定後的恢復方式。設定分類見 [Environment](../environment/README.md)。
