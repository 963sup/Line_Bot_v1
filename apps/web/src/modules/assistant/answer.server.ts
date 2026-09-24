import { createGeminiClient, runGeminiProbe } from "@line-work/assistant/adapters/gemini";
import { runIntakeAgent } from "@line-work/assistant/agents/intake";
import { createAnswerAssistantQuestion } from "@line-work/assistant/application/answer-question";
import { presentAnswer } from "./answer-presenter.server";

// Shared process-local cooldown; this is not a distributed quota.
let nextAiTestAt = 0;

const answerQuestion = createAnswerAssistantQuestion({
  now: () => Date.now(),
  acquireCooldown: () => {
    if (Date.now() < nextAiTestAt) return false;
    nextAiTestAt = Date.now() + 30_000;
    return true;
  },
  draftIssue: (input) => agentText(input),
  generate: async (input) => {
    const result = await createGeminiClient({
      apiKey: process.env.GEMINI_API_KEY ?? "",
    }).models.generateContent({
      model: process.env.GEMINI_MODEL ?? "",
      contents: input,
      config: {
        systemInstruction:
          "你是繁體中文工作群組助手。只簡短回答使用者明確提問。不具備搜尋、查帳或執行動作能力，不聲稱已執行。含糊輸入問一句釐清問題。若要記帳請使用者 @助手 記帳後傳圖。",
        maxOutputTokens: 600,
        httpOptions: { timeout: 10000, retryOptions: { attempts: 1 } },
        abortSignal: AbortSignal.timeout(12000),
      },
    });
    return result.text;
  },
});

export async function answer(input: string): Promise<string> {
  return presentAnswer(await answerQuestion(input));
}
/**
 * 執行進件代理並回覆結構化Issue 草稿
 */
export async function agentText(input: string): Promise<string> {
  if (!input)
    return "用法：/agent 明天下午檢查消防設備\n只將指令後的內容交給 Gemini 整理，請使用非敏感測試資料。";
  if (input.length > 500) return "請將需求縮短至 500 字以內。";
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return "Gemini 尚未設定；/ping 仍可使用。";
  if (Date.now() < nextAiTestAt) return "AI 冷卻中，請稍候 30 秒再試。";
  nextAiTestAt = Date.now() + 30_000;

  try {
    const result = await runIntakeAgent({
      models: createGeminiClient({ apiKey }).models,
      model,
      input,
    });
    console.info(
      JSON.stringify({ service: "intake-agent", outcome: "success", toolCalls: result.toolCalls }),
    );
    return result.text;
  } catch (error) {
    const quota =
      typeof error === "object" && error !== null && "status" in error && error.status === 429;
    console.warn(
      JSON.stringify({ service: "intake-agent", outcome: quota ? "quota_exceeded" : "failed" }),
    );
    return quota
      ? "Agent 暫時達到免費額度或速率限制，請稍後再試。"
      : "Agent 暫時失敗或逾時，沒有建立任何Issue；請稍後再試。";
  }
}

/**
 * 執行 Gemini 免費層健康探針
 */
export async function aiTestText(): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return "Gemini 尚未設定；/ping 仍可使用。";
  if (Date.now() < nextAiTestAt) return "AI 測試冷卻中，請稍候 15 秒再試。";
  nextAiTestAt = Date.now() + 15_000;

  try {
    const text = await runGeminiProbe(createGeminiClient({ apiKey }), model);
    console.info(JSON.stringify({ service: "gemini-probe", outcome: "success" }));
    return `Gemini 已連線：${text}`;
  } catch (error) {
    const quota =
      typeof error === "object" && error !== null && "status" in error && error.status === 429;
    console.warn(
      JSON.stringify({ service: "gemini-probe", outcome: quota ? "quota_exceeded" : "failed" }),
    );
    if (quota) return "Gemini 免費額度暫時不足或已達速率限制，請稍後再試；/ping 仍可使用。";
    return "Gemini 測試暫時失敗或逾時；/ping 仍可使用。";
  }
}
