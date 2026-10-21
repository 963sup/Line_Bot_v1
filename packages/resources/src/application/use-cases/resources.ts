import type {
  ResourceHistory,
  ResourceReceipt,
  ResourceRevisionDto,
} from "../../contracts/dto/resources.js";
import type { ResourceReads, ResourceTransactions } from "../../contracts/output/resources.js";
import { reviseResource } from "../../domain/resource.js";
import { ResourceError, resourceErrorFromUnknown } from "../../domain/resource-error.js";
import { parseResourceCommand } from "../resource-commands.js";
import {
  historyCursor,
  type ResourceQuery,
  repositoryId,
  resourceHistoryQuery,
  resourceId,
  resourceQuery,
} from "../resource-queries.js";

function dto(revision: Awaited<ReturnType<ResourceReads["read"]>>): ResourceRevisionDto {
  return {
    revisionId: revision.id,
    resourceId: revision.resourceId,
    repositoryId: revision.repositoryId,
    version: revision.version,
    parentRevisionId: revision.parentRevisionId,
    actorUserId: revision.actorUserId,
    at: revision.at,
    action: revision.action,
    kind: revision.kind,
    name: revision.name,
    description: revision.description,
    state: revision.state,
  };
}

function canWrite(permissions: readonly string[]) {
  return permissions.some(
    (permission) => permission === "write" || permission === "maintain" || permission === "admin",
  );
}

export function createResources(deps: {
  reads: ResourceReads;
  transactions: ResourceTransactions;
  now(): number;
}) {
  return {
    async list(userId: string, scope: string, after?: string) {
      try {
        return await deps.reads.list(
          userId,
          repositoryId(scope),
          after === undefined ? undefined : resourceId(after),
        );
      } catch (error) {
        throw resourceErrorFromUnknown(error);
      }
    },
    async read(userId: string, query: ResourceQuery): Promise<ResourceRevisionDto> {
      try {
        return dto(await deps.reads.read(userId, resourceQuery(query)));
      } catch (error) {
        throw resourceErrorFromUnknown(error);
      }
    },
    async history(
      userId: string,
      query: Omit<ResourceQuery, "revisionId">,
      before?: number,
    ): Promise<ResourceHistory> {
      try {
        const scope = resourceHistoryQuery(query);
        const page = await deps.reads.history(userId, scope, historyCursor(before));
        return { revisions: page.revisions.map(dto), next: page.next };
      } catch (error) {
        throw resourceErrorFromUnknown(error);
      }
    },
    async execute(userId: string, input: unknown): Promise<ResourceReceipt> {
      const command = parseResourceCommand(input);
      try {
        return await deps.transactions.transact(
          userId,
          { repositoryId: command.repositoryId, resourceId: command.resourceId },
          { requestId: command.requestId, payload: JSON.stringify(command) },
          async (tx) => {
            if (!canWrite(tx.scope.permissions))
              throw new ResourceError(403, "Resource action is not permitted.", "FORBIDDEN");
            const replay = await tx.replay();
            if (replay) return { requestId: replay.requestId, revision: dto(replay.revision) };
            if (tx.scope.archived)
              throw new ResourceError(409, "Repository is archived.", "LIFECYCLE_CONFLICT");
            const current = await tx.resources.load();
            const edit =
              command.action === "create"
                ? {
                    action: "create" as const,
                    kind: command.kind,
                    name: command.name,
                    description: command.description,
                  }
                : command.action === "edit"
                  ? {
                      action: "edit" as const,
                      name: command.name,
                      description: command.description,
                    }
                  : { action: command.action };
            const revision = reviseResource(current, command.expectedVersion, edit, {
              id: tx.nextId(),
              resourceId: command.resourceId,
              repositoryId: tx.scope.repositoryId,
              actorUserId: userId,
              at: deps.now(),
            });
            await tx.resources.save(revision, command.expectedVersion);
            await tx.record(revision);
            return { requestId: command.requestId, revision: dto(revision) };
          },
        );
      } catch (error) {
        throw resourceErrorFromUnknown(error);
      }
    },
  };
}
