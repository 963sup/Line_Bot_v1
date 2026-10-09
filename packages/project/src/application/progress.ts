import type { ProjectField, ProjectFieldOptionInput } from "../contracts/management.js";

export const projectProgressOptions = [
  { name: "待處理", color: "GRAY", description: "尚未開始" },
  { name: "進行中", color: "BLUE", description: "正在處理" },
  { name: "已完成", color: "GREEN", description: "已完成" },
] as const satisfies readonly ProjectFieldOptionInput[];

export function suggestedProgressName(fields: readonly Pick<ProjectField, "name">[]) {
  const names = new Set(fields.map((field) => field.name.trim().toLocaleLowerCase()));
  let candidate = "工作進度";
  let suffix = 2;
  while (names.has(candidate.toLocaleLowerCase())) candidate = `工作進度 ${suffix++}`;
  return candidate;
}
