import type { AssistantRuntime } from "./runtime.js";
export const assistantSurfaceModes = ["ask", "generate", "review"] as const;
export type AssistantSurfaceMode = (typeof assistantSurfaceModes)[number];
export function isAssistantSurfaceMode(value: unknown): value is AssistantSurfaceMode {
  return value === "ask" || value === "generate" || value === "review";
}

function assistantReviewPrompt(input: string) {
  return `請審閱以下工作內容，只指出主要風險、缺漏與可改進處；不要聲稱已執行或核准任何動作。\n\n${input.trim()}`;
}

export async function runAssistantSurface(
  mode: AssistantSurfaceMode,
  input: string,
  runtime: AssistantRuntime,
) {
  const value = input.trim();
  switch (mode) {
    case "ask":
      return runtime.answer(value);
    case "generate":
      return runtime.agentText(value);
    case "review":
      return runtime.answer(assistantReviewPrompt(value));
  }
}
