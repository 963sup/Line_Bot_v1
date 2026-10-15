import { renderIssueDraft } from "../../adapters/inbound/intake-text.js";
import {
  createGeminiIntakeModel,
  type IntakeModels,
} from "../../adapters/outbound/external-api/gemini-intake.js";
import { draftAssistantIssue } from "../../application/use-cases/draft-issue.js";
import type { IssueDraft } from "../../contracts/dto/issue-draft.js";

export { type IssueDraft, validateIssueDraft } from "../../contracts/dto/issue-draft.js";

/** Published intake entry: wires the provider, clock, use case and text delivery. */
export async function runIntakeAgent(config: {
  models: IntakeModels;
  model: string;
  input: string;
  now?: () => Date;
}): Promise<{ text: string; draft: IssueDraft; toolCalls: string[] }> {
  const model = createGeminiIntakeModel(config);
  const draft = await draftAssistantIssue({
    input: config.input,
    model,
    now: config.now ?? (() => new Date()),
  });
  return { draft, text: renderIssueDraft(draft), toolCalls: [...model.toolCalls] };
}
