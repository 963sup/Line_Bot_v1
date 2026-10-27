import type {
  ContractDocumentExpansionReader,
  ContractDocumentSourceReader,
} from "../../contracts/output/plans.js";
import { ContentError } from "../../domain/error.js";

export function createContractDocumentExpansionReader(
  source: ContractDocumentSourceReader,
): ContractDocumentExpansionReader {
  return {
    async readConfirmed(actor, repositoryId, documentId, revisionId) {
      const revision = await source.read(actor, repositoryId, documentId, revisionId);
      if (!revision)
        throw new ContentError(404, "Contract document revision not found.", "NOT_FOUND");
      if (revision.state !== "CONFIRMED")
        throw new ContentError(
          409,
          "Only confirmed Contract documents can expand into Content.",
          "SOURCE_INVALID",
        );
      return {
        documentId: revision.documentId,
        revisionId: revision.id,
        sourceFileId: revision.source.fileId,
        sourceFileRevisionId: revision.source.fileRevisionId,
        sourceFileSha256: revision.source.fileSha256,
        title:
          revision.candidate.header.title ??
          revision.candidate.header.documentNumber ??
          "Contract scope",
        lines: revision.candidate.lines.map((line) => {
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
