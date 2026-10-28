import {
  createPostgresFileRevisionQualifier,
  createPostgresFileSourceReader,
} from "@line_bot_v1/file/composition/bootstrap/files";
import type { FileSourceReader } from "@line_bot_v1/file/contracts/output/references";
import { inspectOpenAIDocument } from "@line_bot_v1/integration-openai/structured-output";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { createCommercialExtractor } from "../../adapters/outbound/commercial-extractor.js";
import { createPostgresCommercialIntakeStore } from "../../adapters/outbound/persistence/commercial-intake.js";
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
  persistExtractionResult?(input: {
    actorUserId: string;
    repositoryId: string;
    extractionResultId: string;
    result: import("../../contracts/output/commercial-intake.js").CommercialExtractionResult;
  }): Promise<void>;
}): CommercialIntake {
  const db = config.db ?? businessDatabase();
  const extractor = config.extractor ?? createCommercialExtractor();
  return createCommercialIntake({
    ...(config.persistExtractionResult
      ? { persistExtractionResult: config.persistExtractionResult }
      : {}),
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
