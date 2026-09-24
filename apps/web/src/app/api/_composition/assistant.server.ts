import type { AssistantSurfaceMode } from "../../../modules/assistant/web-surface";
import { runAssistantSurface } from "../../../modules/assistant/web-surface.server";
import { activeLineUser } from "./account.server";

export async function assistantSurface(subject: string, mode: AssistantSurfaceMode, input: string) {
  await activeLineUser(subject);
  return runAssistantSurface(mode, input);
}
