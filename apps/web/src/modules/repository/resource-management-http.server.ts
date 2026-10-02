import type { createRepositoryResourceManagement } from "@line_bot_v1/repository/application/resource-management";
import { RepositoryError } from "@line_bot_v1/repository/domain";
import { jsonResponse } from "../../shared/server/http";
import { repositoryBody, repositoryFailure } from "./http.server";

type RepositoryResourceManagement = ReturnType<typeof createRepositoryResourceManagement>;
type Identity = (request: Request) => Promise<string>;
type ResourceFamily = "label" | "milestone";

const familyActions: Record<ResourceFamily, ReadonlySet<string>> = {
  label: new Set(["create-label", "update-label", "delete-label"]),
  milestone: new Set([
    "create-milestone",
    "update-milestone",
    "open-milestone",
    "close-milestone",
  ]),
};

export async function repositoryResourceManagementRequest(
  request: Request,
  family: ResourceFamily,
  management: Pick<RepositoryResourceManagement, "execute">,
  identity: Identity,
) {
  try {
    const body = await repositoryBody(request);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !familyActions[family].has(String((body as Record<string, unknown>).action ?? ""))
    ) {
      throw new RepositoryError(400, "Repository resource API 動作不正確。");
    }
    return jsonResponse(await management.execute(await identity(request), body));
  } catch (error) {
    return repositoryFailure(error);
  }
}
