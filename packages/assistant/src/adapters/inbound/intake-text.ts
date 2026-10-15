import type { IssueDraft } from "../../contracts/dto/issue-draft.js";

export function renderIssueDraft(draft: IssueDraft): string {
  return [
    "📝 Issue 草稿（尚未儲存／指派）",
    draft.title,
    `日期：${draft.dueDate || "待確認"}${draft.timeHint ? ` ${draft.timeHint}` : ""}`,
    "建議待辦：",
    ...draft.checklist.map((item, index) => `${index + 1}. ${item}`),
    ...(draft.questions.length ? ["待確認：", ...draft.questions.map((item) => `• ${item}`)] : []),
    "工具：get_current_time → draft_issue",
  ].join("\n");
}
