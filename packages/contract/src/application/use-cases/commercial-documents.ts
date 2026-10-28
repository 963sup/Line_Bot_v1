import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  CommercialDocumentStore,
  CommercialDraftRevision,
  CommercialDraftSource,
} from "../../contracts/output/commercial-documents.js";
import { ContractError } from "../../domain/error.js";
import { validateCommercialDocument } from "../commercial-document-validation.js";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const commandSchema = z.strictObject({
  commandId: uuid,
  repositoryId: z.string().min(1).max(128),
  documentId: uuid,
  expectedVersion: z.number().int().nonnegative().max(2147483646),
  extractionResultId: uuid,
});
const sourceQuerySchema = z.strictObject({
  repositoryId: commandSchema.shape.repositoryId,
  fileId: uuid,
  fileRevisionId: uuid,
});
function draftCommandFingerprint(command: z.output<typeof commandSchema>): string {
  return createHash("sha256")
    .update("commercial-document-command/1\nCREATE_DRAFT\n")
    .update(JSON.stringify(command))
    .digest("hex");
}
export function createCommercialDocuments(
  store: CommercialDocumentStore,
  source: CommercialDraftSource,
) {
  return {
    assertReady: store.assertReady.bind(store),
    async createDraftFromExtraction(
      ctx: Readonly<{ actorUserId: string; traceId: string }>,
      input: unknown,
    ) {
      const parsed = commandSchema.safeParse(input);
      if (!parsed.success)
        throw new ContractError(400, "Invalid commercial draft command.", "INVALID_INPUT");
      const command = parsed.data;
      const fingerprint = draftCommandFingerprint(command);
      const existing = await store.receipt(
        ctx.actorUserId,
        { repositoryId: command.repositoryId, commandId: command.commandId },
        fingerprint,
      );
      if (existing) return existing;
      await store.assertReady(ctx.actorUserId, command.repositoryId);
      const draft = await source.readDraftInput(ctx.actorUserId, {
        repositoryId: command.repositoryId,
        extractionResultId: command.extractionResultId,
      });
      if (
        draft.evidenceContext.extractionResultId !== command.extractionResultId ||
        draft.evidenceContext.humanEvidence.length
      )
        throw new ContractError(
          409,
          "Extraction evidence does not match draft source.",
          "SOURCE_INVALID",
        );
      const validated = validateCommercialDocument(draft.content, "DRAFT", draft.evidenceContext);
      if (!validated.valid || !validated.content)
        throw new ContractError(
          400,
          "Invalid commercial draft facts or evidence.",
          "INVALID_INPUT",
        );
      const content = validated.content;
      return store.transact(ctx.actorUserId, command, async (tx) => {
        const replay = await tx.replay(command.commandId, fingerprint);
        if (replay) return replay;
        if (!tx.writable)
          throw new ContractError(403, "Commercial document write denied.", "FORBIDDEN");
        const current = await tx.current(command.documentId);
        if ((current?.version ?? 0) !== command.expectedVersion)
          throw new ContractError(409, "Commercial document version conflict.", "VERSION_CONFLICT");
        if (current?.archived || current?.draftRevisionId)
          throw new ContractError(
            409,
            "Commercial document cannot accept a new draft.",
            "LIFECYCLE_CONFLICT",
          );
        await tx.qualifySource(draft.evidenceContext.source);
        const revision: CommercialDraftRevision = {
          revisionId: randomUUID(),
          documentId: command.documentId,
          repositoryId: command.repositoryId,
          documentVersion: command.expectedVersion + 1,
          parentRevisionId: current?.verifiedRevisionId ?? null,
          schemaVersion: 1,
          reviewState: "DRAFT",
          source: draft.evidenceContext.source,
          extractionResultId: command.extractionResultId,
          content,
          createdByUserId: ctx.actorUserId,
          createdAt: new Date().toISOString(),
        };
        await tx.appendDraft(revision, command.expectedVersion);
        return tx.record(command.commandId, fingerprint, revision);
      });
    },
    read: store.read.bind(store),
    async readBySource(
      actor: string,
      query: Readonly<{ repositoryId: string; fileId: string; fileRevisionId: string }>,
    ) {
      const parsed = sourceQuerySchema.safeParse(query);
      if (!parsed.success)
        throw new ContractError(400, "Invalid commercial source query.", "INVALID_INPUT");
      return store.readBySource(actor, parsed.data);
    },
    receipt(
      actor: string,
      query: Readonly<{ repositoryId: string; commandId: string }>,
      expected?: Readonly<{
        documentId: string;
        expectedVersion: number;
        extractionResultId: string;
      }>,
    ) {
      if (!expected) return store.receipt(actor, query);
      const parsed = commandSchema.safeParse({ ...query, ...expected });
      if (!parsed.success)
        throw new ContractError(400, "Invalid commercial receipt intent.", "INVALID_INPUT");
      return store.receipt(actor, query, draftCommandFingerprint(parsed.data));
    },
  };
}
