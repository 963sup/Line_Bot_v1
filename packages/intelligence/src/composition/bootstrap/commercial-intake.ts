import {
  createPostgresFileRevisionQualifier,
  createPostgresFileSourceReader,
} from "@line_bot_v1/file/composition/bootstrap/files";
import type { FileSourceReader } from "@line_bot_v1/file/contracts/output/references";
import { inspectOpenAIDocument } from "@line_bot_v1/integration-openai/structured-output";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { createCommercialExtractor } from "../../adapters/outbound/commercial-extractor.js";
import { createPostgresCommercialIntakeStore } from "../../adapters/outbound/persistence/commercial-intake.js";
import { createSupabaseExtractionJsonStore } from "../../adapters/outbound/persistence/extraction-json-storage.js";
import { createCommercialIntake } from "../../application/use-cases/commercial-intake.js";
import {
  type CommercialIntake,
  CommercialIntakeError,
  type CommercialIntakeTarget,
} from "../../contracts/output/commercial-intake.js";
import type { ExtractionProfile } from "../../contracts/ports/commercial-intake.js";
/** Fixed server profile; optional extraction port supports alternate runtime provider wiring. */
export function createPostgresCommercialIntake(config: {
  db?: Database;
  reader?: FileSourceReader;
  target: CommercialIntakeTarget;
  extractor?: {
    countInputTokens(input: {
      bytes: Uint8Array;
      mediaType: string;
      profile: ExtractionProfile;
    }): Promise<number>;
    extract(input: {
      bytes: Uint8Array;
      mediaType: string;
      profile: ExtractionProfile;
      timeoutMs: number;
    }): Promise<unknown>;
  };
}): CommercialIntake {
  const db = config.db ?? businessDatabase();
  const extractor = config.extractor ?? createCommercialExtractor();
  const extractionJsonStore =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createSupabaseExtractionJsonStore({
          url: process.env.SUPABASE_URL,
          serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        })
      : undefined;
  return createCommercialIntake({
    persistExtractionResult: extractionJsonStore,
    async assertProviderReady() {
      if (!config.extractor && !process.env.OPENAI_API_KEY)
        throw new CommercialIntakeError("EXTRACTION_NOT_CONFIGURED", 503, "extraction.preflight");
    },
    store: createPostgresCommercialIntakeStore(db, createPostgresFileRevisionQualifier),
    target: config.target,
    reader: config.reader ?? createPostgresFileSourceReader(db),
    inspect: inspectOpenAIDocument,
    extract: (input) => extractor.extract(input),
    countInputTokens: (input) => extractor.countInputTokens(input),
  });
}
