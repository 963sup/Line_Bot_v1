# API application composition boundary

繼承 [API](../AGENTS.md) 與 app/Root 約束。本目錄是 concrete dependency composition，不是另一個業務 Owner。

- 只有 Host composition 可以從各 Package 的 Bootstrap API 取得 Postgres/provider factories。業務 Package 只接收它需要的窄 Reader、Command、Query 等公開 Port；不得在 Owner Bootstrap 裡匯入別的 Owner Bootstrap。
- 跨 Owner 的 File → Intelligence → Contract → Content → WBS 是**資料衍生順序**，不是 Package 靜態匯入鏈。Host 串接確切來源 ID/revision/mapping version，不能改寫來源、私有 SQL 或 Domain state。
- Repository 僅提供 container scope/ACL。Issue、Discussion 與 WBS 都依自己的 Owner/權限寫入，不讓 Repository 或 Host 收攏業務規則。
- Host 可以安排 start/status/resume/confirm 的呼叫與依賴接線，但不擁有業務交易、版本、Receipt、授權判斷或持久流程真相；恢復時從各 Owner 已提交的結果與精確 pins 繼續。
- 新增跨 Owner 能力前先核對來源 Owner、最小 Public API、交易內授權與實際 Consumer。沒有對應 Reader 時 fail closed；不可用泛用 Service Locator 或複製的業務流程藏依賴。
