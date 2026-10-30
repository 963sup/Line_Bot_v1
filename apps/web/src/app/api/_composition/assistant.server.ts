import { runIntakeAgent } from "@line_bot_v1/assistant/agents/intake";
import {
  type AssistantRuntimeDependencies,
  createAssistantRuntime,
} from "@line_bot_v1/assistant/application/runtime";
import type { AssistantSurfaceMode } from "@line_bot_v1/assistant/application/surface";
import { runAssistantSurface } from "@line_bot_v1/assistant/application/surface";
import { createVercelAiGateway } from "@line_bot_v1/integration-vercel/gateway";
import { gatewayConfiguration } from "@line_bot_v1/integration-vercel/gateway-config";
import { presentAnswer } from "../../../modules/assistant/answer-presenter.server";
import { activeLineUser } from "./account.server";

const assistantRuntime = createAssistantRuntime({
  presentAnswer,
  isConfigured: () => Boolean(gatewayConfiguration()),
  generate: async (input) => {
    const gateway = gatewayConfiguration();
    if (gateway) {
      return createVercelAiGateway(gateway).text({
        prompt: input,
        system:
          "你是繁體中文工作群組助手。只簡短回答使用者明確提問。不具備搜尋、查帳或執行動作能力，不聲稱已執行。含糊輸入問一句釐清問題。若要記帳請使用者 @助手 記帳後傳圖。",
      });
    }
    throw new Error("AI Gateway is not configured");
  },
  runAgent: async (input) => {
    const gateway = gatewayConfiguration();
    if (!gateway) throw new Error("AI Gateway is not configured");
    return runIntakeAgent({ model: createVercelAiGateway(gateway).intake(input), input });
  },
  probe: async () => {
    const gateway = gatewayConfiguration();
    if (!gateway) throw new Error("AI Gateway is not configured");
    return createVercelAiGateway(gateway).text({
      prompt: "請用繁體中文的一句短句確認你是Line_Bot_v1，最多二十個字。",
      system: "Return one short Traditional Chinese confirmation only.",
    });
  },
} satisfies AssistantRuntimeDependencies);

export const { answer, agentText, aiTestText } = assistantRuntime;

export async function assistantSurface(subject: string, mode: AssistantSurfaceMode, input: string) {
  await activeLineUser(subject);
  return runAssistantSurface(mode, input, assistantRuntime);
}
