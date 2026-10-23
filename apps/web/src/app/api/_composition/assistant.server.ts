import { runIntakeAgent } from "@line_bot_v1/assistant/agents/intake";
import { createGatewayAssistant } from "@line_bot_v1/assistant/gateway";
import { createGeminiClient, runGeminiProbe } from "@line_bot_v1/assistant/gemini";
import {
  type AssistantRuntimeDependencies,
  createAssistantRuntime,
} from "../../../modules/assistant/answer.server";
import type { AssistantSurfaceMode } from "../../../modules/assistant/web-surface";
import { runAssistantSurface } from "../../../modules/assistant/web-surface.server";
import { activeLineUser } from "./account.server";

function geminiConfiguration() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  return apiKey && model ? { apiKey, model } : undefined;
}

function gatewayConfiguration() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  const model = process.env.AI_GATEWAY_MODEL;
  return apiKey && model ? { apiKey, model } : undefined;
}

function geminiRuntime() {
  const configuration = geminiConfiguration();
  if (!configuration) throw new Error("Gemini is not configured");
  return {
    ...configuration,
    client: createGeminiClient({ apiKey: configuration.apiKey }),
  };
}

const assistantRuntime = createAssistantRuntime({
  isConfigured: () => Boolean(geminiConfiguration()),
  generate: async (input) => {
    const gateway = gatewayConfiguration();
    if (gateway) {
      return createGatewayAssistant(gateway).generate({
        prompt: input,
        system:
          "你是繁體中文工作群組助手。只簡短回答使用者明確提問。不具備搜尋、查帳或執行動作能力，不聲稱已執行。含糊輸入問一句釐清問題。若要記帳請使用者 @助手 記帳後傳圖。",
      });
    }
    const { client, model } = geminiRuntime();
    const result = await client.models.generateContent({
      model,
      contents: input,
      config: {
        systemInstruction:
          "你是繁體中文工作群組助手。只簡短回答使用者明確提問。不具備搜尋、查帳或執行動作能力，不聲稱已執行。含糊輸入問一句釐清問題。若要記帳請使用者 @助手 記帳後傳圖。",
        maxOutputTokens: 600,
        httpOptions: { timeout: 10000, retryOptions: { attempts: 1 } },
        abortSignal: AbortS...[truncated]