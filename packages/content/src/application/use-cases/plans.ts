import { createHash } from "node:crypto";
import type { ResourceBasis } from "@line_bot_v1/resources/domain/resource-reference";
import type {
  ContentPlanHistory,
  ContentPlanReceipt,
  ContentPlanRevisionDto,
} from "../../contracts/dto/plans.js";
import { contentPlanRevisionDto } from "../../contracts/dto/plans.js";
import type { ContentPlanReads, ContentPlanTransactions } from "../../contracts/output/plans.js";
import { ContentError, contentErrorFromUnknown } from "../../domain/error.js";
import {
  type ContentResourcePin,
  changedResourcePins,
  expandContractDocument,
  reviseContentPlan,
} from "../../domain/plan.js";
import { canEditContent } from "../../domain/policies/access.js";
import { parseContentPlanCommand } from "../commands/plans.js";
import { contentHistoryCursor, contentPlanQuery, contentRepositoryId } from "../queries/plans.js";

function stableUuid(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  bytes[12] = "5";
  bytes[16] = ((Number.parseInt(bytes[16] ?? "0", 16) & 3) | 8).toString(16);
  const hex = bytes.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertResourceBases(
  pins: readonly ContentResourcePin[],
  resources: readonly ResourceBasis[],
): void {
  if (pins.length !== resources.length)
    throw new ContentError(503, "Content Resource qualification is incomplete.", "UNAVAILABLE");
  pins.forEach((pin, index) => {
    const resource = resources[index];
    if (
      !resource ||
      resource.resourceId !== pin.resourceId ||
      resource.resourceRevisionId !== pin.resourceRevisionId ||
      resource.kind !== pin.kind
    )
      throw new ContentError(409, "Content Resource pin is not eligible.", "SOURCE_INVALID");
  });
}

export function createContentPlans(deps: {
  reads: ContentPlanReads;
  transactions: ContentPlanTransactions;
  now(): number;
}) {
  return {
    async read(
      userId: string,
      query: Readonly<{ repositoryId: string; revisionId?: string }>,
    ): Promise<ContentPlanRevisionDto> {
      try {
        return contentPlanRevisionDto(await deps.reads.read(userId, contentPlanQuery(query)));
      } catch (error) {
        throw contentErrorFromUnknown(error);
      }
    },
    async history(
      userId: string,
      query: Readonly<{ repositoryId: string }>,
      before?: number,
    ): Promise<ContentPlanHistory> {
      try {
        const scope = contentPlanQuery(query);
        const page = await deps.reads.history(
          userId,
          { repositoryId: scope.repositoryId },
          contentHistoryCursor(before),
        );
        return { revisions: page.revisions.map(contentPlanRevisionDto), next: page.next };
      } catch (error) {
        throw contentErrorFromUnknown(error);
      }
    },
    async execute(userId: string, input: unknown): Promise<ContentPlanReceipt> {
      const command = parseContentPlanCommand(input);
      try {
        return await deps.transactions.transact(
          userId,
          { repositoryId: contentRepositoryId(command.repositoryId) },
          { requestId: command.requestId, payload: JSON.stringify(command) },
          async (tx) => {
            if (!canEditContent(tx.scope.permissions))
              throw new ContentError(403, "Content action is not permitted.", "FORBIDDEN");
            const replay = await tx.replay();
            if (replay)
              return {
                requestId: replay.requestId,
                revision: contentPlanRevisionDto(replay.revision),
              };
            if (tx.scope.archived)
              throw new ContentError(409, "Repository is archived.", "LIFECYCLE_CONFLICT");
            const current = await tx.plans.load();
            const context = {
              id: tx.nextId(),
              repositoryId: tx.scope.repositoryId,
              actorUserId: userId,
              at: deps.now(),
              stableId: stableUuid,
            };
            const revision =
              command.action === "import-contract-document"
                ? await (async () => {
                    const expansion = await tx.contractDocuments.readConfirmed(
                      userId,
                      tx.scope.repositoryId,
                      command.contract.documentId,
                      command.contract.revisionId,
                    );
                    if (
                      await tx.plans.hasContractDocumentImport(
                        command.contract.documentId,
                        command.contract.revisionId,
                      )
                    )
                      throw new ContentError(
                        409,
                        "Contract document revision already exists in Content.",
                        "LIFECYCLE_CONFLICT",
                      );
                    return expandContractDocument(
                      current,
                      command.expectedVersion,
                      expansion,
                      context,
                    );
                  })()
                : reviseContentPlan(
                    current,
                    command.expectedVersion,
                    command.action,
                    command.document,
                    context,
                  );
            const changedPins = changedResourcePins(current?.document ?? null, revision.document);
            const resources = changedPins.length
              ? await tx.resources.verifyPinned(
                  userId,
                  tx.scope.repositoryId,
                  changedPins.map(({ resourceId, resourceRevisionId }) => ({
                    resourceId,
                    resourceRevisionId,
                  })),
                  { allowArchived: false },
                )
              : [];
            assertResourceBases(changedPins, resources);
            await tx.plans.save(revision, command.expectedVersion);
            await tx.record(revision);
            return { requestId: command.requestId, revision: contentPlanRevisionDto(revision) };
          },
        );
      } catch (error) {
        throw contentErrorFromUnknown(error);
      }
    },
  };
}
