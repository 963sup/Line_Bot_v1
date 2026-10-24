import type { ContractDocumentExpansionReader } from "@line_bot_v1/content/contracts/output/plans";
import { ContentError } from "@line_bot_v1/content/domain/error";
import { createPostgresContractDocumentReader } from "@line_bot_v1/contract/composition/bootstrap/documents";
import type { Sql } from "@line_bot_v1/platform/postgres";

/** Application-host integration: Contract supplies its public reader; Content owns expansion rules. */
export function createPostgresContractDocumentExpansion(sql: Sql): ContractDocumentExpansionReader {
  const contract = createPostgresContractDocumentReader(sql);
  return {
    async readConfirmed(actor, repositoryId, documentId, revisionId) {
      const revision = await contract.read(actor, { repositoryId, documentId, revisionId });
      if (!revision)
        throw new ContentError(404, "Contract document revision not found.", "NOT_FOUND");
      if (revision.state !== "CONFIRMED")
        throw new ContentError(
          409,
          "Only confirmed Contract documents can expand into Content.",
          "SOURCE_INVALID",
        );
      const candidate = revision.candidate;
      return {
        documentId: revision.documentId,
        revisionId: revision.id,
        sourceFileId: revision.source.fileId,
        sourceFileRevisionId: revision.source.fileRevisionId,
        sourceFileSha256: revision.source.fileSha256,
        title: candidate.header.title ?? candidate.header.documentNumber ?? "Contract scope",
        lines: candidate.lines.map((line) => {
          if (
            (line.category === "material" || line.category === "service") &&
            (line.uncertain || !line.description || !line.quantity || !line.unit)
          )
            throw new ContentError(
              409,
              "Confirmed Contract line is incomplete for Content mapping.",
              "SOURCE_INVALID",
            );
          return {
            sourceRowId: line.sourceRowId,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            category: line.category,
            uncertain: line.uncertain,
          };
        }),
      };
    },
  };
}
