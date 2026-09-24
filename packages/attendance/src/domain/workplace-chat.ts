import type { WorkplaceCommand } from "./workplaces.js";

export type WorkplaceChatInput =
  | { type: "start"; name: string }
  | { type: "location"; latitude: number; longitude: number; address: string }
  | { type: "radius"; radius: number; token?: string }
  | { type: "confirm" | "cancel" | "reselect"; token: string }
  | { type: "status" };
export type WorkplaceChatDraft = {
  id: string;
  revision: number;
  name: string;
  phase: "location" | "radius" | "confirm" | "saved" | "cancelled";
  expiresAt: number;
  lastEventAt: number;
  latitude?: number;
  longitude?: number;
  address?: string;
  radius: number;
};
export type WorkplaceChatResult = {
  draft: WorkplaceChatDraft | null;
  notice?: string;
};

export function transitionWorkplaceChat(
  current: WorkplaceChatDraft | null,
  input: WorkplaceChatInput,
  now: number,
  eventAt: number,
  newId: string,
): WorkplaceChatResult & { command?: WorkplaceCommand } {
  const active =
    current && !["saved", "cancelled"].includes(current.phase) && current.expiresAt > now;
  if (current && eventAt < current.lastEventAt)
    return { draft: current, notice: "這是較早的操作，請使用最新訊息。" };
  if (input.type === "start") {
    if (active) return { draft: current, notice: "請先完成或取消目前的地點設定。" };
    const name = input.name.trim();
    if (!name || name.length > 100)
      return { draft: null, notice: "請輸入「新增打卡地點 名稱」，名稱限 100 字。" };
    if (eventAt < now - 15 * 60_000) return { draft: null, notice: "指令已逾期，請重新輸入。" };
    return {
      draft: {
        id: newId,
        revision: 1,
        name,
        phase: "location",
        expiresAt: now + 15 * 60_000,
        lastEventAt: eventAt,
        radius: 100,
      },
    };
  }
  if (!active) {
    if (input.type === "status" && current?.phase === "saved") return { draft: current };
    return input.type === "location"
      ? { draft: null }
      : { draft: null, notice: "目前沒有進行中的設定。請輸入「新增打卡地點 名稱」。" };
  }
  const draft = { ...current };
  if (
    "token" in input &&
    input.token !== undefined &&
    input.token !== `${draft.id}:${draft.revision}`
  )
    return { draft, notice: "按鈕已失效，請使用最新訊息。" };
  if (input.type === "status") return { draft };
  draft.lastEventAt = eventAt;
  draft.revision++;
  if (input.type === "cancel") draft.phase = "cancelled";
  if (input.type === "reselect") {
    draft.phase = "location";
    delete draft.latitude;
    delete draft.longitude;
    delete draft.address;
  }
  if (input.type === "location") {
    if (draft.phase !== "location")
      return { draft: current, notice: "已收到位置。如需修改，請按「重新選點」。" };
    if (
      !Number.isFinite(input.latitude) ||
      Math.abs(input.latitude) > 90 ||
      !Number.isFinite(input.longitude) ||
      Math.abs(input.longitude) > 180
    )
      return { draft: current, notice: "位置資料無效，請重新傳送位置資訊。" };
    Object.assign(draft, {
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address.slice(0, 500),
      phase: "radius",
    });
  }
  if (input.type === "radius") {
    if (draft.latitude === undefined || draft.longitude === undefined)
      return { draft: current, notice: "請先傳送位置資訊。" };
    if (!Number.isInteger(input.radius) || input.radius < 1 || input.radius > 10000)
      return { draft: current, notice: "半徑請輸入 1 至 10000 的整數，例如「半徑 150」。" };
    draft.radius = input.radius;
    draft.phase = "confirm";
  }
  if (input.type === "confirm") {
    if (draft.phase !== "confirm" || draft.latitude === undefined || draft.longitude === undefined)
      return { draft: current, notice: "請先完成位置與半徑設定。" };
    draft.phase = "saved";
    return {
      draft,
      command: {
        action: "save",
        id: draft.id,
        requestId: draft.id,
        expectedVersion: 0,
        name: draft.name,
        description: draft.address ?? "",
        latitude: draft.latitude,
        longitude: draft.longitude,
        radius: draft.radius,
        enabled: true,
      },
    };
  }
  return { draft };
}
