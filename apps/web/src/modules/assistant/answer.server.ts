import { createAnswerAssistantQuestion } from "@line_bot_v1/assistant/application/answer-question";
import { presentAnswer } from "./answer-presenter.server";

export type AssistantRuntimeDependencies = {
  isConfigured(): boolean;
  generate(input: string): Promise<string | undefined>;
  runAgent(input: string): Promise<{ text: string; toolCalls: readonly string[] }>;
  probe(): Promise<string>;
};

export type AssistantRuntime = Readonly<{
  answer(input: string): Promise<string>;
  agentText(input: string): Promise<string>;
  aiTestText(): Promise<string>;
}>;

export function createAssistantRuntime(deps: AssistantRuntimeDependencies): AssistantRuntime {
  let nextAiTestAt = 0;

  const agentText = async (input: string): Promise<string> => {
    if (!input)
      return "用法：/agent 明天下午檢查消防設備\n只將指令後的內容交給 Gemini 整理，請使用非敏感測試資料。";
    if (input.length > 500) return "請將需求縮短至 500 字以內。";
    if (!deps.isConfigured()) return "Gemini 尚未設定；/ping 仍可使用。";
    if (Date.now() < nextAiTestAt) return "AI 冷卻中，請稍候 30 秒再試。";
    nextAiTestAt = Date.now() + 30_000;

    try {
      const result = await deps.runAgent(input);
      console.info(
        JSON.stringify({
          service: "intake-agent",
          outcome: "success",
          toolCalls: result.toolCalls,
        }),
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
  };

  const answerQuestion = createAnswerAssistantQuestion({
    now: () => Date.now(),
    acquireCooldown: () => {
      if (Date.now() < nextAiTestAt) return false;
      nextAiTestAt = Date.now() + 30_000;
      return true;
    },
    draftIssue: (input) => agentText(input),
    generate: deps.generate,
  });

  const answer = async (input: string): Promise<string> => {
    return presentAnswer(await answerQuestion(input));
  };

  const aiTestText = async (): Promise<string> => {
    if (!deps.isConfigured()) return "Gemini 尚未設定；/ping 仍可使用。";
    if (Date.now() < nextAiTestAt) return "AI 測試冷卻中，請稍候 15 秒再試。";
    nextAiTestAt = Date.now() + 15_000;

    try {
      const text = await deps.probe();
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
  };

  return { answer, agentText, aiTestText };
}
