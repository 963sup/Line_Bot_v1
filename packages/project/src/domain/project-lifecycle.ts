import type { ProjectAccessRole } from "../domain.js";
import { ProjectError } from "./errors/project-error.js";

export type ProjectLifecycleAction = "close-project" | "reopen-project";
export type ProjectLifecycleState = Readonly<{ version: number; closed: boolean }>;
export type ProjectLifecycleChange = Readonly<{ closed: boolean; closedAt: number | null }>;

export function changeProjectLifecycle(
  current: ProjectLifecycleState,
  role: ProjectAccessRole,
  expectedVersion: number,
  action: ProjectLifecycleAction,
  now: number,
): ProjectLifecycleChange {
  if (current.version !== expectedVersion)
    throw new ProjectError(409, "Project 已更新，請重新讀取後再操作。");
  if (role !== "ADMIN") throw new ProjectError(403, "目前 Project access 不允許此操作。");
  const closed = action === "close-project";
  if (current.closed === closed)
    throw new ProjectError(
      409,
      closed ? "Project 已關閉，目前 planning facts 為唯讀。" : "Project 已開啟。",
    );
  return { closed, closedAt: closed ? now : null };
}
