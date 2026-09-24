/**
 * ============================================================================
 * 第一性原理分析：支出領域模型 (Expense Domain Model)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    在多人通訊軟體（LINE 群組）環境中，記帳操作具備「高延遲、分散式、非同步」特徵。
 *    必須在不依賴資料庫鎖與外部框架的前提下，確保財務資料的完整性、精確性與並行安全。
 *
 * 2. 核心公理與不變量 (Core Invariants):
 *    - 【精確度公理】：金額以字串表示而非 IEEE 754 浮點數，消除二進位浮點捨入誤差（如 0.1 + 0.2 != 0.3）。
 *    - 【純淨性公理】：Domain 層不依賴任何外部 I/O、SDK 或儲存驅動，所有規則均為確定性純函數 (Pure Functions)。
 *    - 【不可篡改狀態機】：
 *        [pending] --(OCR辨識成功)--> [draft] --(使用者儲存)--> [draft]
 *                                        |         |
 *                                   (使用者確認)  (使用者取消)
 *                                        v         v
 *                                   [confirmed] [cancelled]
 *    - 【樂觀並發控制 (OCC)】：透過遞增整數 `revision` 實現 CAS (Compare-And-Swap) 語意，防範網路延遲導致覆蓋寫入。
 *    - 【終態等冪 (Terminal Idempotency)】：已進入 confirmed 或 cancelled 狀態時，重複的終端指令視為安全等冪，不拋出衝突。
 * ============================================================================
 */

/**
 * 支出實體的可編輯業務欄位集合
 * 包含交易對象、金額、幣別、日期、憑證號碼、專案歸屬與支付方式。
 */
export type ExpenseFields = {
  merchant: string;
  amount: string;
  currency: string;
  date: string;
  invoiceNumber: string;
  project: string;
  payment: "" | "advance" | "company" | "unpaid";
};

/**
 * 支出聚合根實體 (Expense Aggregate Root)
 * 結合領域欄位與分散式追蹤屬性（UUID id、流水號 number、擁有者 owner、群組 scope、圖片關聯 imageId、狀態 status、版號 revision）。
 */
export type Expense = ExpenseFields & {
  id: string;
  number: number;
  owner: string;
  scope: string;
  imageId: string;
  status: "pending" | "draft" | "confirmed" | "cancelled";
  revision: number;
  createdAt: number;
};

/**
 * 變更支出狀態的操作指令 (Command)
 * 攜帶目標版號以執行樂觀並發校驗。
 */
export type ExpenseCommand = {
  type: "save" | "confirm" | "cancel";
  revision: number;
  fields?: unknown;
};

/**
 * 領域專屬異常類型
 * 綁定 HTTP 相容狀態碼以簡化上層傳輸適配，同時隔離底層呼叫堆疊。
 */
export class ExpenseError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * 第一性驗證：支出欄位防禦性清洗與邊界校驗
 *
 * 物理與邏輯邊界：
 * 1. 嚴格白名單：阻斷原型鏈污染與非預期欄位進入持久層。
 * 2. 控制字元防禦：禁止 ASCII 0x00-0x1F 控制字元，防止終端機溢位與日誌注入攻擊。
 * 3. 日期真實性校驗：透過 ISO 8601 與雙向字串回環比對（Round-trip Verification），
 *    防止如 "2026-02-30" 被 JavaScript 自動滾動修正為 "2026-03-02"。
 * 4. 必填條件閘門：僅在 complete (確認入帳) 階段強制要求全部必要欄位齊備；草稿階段允許暫存殘缺狀態。
 */
export function validateExpenseFields(input: unknown, complete = false): ExpenseFields {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ExpenseError(400, "資料格式不正確。");
  }
  const v = input as Record<string, unknown>;
  const keys = ["merchant", "amount", "currency", "date", "invoiceNumber", "project", "payment"];

  // 檢查白名單鍵值與基礎型別長度、不可包含控制字元
  if (
    Object.keys(v).some((k) => !keys.includes(k)) ||
    keys.some(
      (k) =>
        typeof v[k] !== "string" ||
        (v[k] as string).length > 120 ||
        /[\u0000-\u001f]/.test(v[k] as string),
    )
  ) {
    throw new ExpenseError(400, "欄位格式不正確。");
  }

  const f = Object.fromEntries(keys.map((k) => [k, (v[k] as string).trim()])) as ExpenseFields;

  // 金額必須為最多兩位小數的正數數值字串
  if (f.amount && (!/^\d{1,9}(?:\.\d{1,2})?$/.test(f.amount) || Number(f.amount) <= 0)) {
    throw new ExpenseError(400, "金額需大於零，最多兩位小數。");
  }

  // 幣別符合 ISO 4217 三位大寫英文字母標準
  if (f.currency && !/^[A-Z]{3}$/.test(f.currency)) {
    throw new ExpenseError(400, "幣別請使用三碼，例如 TWD。");
  }

  // 日期雙向回環驗證：確保日期存在且合法，避免月份溢位跳轉
  if (
    f.date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) ||
      Number.isNaN(Date.parse(f.date)) ||
      new Date(f.date).toISOString().slice(0, 10) !== f.date)
  ) {
    throw new ExpenseError(400, "日期格式不正確。");
  }

  // 付款方式必須為枚舉允許值
  if (!["", "advance", "company", "unpaid"].includes(f.payment)) {
    throw new ExpenseError(400, "請選擇付款方式。");
  }

  // 若為正式入帳確認 (complete=true)，不可留空關鍵財務欄位
  if (
    complete &&
    [f.merchant, f.amount, f.currency, f.date, f.project, f.payment].some((x) => !x)
  ) {
    throw new ExpenseError(400, "請補齊商家、金額、幣別、日期、專案與付款方式。");
  }

  return f;
}

/**
 * 第一性狀態轉移函數：執行狀態躍遷與樂觀鎖校驗 (Transition Function)
 *
 * 公理推導：
 * 1. 輸入為前一個不可變實體 (Previous Immutable State) 與指令 (Command)。
 * 2. 輸出為新狀態實體 (Next State)，版號 (revision) 遞增 1。
 * 3. 衝突拒絕 (409 Conflict)：若傳入版號與當前版號不一致，說明在傳輸期間已被他人修改，必須拒絕以防「更新遺失 (Lost Update)」。
 * 4. 終態保護：已確認 (confirmed) 或已取消 (cancelled) 的支出屬於終局狀態，拒絕進一步修改。
 */
export function applyExpenseCommand(expense: Expense, command: ExpenseCommand): Expense {
  if (
    !command ||
    !["save", "confirm", "cancel"].includes(command.type) ||
    !Number.isInteger(command.revision)
  ) {
    throw new ExpenseError(400, "操作格式不正確。");
  }

  // 等冪性保障：重複收到終態指令時直接返回當前實體，不重複產生審計事件
  if (
    (expense.status === "confirmed" && command.type === "confirm") ||
    (expense.status === "cancelled" && command.type === "cancel")
  ) {
    return expense;
  }

  // 樂觀並發檢查：版本不一致視為衝突
  if (expense.revision !== command.revision) {
    throw new ExpenseError(409, "資料已更新，請重新載入後再操作。");
  }

  // 終態防護：不可在終態上進行二次變更
  if (["confirmed", "cancelled"].includes(expense.status)) {
    throw new ExpenseError(409, "這筆支出已結束，不能再修改。");
  }

  // 取消轉移：直接躍遷為 cancelled 終態
  if (command.type === "cancel") {
    return { ...expense, status: "cancelled", revision: expense.revision + 1 };
  }

  // 儲存與確認轉移：必須處於 draft 狀態（即已完成收據辨識或初步填寫）
  if (expense.status !== "draft") {
    throw new ExpenseError(409, "請先辨識收據。");
  }

  return {
    ...expense,
    ...validateExpenseFields(command.fields, command.type === "confirm"),
    status: command.type === "confirm" ? "confirmed" : "draft",
    revision: expense.revision + 1,
  };
}
