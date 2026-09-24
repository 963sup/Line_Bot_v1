import { agentText, answer } from "./answer.server";
import type { AssistantSurfaceMode } from "./web-surface";

export function assistantReviewPrompt(input: string) {
  return `請審閱以下工作內容，只指出主要風險、缺漏與可改進處；不要聲稱已執行或核准任何動作。\n\n${input.trim()}`;
}

export async function runAssistantSurface(mode: AssistantSurfaceMode, input: string) {
  const value = input.trim();
  switch (mode) {
    case "ask":
      return answer(value);
    case "generate":
      return agentText(value);
    case "review":
      return answer(assistantReviewPrompt(value));
  }
}
