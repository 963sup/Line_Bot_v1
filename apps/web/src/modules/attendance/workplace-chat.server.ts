import type { WorkplaceChatInput, WorkplaceChatResult } from "@line-work/attendance/domain";
import type { messagingApi } from "@line-work/line-channel/adapters/messaging";
import { miniAppEntryUrl } from "../../shared/presentation/entry-route";

export function workplaceChatInput(
  text?: string,
  postback?: string,
): WorkplaceChatInput | undefined {
  if (text && /^新增打卡地點(?:\s|$)/.test(text))
    return { type: "start", name: text.slice(6).trim() };
  if (text === "打卡地點設定") return { type: "status" };
  if (text && /^半徑(?:\s|$)/.test(text))
    return { type: "radius", radius: Number(text.slice(2).trim()) };
  const match = postback?.match(
    /^workplace:(confirm|cancel|reselect|radius):([a-f0-9-]{36}:\d+)(?::(50|100|200))?$/,
  );
  if (!match) return;
  if (match[1] === "radius") return { type: "radius", token: match[2]!, radius: Number(match[3]) };
  return { type: match[1] as "confirm" | "cancel" | "reselect", token: match[2]! };
}

export function workplaceChatMessage(
  result: WorkplaceChatResult,
  miniAppUrl: string,
): messagingApi.TextMessage | null {
  const { draft, notice } = result;
  if (!draft) return notice ? { type: "text", text: notice } : null;
  const token = `${draft.id}:${draft.revision}`;
  const items: messagingApi.QuickReplyItem[] = [];
  const button = (label: string, action: string) =>
    items.push({
      type: "action",
      action: { type: "postback", label, data: `workplace:${action}:${token}` },
    });
  let text = "";
  switch (draft.phase) {
    case "location":
      text = `正在設定「${draft.name}」。請在 15 分鐘內按「＋ → 位置資訊」選點並傳送，或按下方「選擇位置」。`;
      items.push({ type: "action", action: { type: "location", label: "選擇位置" } });
      break;
    case "radius":
      text = `已收到「${draft.name}」的位置。請選擇打卡半徑，或輸入「半徑 150」。`;
      for (const radius of [50, 100, 200])
        items.push({
          type: "action",
          action: {
            type: "postback",
            label: `${radius} 公尺`,
            data: `workplace:radius:${token}:${radius}`,
          },
        });
      button("重新選點", "reselect");
      break;
    case "confirm":
      text = `請確認新增：\n${draft.name}\n${draft.address || "未提供地址"}\n座標：${draft.latitude}, ${draft.longitude}\n打卡半徑：${draft.radius} 公尺\n確認後才會建立地點。`;
      button("確認新增", "confirm");
      button("重新選點", "reselect");
      break;
    case "saved":
      text = `已建立「${draft.name}」。新增時尚無可打卡人員，請至工作地點管理加入人員。`;
      items.push({
        type: "action",
        action: {
          type: "uri",
          label: "管理可打卡人員",
          uri: miniAppEntryUrl(miniAppUrl, "workplaces"),
        },
      });
      break;
    case "cancelled":
      text = "已取消新增打卡地點。";
  }
  if (!["saved", "cancelled"].includes(draft.phase)) button("取消", "cancel");
  return {
    type: "text",
    text: notice ? `${notice}\n${text}` : text,
    ...(items.length ? { quickReply: { items } } : {}),
  };
}
