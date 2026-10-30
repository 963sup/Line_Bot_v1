# Auth 開發規格

身分與權限權威見 [Account](../../../../docs/reference/domains/account.md)、[Identity & Access](../../../../docs/owners/identity-access.md) 與 [External identity mapping](../../../../docs/reference/data/identity-mapping.md)。本目錄預置 provider integration 的驗證入口；不建立第二套 session 或 Account-owned external identity mapping。Current human identity 是 User；舊 membership route 名稱不建立 Member domain。

## Identity flow

一般 LINE User 使用既有 LINE proof。Supabase Auth 是外部 provider proof 的技術來源，沒有 Supabase Auth user 不代表沒有產品內的 User。

Google link 沿用既有流程：可信 User 建立短效 request → 外部 browser 完成 PKCE → 提交 candidate identity → 原 User 明確確認 → Account transaction 建立 external identity mapping。Confirmation 重用既有 Google binding use case 與由 Composition 組裝的 transaction-scoped Port，不建立新的 writer。兩段 callback 各自驗證 origin、state 與有效期；provider callback 成功不直接寫入產品權限。

## 驗證案例

| 情境 | 必須觀察的結果 |
| --- | --- |
| 純 LINE User | 沿既有流程使用產品，不被新增 Supabase session 要求阻擋 |
| 錯誤 state／過期 request／callback 重播 | 拒絕 candidate 或 mapping 寫入 |
| 同 email、不同 provider subject | 不自動合併 User |
| user metadata 帶入管理角色 | 不增加業務權限 |
| candidate 已提交，原 User 未確認 | 不建立正式 mapping |
| 連結期間撤權或狀態改變 | transaction boundary 重新檢查並拒絕不合法 transition |

測試使用合成 identity 與受控 callback fixture，不保存真實 token。Local、provider callback 與 LINE 裝置結果分開記錄；測試接線見 [整合驗證規格](../tests/README.md)。
