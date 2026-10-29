export function parseAssistantCommand(
  input: string,
): "clockIn" | "clockOut" | "attendance" | "diary" | "cancel" | "receipt" | "answer" {
  if (/^上班[。！!？?]*$/.test(input.trim())) return "clockIn";
  if (/^下班[。！!？?]*$/.test(input.trim())) return "clockOut";
  if (/^打卡[。！!？?]*$/.test(input.trim())) return "attendance";
  if (/^(?:填寫|填|開啟|打開)?\s*(?:工作)?日誌[。！!？?]*$/.test(input.trim())) return "diary";
  if (/^(取消|算了)[。！!？?]*$/.test(input)) return "cancel";
  if (/發票|收據|記帳|支出|報帳/.test(input)) return "receipt";
  return "answer";
}
