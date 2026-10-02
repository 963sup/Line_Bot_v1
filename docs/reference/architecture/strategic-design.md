# Domain-Driven Design (DDD) Strategic Design

本文件是此 Repository 的 DDD 戰略設計解說與 routing reference，不建立第二份 machine authority。

戰略設計的核心目標是：**在寫第一行 code 前，釐清業務邊界、劃分子域優先級、統一定義通用語言，並以 Context Map 規範跨界限上下文的整合模式**。

GitHub GraphQL semantics 的 authority 是 [vendored FPT JSON](../../../architecture/domain/fpt/)；Line_Bot_v1 owner / invariant / relationship / capability overlay 是 [`architecture/semantic-model.json`](../../../architecture/semantic-model.json)。若本文件與 machine truth 不一致，以 machine truth 為準並修正文檔。

---

## 1. 領域與子域劃分（Domain & Subdomains）

本系統將龐大的企業協作與社群工作空間劃分為三類子域：

```text
               ┌────────────────────────────────────────────────────────┐
               │              全域業務領域 (Problem Space)               │
               └────────────────────────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
  【Core Domain】            【Supporting】              【Generic】
     核心子域                   支撐子域                   通用子域
  ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
  │ Repository   │           │ Enterprise   │           │ Account      │
  │ Explore      │           │ Organization │           │ Namespace    │
  │ DailyCheckIn │           │ Team         │           │ Identity&Acc │
  │ Asset/Wallet │           │ Project      │           │ Notification │
  │ Ledger       │           │ Attendance   │           │ Platform     │
  └──────────────┘           │ Expense      │           │ Adapters     │
                             │ Workforce    │           └──────────────┘
                             │ Payroll      │
                             │ Partners     │
                             └──────────────┘
```

### 1.1 核心域（Core Domain）—— 系統最具競爭力與核心商業價值
- **工作流容器與開源探索 (`repository`, `explore`)**：
  - 提供類似 GitHub 的 Repository、Issue、Discussion、Star、Label、Milestone 等協作容器。
  - `explore` 作為發現視圖，驅動用戶活躍度。
- **簽到獎勵與代幣經濟循環 (`daily-check-in`, `asset`, `wallet`, `ledger`)**：
  - 核心留存與激勵飛輪：連續每日簽到（Streak）觸發獎勵結算。
  - 由 `asset` 定義資產代碼，`wallet` 提供餘額操作入口，底層由 `ledger` 透過複式記帳保證金融級一致性。

### 1.2 支撐子域（Supporting Subdomain）—— 支撐核心域運行的業務邏輯
- **企業組織治理 (`enterprise`, `organization`, `team`)**：
  - 企業多組織架構、跨組織團隊、邀請審核與成員從屬關係。
- **內部管理與出勤報銷 (`attendance`, `workforce`, `expense`, `payroll`)**：
  - 員工打卡（地理圍欄驗證）、排班規劃、費用報銷審批、薪資結算準備。
- **專案規劃與外部連結 (`project`, `partners`, `assistant`)**：
  - ProjectV2 任務清單與自訂欄位、外部合作夥伴目錄、AI 智慧助手工作流協調。

### 1.3 通用子域（Generic Subdomain）—— 標竿化、無特殊商業機密的基礎架構
- **身分識別與命名空間 (`account`, `namespace`)**：
  - 全域登入憑證管理、頂層 URL 保留字與防碰撞命名空間分配。
- **授權權限體系 (`identity-access`)**：
  - 基於角色的權限驗證（RBAC）、Subject Version 遞增與權限快照。
- **通訊與通道適配 (`notifications`, `line`, `google-workspace`, `platform`)**：
  - 訊息推送、LINE Webhook 與 Google Workspace OAuth 通訊適配器、技術底層工具。

---

## 2. 界限上下文（Bounded Context）對照

界限上下文（Bounded Context）是**模型和通用語言發揮作用的顯式邊界**。在同一 Context 內，名詞意義明確無二義性。

| 界限上下文 (Bounded Context) | 負責的模組 (Owner Packages) | 核心聚合根 (Aggregate Roots) | 邊界守則 (Context Invariants) |
| :--- | :--- | :--- | :--- |
| **`AccountContext`** | `@line_bot_v1/account` | `Account`, `UserProfile` | 只管「你是誰」，不管「你在組織裡能做什麼」。全域 Login 委派給 Namespace。 |
| **`NamespaceContext`** | `@line_bot_v1/namespace` | `AccountLogin`, `RootReservation` | 負責頂層 URL 與登入名唯一性，保證不與系統保留字衝突。 |
| **`WorkCollaborationContext`** | `@line_bot_v1/repository`<br>`@line_bot_v1/team`<br>`@line_bot_v1/explore` | `Repository`, `Issue`, `Discussion`, `Team` | 協作容器模型。Issue 與 Discussion 嚴格附屬於單一 Repository。 |
| **`GovernanceContext`** | `@line_bot_v1/enterprise`<br>`@line_bot_v1/organization` | `Enterprise`, `Organization`, `Invitation` | 組織與企業成員資格。Invitation 只是意向，不可直接作為 Affiliation 授權依據。 |
| **`ProjectContext`** | `@line_bot_v1/project` | `ProjectV2`, `ProjectItem` | 規劃模型。ProjectItem 只是對 Issue 的參照，不得取得或修改 Issue 核心真理。 |
| **`DailyCheckInContext`** | `@line_bot_v1/daily-check-in` | `DailyCheckInClaim`, `StreakRecord` | 業務日期內嚴格單次簽到，幂等重試，結算時發送事件驅動錢包入帳。 |
| **`EconomyContext`** | `@line_bot_v1/asset`<br>`@line_bot_v1/wallet` | `Asset`, `WalletAccount` | 錢包餘額與持有量。對外提供信用變更入口，對內委派給 Ledger 記帳。 |
| **`LedgerContext`** | `@line_bot_v1/ledger` | `LedgerTransaction`, `LedgerEntry` | **內部封閉上下文**。複式記帳（借貸平衡），不可變更歷史流水，禁止 Web 直連。 |
| **`AttendanceContext`** | `@line_bot_v1/attendance` | `Workplace`, `AttendanceSession` | 打卡狀態單向流動（Checked-in ➔ Checked-out），地理圍欄即時檢驗。 |
| **`ExpenseContext`** | `@line_bot_v1/expense` | `ExpenseClaim`, `Receipt` | 報銷審批狀態機，單據照片上傳意向驗證，審批通過觸發支付事件。 |
| **`IdentityAccessContext`** | `@line_bot_v1/identity-access` | `RoleAssignment`, `PermissionPolicy` | 獨立權限上下文。各領域透過查詢此 Context 判定目前使用者是否可執行特定命令。 |
| **`NotificationsContext`** | `@line_bot_v1/notifications` | `NotificationReceipt` | 訊息投遞證據儲存，不持有事件源頭真理，保證冪等派發。 |

---

## 3. 上下文映射圖（Context Map）

上下文映射圖描述各個 Bounded Context 之間的**團隊關係、依賴方向與整合模式**：

```text
               ┌───────────────────────┐
               │    IdentityAccess     │ (Upstream / OHS)
               └───────────────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       ▼ [CF / Query]      ▼ [CF / Query]      ▼ [CF / Query]
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Governance  │     │ WorkCollab  │     │ Attendance  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       ▼ [C/S / Event]     │                   ▼ [C/S / Event]
┌─────────────┐            │            ┌─────────────┐
│ Project     │            │            │ DailyCheckIn│
└─────────────┘            │            └─────────────┘
                           │                   │
                           │ [C/S / Event]     ▼ [C/S / Event]
                           │            ┌─────────────┐
                           └───────────>│ Economy     │ (Wallet)
                                        └─────────────┘
                                               │
                                               ▼ [Shared Kernel / Strict Internal]
                                        ┌─────────────┐
                                        │ Ledger      │ (Private Consistency)
                                        └─────────────┘
```

### 3.1 跨上下文整合模式（Integration Modes）
1. **Open Host Service (OHS) / Published Language (PL)**：
   - `IdentityAccessContext` 與 `NamespaceContext` 作為全域基礎設施，透過標準公開契約（Contracts）向所有下游提供查詢。
2. **Customer / Supplier (C/S)**：
   - `DailyCheckInContext` (Customer) 依賴 `EconomyContext` (Supplier) 發放獎勵。簽到模組發出結算命令，錢包模組執行餘額入帳。
3. **Conformist (CF, 順應者)**：
   - `Explore` 投影模組完全順應 `Repository` 領域的資料結構，不做額外概念轉換。
4. **Anti-Corruption Layer (ACL, 防腐層)**：
   - `@line_bot_v1/line` 與 `@line_bot_v1/google-workspace` 內部設置 ACL，將外部不穩定的 Webhook Payload 或 Google OAuth Token 轉換為內部標準 Domain Command。
5. **Separate Ways (封閉隔離)**：
   - `LedgerContext` 封閉在核心內部，與前端 `apps/web` 保持 Separate Ways，嚴禁任何直接路由穿透。

---

## 4. 通用語言對照字典（Ubiquitous Language）

在不同的界限上下文中，同一個現實物件具有**不同的模型投影與專業術語**：

### 4.1 「用戶」在各上下文的多態語意（Polymorphic Concept）

| 界限上下文 | 專用術語 (Ubiquitous Term) | 核心概念與關注點 |
| :--- | :--- | :--- |
| **`AccountContext`** | **`User` (帳戶主體)** | 登入憑證、電子郵件、個人主頁資料（Profile）、認證狀態。 |
| **`GovernanceContext`**| **`Member` / `Affiliate` (成員)** | 組織成員資格、加入日期、企業組織指派關係。 |
| **`WorkCollabContext`**| **`Collaborator` / `Author`** | 程式庫存取者、Issue 建立者、Discussion 參與者、Star 發起人。 |
| **`AttendanceContext`**| **`Staff` / `Worker` (在職員工)** | 打卡主體、排班對象、目前出勤狀態（Present / Absent）。 |
| **`EconomyContext`**   | **`Holder` / `Beneficiary` (持有人)**| 錢包持有者、資產收益人、代幣受贈帳號。 |
| **`IdentityAccess`**   | **`Subject` (授權主體)** | 帶有特定版本（Version）與權限角色（Roles）的安全上下文主體。 |

### 4.2 核心領域關鍵術語表

- **`Root Reservation`（根保留字）**：全域 Login 命名空間中被系統保留的路徑（如 `admin`, `api`, `settings`），防止與系統頁面撞名。
- **`Streak`（連續簽到）**：以 UTC 業務日期計算的連續有效簽到天數，中斷則重置為 1。
- **`Double-Entry Balancing`（借貸平衡）**：Ledger 記帳的核心不變性，一筆交易內借方（Debit）總額必須等於貸方（Credit）總額。
- **`Workplace Bounds`（工作場所邊界）**：包含經緯度與半徑的地理圍欄，用於物理判定員工打卡是否有效。
- **`Invitation vs. Affiliation`**：邀請（Invitation）僅為未確認意向；接受並通過審核後才轉化為成員歸屬（Affiliation）。

---

## 5. 領域事件（Domain Events）清單

領域事件表示**領域內已經發生且不可抹滅的重要事實**（Past-tense naming），用於非同步通訊與解除耦合：

| 領域事件 (Domain Event) | 發布者 (Publisher) | 訂閱者 (Subscribers) | 業務效果 |
| :--- | :--- | :--- | :--- |
| **`AccountRegistered`** | `AccountContext` | `Namespace`, `Notifications` | 鎖定 Login 命名空間，發送歡迎通知。 |
| **`CheckInClaimed`** | `DailyCheckInContext` | `WalletContext`, `Notifications` | 觸發連續簽到獎勵計算，發起錢包入帳命令。 |
| **`WalletCredited`** | `EconomyContext` | `Notifications` | 錢包餘額變更完成，推送交易明細通知。 |
| **`AttendanceClockedIn`**| `AttendanceContext` | `WorkforceContext`, `AuditContext` | 記錄出勤事實，更新即時在崗看板。 |
| **`ExpenseApproved`** | `ExpenseContext` | `WalletContext`, `LedgerContext` | 報銷審批完成，產生待報銷支付款項。 |
| **`RepositoryStarred`** | `WorkCollabContext` | `ExploreContext`, `Notifications` | 更新熱門趨勢權重，通知倉庫擁有者。 |
| **`RoleAssigned`** | `IdentityAccess` | 各業務上下文快取 | 遞增 Subject Version，使既有權限快照失效重刷。 |

---

## 6. 戰略設計落實到戰術架構（Tactical Hexagonal）

戰略設計定義的 Bounded Context 直接決定了 `packages/` 模組的實作骨架：

```text
[Bounded Context]  ───對應實作───>  packages/<owner>/src/
                                     ├── domain/        (核心 Aggregate, Entities, Events)
                                     ├── contracts/     (Inbound/Outbound Ports, DTOs)
                                     ├── application/   (Use Cases 實作, Command Handlers)
                                     └── adapters/      (Postgres/Supabase 實作, 外部通訊)
```

1. **一個 Bounded Context 通常對應一個或少數高凝聚的 Package**。
2. **跨 Context 的溝通一律透過 `contracts/` 定義的公開介面**。
3. **資料庫層面**：透過 `architecture/data-topology.json` 確保每個 Aggregate Root 只擁有其私有的 Data Tables，嚴禁跨 Context 任意 JOIN 內部表。

---

## 7. 第一性原理動態架構支柱（First-Principles Architectural Pillars）

靜態名詞與邊界劃分僅是地圖；在動態執行與狀態突變時，必須由以下 6 大第一性原理支柱守護系統不變性：

### 7.1 聚合根與事務邊界定理（Aggregate & Transaction Boundary Rule）
- **第一性原理**：一個資料庫事務（Database Transaction）在原則上**只允許修改「一個」聚合根（Aggregate Root）**。
- **強一致性（Immediate Consistency）**：僅封裝於單一聚合內部（例如單一記帳交易的借貸平衡、單一簽到紀錄的防重複）。
- **最終一致性（Eventual Consistency）**：跨聚合或跨界限上下文的變更（如簽到成功 ➔ 觸發錢包加幣），一律透過**領域事件（Domain Events）**驅動，嚴禁開啟跨模組的巨大分散式事務或跨庫鎖定。

### 7.2 事務性寄件匣模式（Transactional Outbox Pattern）
- **第一性原理**：Dual-Write（同時寫入資料庫與向訊息隊列/網路發布事件）在物理上無法保證原子成功。
- **實作規範**：
  - 聚合狀態變更與領域事件記錄必須在**同一個 PostgreSQL 交易**中完成寫入：
    ```sql
    BEGIN;
    UPDATE daily_check_in_claims SET ... WHERE id = $1;
    INSERT INTO outbox_events (event_name, payload, status) VALUES ('CheckInClaimed', '{...}', 'pending');
    COMMIT;
    ```
  - 外部派發由背景 Worker 或 Supabase 變更捕獲非同步派送，保證「至少送達一次（At-least-once delivery）」。

### 7.3 冪等性與請求指紋（Idempotency & Replay Protection）
- **第一性原理**：分散式環境與非同步通訊下，任何請求與事件都「必然」會發生重試與重複抵達。
- **實作規範**：
  - **命令端（Command）**：寫入操作必須支援 `Idempotency-Key`，或利用業務天然唯一性組合（如 `(account_id, business_date)`）建立資料庫級 Unique Index。
  - **事件消費端（Consumer）**：處理事件前先檢查已處理事件表（Dedup Table）；若已處理過則直接返回成功（No-op），確保具備重放安全性（Replay-Safe）。

### 7.4 讀寫分離投影（CQRS & Projection Pattern）
- **第一性原理**：保護業務不變性的模型（寫模型 / Write Model）與滿足高效檢索呈現的模型（讀模型 / Read Model），其資料結構本質上互斥。
- **實作規範**：
  - **Command 寫流程**：透過 Port 載入純淨的 Aggregate ➔ 驗證不變性 ➔ 執行持久化。
  - **Query 讀流程**：如 `@line_bot_v1/explore` 探索看板、首頁彙整視圖，直接透過專屬的 Read Port 讀取資料庫 Projection 視圖（如 Postgres View 或唯讀快取），**徹底繞過 Domain 實體的建構與鎖定**，兼顧純淨與極致讀取效能。

### 7.5 領域錯誤分類學（Domain Error Taxonomy & Result Pattern）
- **第一性原理**：業務失敗（Business Rejection）是預期中的邏輯分支，不是非預期的程式異常崩潰。
- **實作規範**：
  - 在 `contracts/` 中使用統一的結構化 `Result<T, E>` 型別返回結果，避免拋出未經型別檢查的例外：
    ```typescript
    export type Result<T, E = DomainError> =
      | { ok: true; value: T }
      | { ok: false; error: E };
    ```
  - **標準錯誤分類與 HTTP 映射**：
    1. **`InvariantViolation`**：違反業務規則（如餘額不足、已完成簽到）➔ HTTP 422。
    2. **`ConcurrencyConflict`**：樂觀鎖版本衝突（OCC Version mismatch）➔ HTTP 409。
    3. **`EntityNotFound`**：指定的聚合根不存在 ➔ HTTP 404。
    4. **`Unauthorized / Forbidden`**：認證失效或缺乏授權角色 ➔ HTTP 401 / 403。
    5. **`InfrastructureFailure`**：底層資料庫或第三方連線異常 ➔ HTTP 503。

### 7.6 防腐層實體架構（Concrete Anti-Corruption Layer Architecture）
- **第一性原理**：外部第三方程式庫、供應商 SDK 與外界資料不可信，絕不允許直接流入核心領域。
- **實作規範**：
  - 在 `adapters/` 中設立防腐三件套：
    1. **Translator / Mapper**：將外部不規則的 DTO / Payload 消毒並轉化為內部純淨的 Value Objects。
    2. **Adapter Client**：具體實作在 `contracts/` 宣告的 Outbound Port 介面。
    3. **Error Translator**：將外部例外（如 AxiosError, ProviderError）捕捉並包裝為受控的內部 `InfrastructureError`。

---

## 8. 系統端到端因果鏈心智模型（End-to-End Causality Flow）

開發 24 個 Package 時，整體資料流與因果突變遵循此標準閉環：

```text
HTTP / Webhook / UI (Inbound Adapter)
          │
          ▼ [Command with Idempotency Key]
┌────────────────────────────────────────────────────────┐
│ Application Service                                    │
│  1. 呼叫 IdentityAccess Port 驗證呼叫者權限            │
│  2. 透過 Repository Port 載入單一 Aggregate Root (OCC) │
│  3. 執行 Aggregate.mutate(command) -> 驗證業務不變性   │
│  4. 產生 Domain Events                                 │
│  5. 透過 Repository Port 在同一個 DB Transaction 存入：│
│     - Aggregate State (Version + 1)                    │
│     - Outbox Event Record                              │
│  6. 回傳 Result<TSuccess, TDomainError>                │
└────────────────────────────────────────────────────────┘
          │ (Database Commit)
          ▼
   [Outbox Worker] ──(Asynchronous Event)──> Other Bounded Contexts (Eventual Consistency)
```

