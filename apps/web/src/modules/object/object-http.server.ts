import { UserError } from "@line_bot_v1/account/domain/user";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { record } from "@line_bot_v1/platform/validation";
import { normalizeRepositoryName, RepositoryError } from "@line_bot_v1/repository/domain";
import type { createObjects } from "@line_bot_v1/resources/application/use-cases/objects";
import { ObjectError } from "@line_bot_v1/resources/domain/error";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

type ObjectWebScope = {
  actorUserId: string;
  repository: { id: string; ownerLogin: string; name: string };
  archived: boolean;
  canEdit: boolean;
  canManageTypes: boolean;
  canManageRepository: boolean;
};

export type ObjectWebRuntime = {
  scope(
    subject: string,
    selector: { ownerLogin: string; repositoryName: string },
  ): Promise<ObjectWebScope>;
  objects(): ReturnType<typeof createObjects>;
};

export type ObjectRequestFamily = "types" | "objects" | "relationships" | "measures";

function pathSelector(owner: string, repository: string) {
  let ownerLogin: string;
  try {
    ownerLogin = normalizeAccountLogin(owner);
  } catch {
    throw new ObjectError(400, "Repository owner login 不正確。", "INVALID_INPUT");
  }
  const repositoryName = normalizeRepositoryName(repository);
  if (!repositoryName) throw new ObjectError(400, "Repository name 不正確。", "INVALID_INPUT");
  return { ownerLogin, repositoryName };
}

async function objectBody(request: Request) {
  const configured = process.env.APP_ORIGIN;
  if (
    !configured ||
    new URL(configured).origin !== configured ||
    !configured.startsWith("https://")
  )
    throw new ObjectError(503, "服務網址尚未設定。", "UNAVAILABLE");
  if (request.headers.get("origin") !== configured)
    throw new ObjectError(403, "請從Line_Bot_v1頁面操作。", "FORBIDDEN");
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw new ObjectError(415, "需要 JSON 格式。", "INVALID_INPUT");
  let text: string;
  try {
    text = await readBodyText(request, 524_288);
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      throw new ObjectError(413, "內容過大。", "INVALID_INPUT");
    throw error;
  }
  try {
    return record(JSON.parse(text));
  } catch {
    throw new ObjectError(400, "資料格式不正確。", "INVALID_INPUT");
  }
}

function failure(error: unknown) {
  const known =
    error instanceof ObjectError ||
    error instanceof RepositoryError ||
    error instanceof UserError ||
    error instanceof RequestIdentityError;
  const status = known ? error.status : 503;
  captureHandledServerError(error, { service: "objects-api", operation: "request", status });
  return jsonResponse(
    {
      error: known ? error.message : "Object 服務暫時不可用，請稍後重試。",
      ...(error instanceof ObjectError ? { code: error.code } : {}),
    },
    status,
  );
}

export async function objectRequest(
  request: Request,
  family: ObjectRequestFamily,
  runtime: ObjectWebRuntime,
  identity: (request: Request) => Promise<string>,
) {
  try {
    const subject = await identity(request);
    const query = new URL(request.url).searchParams;
    const scope = await runtime.scope(
      subject,
      pathSelector(query.get("owner") ?? "", query.get("name") ?? ""),
    );
    const owner = runtime.objects();
    if (request.method === "POST") {
      const command = await objectBody(request);
      if (command.repositoryId !== scope.repository.id)
        throw new ObjectError(
          400,
          "Object scope does not match this Repository URL.",
          "INVALID_INPUT",
        );
      const result =
        (family === "measures" && command.action === "create-measure") ||
        (family === "objects" &&
          (command.action === "set-quantities" || command.action === "create-child")) ||
        (family === "relationships" &&
          (command.action === "set-parent" || command.action === "set-location"))
          ? await owner.executeEngineering(scope.actorUserId, command)
          : family === "measures"
            ? (() => {
                throw new ObjectError(400, "計量操作不正確。", "INVALID_INPUT");
              })()
            : family === "types"
              ? await owner.executeType(scope.actorUserId, command)
              : family === "objects"
                ? await owner.executeObject(scope.actorUserId, command)
                : await owner.executeRelationship(scope.actorUserId, command);
      return jsonResponse(result);
    }
    if (family === "measures")
      return jsonResponse({
        ...scope,
        ...(await owner.listMeasures(scope.actorUserId, {
          repositoryId: scope.repository.id,
          ...(query.has("after") ? { after: query.get("after") ?? "" } : {}),
        })),
      });
    if (family === "types")
      return jsonResponse({
        ...scope,
        ...(await owner.listTypes(scope.actorUserId, {
          repositoryId: scope.repository.id,
          ...(query.has("after") ? { after: query.get("after") ?? "" } : {}),
        })),
      });
    if (family === "relationships") {
      const relationshipId = query.get("relationshipId");
      if ((query.get("view") ?? "list") === "history") {
        if (!relationshipId)
          throw new ObjectError(400, "Relationship ID is required.", "INVALID_INPUT");
        return jsonResponse({
          ...scope,
          ...(await owner.relationshipHistory(scope.actorUserId, {
            repositoryId: scope.repository.id,
            relationshipId,
            ...(query.has("before") ? { before: query.get("before") ?? "" } : {}),
          })),
        });
      }
      const objectId = query.get("objectId");
      if (!objectId) throw new ObjectError(400, "Object ID is required.", "INVALID_INPUT");
      return jsonResponse({
        ...scope,
        ...(await owner.listRelationships(scope.actorUserId, {
          repositoryId: scope.repository.id,
          objectId,
          ...(query.has("after") ? { after: query.get("after") ?? "" } : {}),
        })),
      });
    }
    const objectId = query.get("objectId");
    const view = query.get("view") ?? (objectId ? "object" : "list");
    if (view === "tree") {
      const includeArchived = query.get("includeArchived");
      if (includeArchived !== null && includeArchived !== "true" && includeArchived !== "false")
        throw new ObjectError(400, "封存篩選不正確。", "INVALID_INPUT");
      return jsonResponse({
        ...scope,
        ...(await owner.tree(scope.actorUserId, {
          repositoryId: scope.repository.id,
          ...(query.has("parentId") ? { parentId: query.get("parentId") ?? "" } : {}),
          ...(query.has("after") ? { after: query.get("after") ?? "" } : {}),
          includeArchived: includeArchived === "true",
        })),
      });
    }
    if (view === "structure")
      return jsonResponse({
        ...scope,
        ...(await owner.structure(scope.actorUserId, {
          repositoryId: scope.repository.id,
          rootId: query.get("rootId") ?? "",
          ...(query.has("parentId") ? { parentId: query.get("parentId") ?? "" } : {}),
          ...(query.has("after") ? { after: query.get("after") ?? "" } : {}),
          ...(query.has("groupBy") ? { groupBy: query.get("groupBy") ?? "" } : {}),
        })),
      });
    if (view === "list") {
      const archived = query.get("archived");
      if (archived !== null && archived !== "true" && archived !== "false")
        throw new ObjectError(400, "Object archived filter 不正確。", "INVALID_INPUT");
      return jsonResponse({
        ...scope,
        ...(await owner.listObjects(scope.actorUserId, {
          repositoryId: scope.repository.id,
          ...(query.has("after") ? { after: query.get("after") ?? "" } : {}),
          ...(query.has("typeId") ? { typeId: query.get("typeId") ?? "" } : {}),
          ...(archived === null ? {} : { archived: archived === "true" }),
        })),
      });
    }
    if (!objectId) throw new ObjectError(400, "Object ID is required.", "INVALID_INPUT");
    if (view === "object")
      return jsonResponse({
        ...scope,
        revision: await owner.readObject(scope.actorUserId, {
          repositoryId: scope.repository.id,
          objectId,
          ...(query.has("revisionId") ? { revisionId: query.get("revisionId") ?? "" } : {}),
        }),
      });
    if (view === "history")
      return jsonResponse({
        ...scope,
        ...(await owner.history(scope.actorUserId, {
          repositoryId: scope.repository.id,
          objectId,
          ...(query.has("before") ? { before: query.get("before") ?? "" } : {}),
        })),
      });
    if (view === "compare")
      return jsonResponse({
        ...scope,
        differences: await owner.compareRevisions(scope.actorUserId, {
          repositoryId: scope.repository.id,
          objectId,
          beforeId: query.get("beforeId") ?? "",
          afterId: query.get("afterId") ?? "",
        }),
      });
    throw new ObjectError(400, "Unknown Object query.", "INVALID_INPUT");
  } catch (error) {
    return failure(error);
  }
}
