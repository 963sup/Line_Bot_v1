import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import type { ProjectManagementView } from "../../contracts/management.js";
import { ProjectError } from "../../domain.js";

type UserLocator = Readonly<{ id: string; login: string }>;
type ProjectUserScope = Readonly<{
  project: Pick<ProjectManagementView["project"], "creator">;
  role: ProjectManagementView["role"];
  collaborators: readonly Pick<ProjectManagementView["collaborators"][number], "kind" | "id">[];
  items: readonly Readonly<{ draft: Readonly<{ assigneeIds: readonly string[] }> | null }>[];
}>;

/** Project owns invitation eligibility and which User labels its current view may resolve. */
export function createProjectUsers(deps: {
  view(subject: string, projectId: string): Promise<ProjectUserScope>;
  actorUserId(subject: string): Promise<string>;
  userByLogin(login: string): Promise<UserLocator | null>;
  userById(userId: string): Promise<UserLocator | null>;
}) {
  return async (
    subject: string,
    query: { projectId: string; login?: string; userIds: readonly string[] },
  ) => {
    const view = await deps.view(subject, query.projectId);
    if (query.login !== undefined) {
      if (view.role !== "ADMIN") throw new ProjectError(403, "只有 Project 管理者能邀請協作者。");
      let login: string;
      try {
        login = normalizeAccountLogin(query.login);
      } catch {
        throw new ProjectError(400, "使用者登入名稱不正確。");
      }
      const user = await deps.userByLogin(login);
      if (!user) throw new ProjectError(404, "找不到可使用的 User。");
      return { user };
    }

    const actorUserId = await deps.actorUserId(subject);
    const visibleUserIds = new Set([
      actorUserId,
      ...(view.project.creator ? [view.project.creator] : []),
      ...view.collaborators.filter((item) => item.kind === "USER").map((item) => item.id),
      ...view.items.flatMap((item) => item.draft?.assigneeIds ?? []),
    ]);
    if (query.userIds.some((id) => !visibleUserIds.has(id))) {
      throw new ProjectError(404, "找不到可使用的 Project 使用者。");
    }
    const users = await Promise.all(
      query.userIds.map(async (id) => ({ id, user: await deps.userById(id) })),
    );
    return { users: users.map(({ id, user }) => ({ id, login: user?.login ?? null })) };
  };
}
