import { renderIssueDraft } from "../../adapters/inbound/intake-text.js";
import { draftAssistantIssue } from "../../application/use-cases/draft-issue.js";
import type { IssueDraft } from "../../contracts/dto/issue-draft.js";
import type { IntakeModel } from "../../contracts/output/intake-model.js";

export { type IssueDraft, validateIssueDraft } from "../../contracts/dto/issue-draft.js";

/** Published intake entry: wires the provider, clock, use case and text delivery. */
export async function runIntakeAgent(config: {
  model: IntakeModel & { toolCalls?: readonly string[] };
  input: string;
  now?: () => Date;
}): Promise<{ text: string; draft: IssueDraft; toolCalls: string[] }> {
  const draft = await draftAssistantIssue({
    input: config.input,
    model: config.model,
    now: config.now ?? (() => new Date()),
  });
  return { draft, text: renderIssueDraft(draft), toolCalls: [...(config.model.toolCalls ?? [])] };
}
