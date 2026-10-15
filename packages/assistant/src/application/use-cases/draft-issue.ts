import { type IssueDraft, validateIssueDraft } from "../../contracts/dto/issue-draft.js";
import type { IntakeModel, IntakeTime } from "../../contracts/output/intake-model.js";

/** Anchor relative dates before drafting; untrusted model output never commits an Issue. */
export async function draftAssistantIssue(deps: {
  input: string;
  model: IntakeModel;
  now(): Date;
}): Promise<IssueDraft> {
  if (!deps.input.trim() || deps.input.length > 500) throw new Error("Invalid agent input");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    await deps.model.requestTime(controller.signal);
    const now = deps.now();
    const time: IntakeTime = {
      timezone: "Asia/Taipei",
      local: new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Taipei",
        dateStyle: "short",
        timeStyle: "medium",
      }).format(now),
      weekday: new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        weekday: "long",
      }).format(now),
    };
    if (controller.signal.aborted) throw new Error("Agent timed out");
    return validateIssueDraft(await deps.model.draftIssue(time, controller.signal));
  };
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Agent timed out"));
        }, 12_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
