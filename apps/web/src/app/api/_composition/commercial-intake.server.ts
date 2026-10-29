import { normalizeCommercialDocument } from "@line_bot_v1/contract/application/normalization/commercial-document";
import { createPostgresCommercialDocuments } from "@line_bot_v1/contract/composition/bootstrap/commercial-documents";
import { createPostgresCommercialIntake, createSupabaseExtractionJsonStore } from "@line_bot_v1/intelligence/composition/bootstrap/commercial-intake";
import { createPostgresFileRevisionQualifier, createPostgresFileSourceReader } from "@line_bot_v1/file/composition/bootstrap/files";
import { businessDatabase } from "@line_bot_v1/platform/postgres";
import type { CommercialWebRuntime } from "../../../modules/document-intake/commercial-intake-http.server";
import { repositoryOwnerScope } from "./repository-owner-scope.server";

let runtime: CommercialWebRuntime | undefined;
export function commercialIntake(): CommercialWebRuntime {
  if (runtime) return runtime;
  const db = businessDatabase();
  const documents = createPostgresCommercialDocuments(db, {
    readDraftInput: async (actor, query) =>
      normalizeCommercialDocument(await intake.readResult(actor, query)),
  }, createPostgresFileRevisionQualifier);
  const persistExtractionResult =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createSupabaseExtractionJsonStore({
          url: process.env.SUPABASE_URL,
          serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        })
      : undefined;
  const intake = createPostgresCommercialIntake({
    db,
    reader: createPostgresFileSourceReader(db),
    qualifier: createPostgresFileRevisionQualifier,
    target: documents,
    ...(persistExtractionResult ? { persistExtractionResult } : {}),
  });
  runtime = { scope: repositoryOwnerScope, intake, documents };
  return runtime;
}
