import { PDFDocument } from "pdf-lib";

export class OpenAIOutputError extends Error {
  constructor(
    readonly code: "UNAVAILABLE" | "REFUSAL" | "INCOMPLETE" | "INVALID_OUTPUT",
    message = `OpenAI structured output: ${code}`,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
type StructuredDocumentInput = {
  schema: Readonly<Record<string, unknown>>;
  system: string;
  text: string;
  bytes: Uint8Array;
  mediaType: string;
  maxInputBytes: number;
  maxPdfPages: number;
  maxOutputTokens: number;
  timeoutMs: number;
};
/** Direct Responses API transport; input counting and generation share one complete input body. */
export function createOpenAIStructuredOutput(config: {
  model: string;
  apiKey?: () => string | undefined;
  fetch?: typeof fetch;
}) {
  async function request(input: StructuredDocumentInput, count: boolean): Promise<Response> {
    if (
      !Number.isSafeInteger(input.maxOutputTokens) ||
      input.maxOutputTokens < 1 ||
      input.maxOutputTokens > 24000 ||
      !Number.isSafeInteger(input.timeoutMs) ||
      input.timeoutMs < 1
    )
      throw new RangeError("Invalid OpenAI extraction budget.");
    const apiKey = (config.apiKey ?? (() => process.env.OPENAI_API_KEY))();
    if (!apiKey || !config.model.trim()) throw new OpenAIOutputError("UNAVAILABLE");
    await inspectOpenAIDocument(input);
    const data = `data:${input.mediaType};base64,${Buffer.from(input.bytes).toString("base64")}`;
    const attachment =
      input.mediaType === "application/pdf"
        ? { type: "input_file", filename: "document.pdf", file_data: data }
        : { type: "input_image", image_url: data, detail: "auto" };
    const body = {
      model: config.model,
      instructions: input.system,
      input: [{ role: "user", content: [{ type: "input_text", text: input.text }, attachment] }],
      text: {
        format: {
          type: "json_schema",
          name: "document_extraction",
          strict: true,
          schema: input.schema,
        },
      },
      ...(!count ? { store: false, max_output_tokens: input.maxOutputTokens } : {}),
    };
    let response: Response;
    try {
      response = await (config.fetch ?? fetch)(
        `https://api.openai.com/v1/responses${count ? "/input_tokens" : ""}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(process.env.OPENAI_ORG_ID
              ? { "OpenAI-Organization": process.env.OPENAI_ORG_ID }
              : {}),
            ...(process.env.OPENAI_PROJECT_ID
              ? { "OpenAI-Project": process.env.OPENAI_PROJECT_ID }
              : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(input.timeoutMs),
        },
      );
    } catch (error) {
      throw new OpenAIOutputError(
        "UNAVAILABLE",
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    }
    if (!response.ok) {
      const message = await response.text();
      throw new OpenAIOutputError(
        "UNAVAILABLE",
        message || `${response.status} ${response.statusText}`,
      );
    }
    return response;
  }
  return {
    async countInputTokens(input: StructuredDocumentInput): Promise<number> {
      const response = await request(input, true);
      let result: unknown;
      try {
        result = await response.json();
      } catch {
        throw new OpenAIOutputError("INVALID_OUTPUT");
      }
      if (
        !result ||
        typeof result !== "object" ||
        !("input_tokens" in result) ||
        typeof result.input_tokens !== "number" ||
        !Number.isSafeInteger(result.input_tokens) ||
        result.input_tokens < 0
      )
        throw new OpenAIOutputError("INVALID_OUTPUT");
      return result.input_tokens;
    },
    async generate(input: StructuredDocumentInput): Promise<unknown> {
      const response = await request(input, false);
      let result: {
        status?: string;
        output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
      };
      try {
        result = await response.json();
      } catch {
        throw new OpenAIOutputError("INVALID_OUTPUT");
      }
      if (!result || typeof result !== "object") throw new OpenAIOutputError("INVALID_OUTPUT");
      if (result.status !== "completed") throw new OpenAIOutputError("INCOMPLETE");
      if (!Array.isArray(result.output)) throw new OpenAIOutputError("INVALID_OUTPUT");
      const content = result.output
        .filter((item) => item?.type === "message")
        .flatMap((item) => (Array.isArray(item.content) ? item.content : []));
      if (content.some((item) => item?.type === "refusal")) throw new OpenAIOutputError("REFUSAL");
      const text = content
        .filter((item) => item?.type === "output_text")
        .map((item) => item.text)
        .join("");
      if (!text) throw new OpenAIOutputError("INVALID_OUTPUT");
      try {
        return JSON.parse(text);
      } catch {
        throw new OpenAIOutputError("INVALID_OUTPUT");
      }
    },
  };
}

/** Local, non-billable inspection shared with callers that must fence dispatch afterwards. */
export async function inspectOpenAIDocument(input: {
  bytes: Uint8Array;
  mediaType: string;
  maxInputBytes: number;
  maxPdfPages: number;
}): Promise<{ pageCount: number }> {
  if (
    !Number.isSafeInteger(input.maxInputBytes) ||
    input.maxInputBytes < 1 ||
    !Number.isSafeInteger(input.maxPdfPages) ||
    input.maxPdfPages < 1
  )
    throw new RangeError("Invalid document input budget.");
  if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(input.mediaType))
    throw new RangeError("Unsupported OpenAI document media type.");
  if (!input.bytes.byteLength || input.bytes.byteLength > input.maxInputBytes)
    throw new RangeError("OpenAI document exceeds the input byte budget.");
  let pageCount = 1;
  if (input.mediaType === "application/pdf") {
    try {
      pageCount = (await PDFDocument.load(input.bytes, { updateMetadata: false })).getPageCount();
    } catch {
      throw new RangeError("OpenAI PDF is malformed or encrypted.");
    }
  }
  if (pageCount < 1 || pageCount > input.maxPdfPages)
    throw new RangeError("OpenAI PDF exceeds the page budget.");
  return { pageCount };
}
