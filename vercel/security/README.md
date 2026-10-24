# Security / deployment protection

本目錄預置 Firewall、DDoS／bot 防護與 Deployment Protection 的設定／驗證入口；不新增防火牆規則、bypass secret 或產品授權邏輯。方案支援範圍查 [Hobby](https://vercel.com/docs/plans/hobby)。

- Provider protection 保護 deployment／request perimeter，業務權限仍由 [Identity & Access](../../docs/owners/identity-access.md) 與 [Request authorization](../../docs/rules/request-authorization.md) 決定。
- 規則變更要檢查 LINE browser、OAuth callback、webhook、scheduler 與測試流量，不能只以一般 browser 成功判斷安全。
- Preview bypass credential 僅供指定 automation，server-only 且不進公開 URL、repository 或 log。

後續驗收：正常／惡意流量、provider callback 可達性、未授權 mutation 拒絕與敏感資料不洩漏。高階 WAF／protection 功能不假定 Hobby 全數提供。
