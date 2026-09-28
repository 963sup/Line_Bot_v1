import type { AnswerDependencies } from "./ports/answer.js";

export type AnswerResult =
  | { type: "help" | "tooLong" | "cooldown" | "empty" | "unavailable" }
  | { type: "time"; at: number }
  | { type: "text"; text: string };

/** Only explicitly addressed input from an authorized delivery adapter reaches this use case. */
export function createAnswerAssistantQuestion(deps: AnswerDependencies) {
  return async (input: string): Promise<AnswerResult> => {
    if (!input) return { type: "help" };
    if (/^(?:今天|現在).*(?:幾號|日期|星期|幾點|時間)[？?。!！]*$/.test(input)) {
      return { type: "time", at: deps.now() };
    }
    if (/^(?:建立\s*Issue|Issue|議題)[：:\s]/i.test(input)) {
      return {
        type: "text",
        text: await deps.draftIssue(input.replace(/^(?:建立\s*Issue|Issue|議題)[：:\s]+/i, "")),
      };
    }
    if (input.length > 500) return { type: "tooLong" };
    if (!deps.acquireCooldown()) return { type: "cooldown" };
    try {
      const text = (await deps.generate(input))?.trim().slice(0, 2000);
      return text ? { type: "text", text } : { type: "empty" };
    } catch {
      return { type: "unavailable" };
    }
  };
}
