import type { ReceiptIntakeResult } from "@line-work/expense/application/receipt-intake";
import { miniAppEntryUrl } from "../../shared/presentation/entry-route";
import { DIARY_FORM_URL } from "../diary/form";
import { renderExpenseNotice } from "../expense/notice.server";

export function textMessage(text: string) {
  return { type: "text" as const, text };
}

export function receiptMessage(result: ReceiptIntakeResult, miniAppUrl: string) {
  switch (result.type) {
    case "ignored":
      return null;
    case "received":
      return renderExpenseNotice(result.expense, miniAppUrl);
    case "started":
      return textMessage("請在 2 分鐘內傳一張收據，再點「處理」。辨識與核對會在操作頁完成。");
    case "cancelled":
      return textMessage("已取消收件。");
  }
}

export function attendanceMessage(miniAppUrl: string, action?: "clockIn" | "clockOut") {
  const actions = action ? [action] : (["clockIn", "clockOut"] as const);
  return {
    type: "template" as const,
    altText: action === "clockIn" ? "上班" : action === "clockOut" ? "下班" : "選擇上班或下班",
    template: {
      type: "buttons" as const,
      text: "請開啟對應頁面並確認本次定位，成功可領取 0.5 Coin。",
      actions: actions.map((entry) => ({
        type: "uri" as const,
        label: entry === "clockIn" ? "上班" : "下班",
        uri: miniAppEntryUrl(miniAppUrl, entry),
      })),
    },
  };
}

export function diaryMessage() {
  return {
    type: "template" as const,
    altText: `填寫日誌：${DIARY_FORM_URL}`,
    template: {
      type: "buttons" as const,
      text: "前往 Google 表單填寫日誌；如需登入，請使用自己的 Google 帳號。",
      actions: [{ type: "uri" as const, label: "填寫日誌", uri: DIARY_FORM_URL }],
    },
  };
}

export function membershipMessage(
  status: "paused" | "active" | "suspended" | undefined,
  miniAppUrl: string,
) {
  if (status === "suspended") return textMessage("會員目前無法使用，請聯絡管理者。");
  const intent = status === "paused" ? "restore" : status ? "membership" : "register";
  const label =
    intent === "restore" ? "恢復會員功能" : intent === "register" ? "註冊會員" : "查看會員";
  return {
    type: "template" as const,
    altText: label,
    template: {
      type: "buttons" as const,
      text:
        intent === "restore"
          ? "恢復會員功能後，即可使用工作助手。"
          : intent === "register"
            ? "完成 LINE 會員註冊後，即可使用工作助手。"
            : "查看你的會員資料。",
      actions: [{ type: "uri" as const, label, uri: miniAppEntryUrl(miniAppUrl, intent) }],
    },
  };
}
