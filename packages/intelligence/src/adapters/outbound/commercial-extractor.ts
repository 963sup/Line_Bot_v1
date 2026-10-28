import {
  createOpenAIStructuredOutput,
  OpenAIOutputError,
} from "@line_bot_v1/integration-openai/structured-output";
import {
  commercialExtractionPrompt,
  commercialObservationSchema,
} from "../../application/commercial-profile.js";
import { CommercialIntakeError } from "../../contracts/output/commercial-intake.js";
import type { ExtractionProfile } from "../../contracts/ports/commercial-intake.js";

type ExtractionInput = {
  bytes: Uint8Array;
  mediaType: string;
  profile: ExtractionProfile;
  timeoutMs?: number;
};
function providerInput(input: ExtractionInput) {
  return {
    ...input.profile,
    schema: commercialObservationSchema,
    system: commercialExtractionPrompt,
    text: "Extract the complete source document, preserving every logical item, field and term.",
    bytes: input.bytes,
    mediaType: input.mediaType,
    timeoutMs: input.timeoutMs ?? input.profile.timeoutMs,
  };
}
export function createCommercialExtractor() {
  return {
    async countInputTokens(input: ExtractionInput): Promise<number> {
      const provider = createOpenAIStructuredOutput({ model: input.profile.model });
      return provider.countInputTokens({
        ...providerInput(input),
        timeoutMs: input.profile.inputTokenCountTimeoutMs,
      });
    },
    async extract(input: {
      bytes: Uint8Array;
      mediaType: string;
      profile: ExtractionProfile;
      timeoutMs: number;
    }): Promise<unknown> {
      const provider = createOpenAIStructuredOutput({ model: input.profile.model });
      try {
        return await provider.generate(providerInput(input));
      } catch (error) {
        if (error instanceof OpenAIOutputError && error.code !== "UNAVAILABLE") {
          const code =
            error.code === "REFUSAL"
              ? "EXTRACTION_REFUSED"
              : error.code === "INCOMPLETE"
                ? "EXTRACTION_INCOMPLETE"
                : "EXTRACTION_OUTPUT_INVALID";
          throw new CommercialIntakeError(code, 422, "extraction.provider", { cause: error });
        }
        throw new CommercialIntakeError("EXTRACTION_OUTCOME_UNKNOWN", 503, "extraction.provider", {
          cause: error,
        });
      }
    },
  };
}
