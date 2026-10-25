# Architecture Decision Records（ADR）

本目錄保存已採用、仍會影響未來選擇的產品、架構與技術決策及其理由。長期規則由各 canonical owner 維護；ADR 不等於 implementation，也不覆蓋 current architecture、schema、source 或 tests。

新 ADR 使用描述性檔名，不使用流水號。內容應至少保留問題、已選決策、非目標或替代方案、不可弱化的 invariant，以及何時必須 promotion 到 canonical truth。尚未採用的提案放在 [RFC](../proposals/README.md)。

## 目標架構

- [Identity、Tenant、Container 與 Resource 目標架構](identity-tenant-container-resource-target-design.md)：未來的身分、租戶、容器、資源、Containment 與 Lineage 分層；尚未成為 current runtime truth。
- [Account identity design](account-identity-design.md)：單一 identity namespace、consumer-specific IDs、Account/Daily Check-in Owner 與不採用方案；source/schema/remote 未完成。
- [Enterprise target design](enterprise-target-design.md)：cross-Organization governance、Account facet 與 bootstrap/security 邊界。
- [Organization target design](organization-target-design.md)：participation/admin/scope，與 Team/Employment 責任分離。
- [Workforce target design](workforce-target-design.md)：Employment/Calendar/Schedule 責任、versioned facts 與 activation gate。
- [Attendance employment-scope target design](attendance-employment-scope-target-design.md)：current Member stream → Employment stream，history/reward/period version 保留。
- [Payroll target design](payroll-target-design.md)：versioned inputs、finalized result/publication 與 Finance boundary。

## Owner 與治理決策

- [Repository owner governance](repository-owner-governance-design.md)：Personal / Organization Repository 的所有權、Repository ADMIN、Organization Owner、成員資格與補登審核邊界。
- [Document intake owner decision](document-intake-owner-design.md)：File 儲存、Intelligence 擷取與目標 Owner 結構化資料，Contract → Content → WBS 固定全量映射與既有資料退役條件；尚未實作。
- [Namespace route topology](namespace-route-topology.md)：全域 login path、root namespace reservation 與公開／受保護路由邊界。
