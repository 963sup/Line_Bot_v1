import type { AnswerResult } from "@line-work/assistant/application/answer-question";

export function presentAnswer(result: AnswerResult): string {
  switch (result.type) {
    case "help":
      return "需要我幫忙什麼？可說「日誌」、「記帳」、「今天幾號」或「建立任務：檢查消防設備」。";
    case "tooLong":
      return "請將問題縮短至 500 字以內。";
    case "cooldown":
      return "AI 冷卻中，請 30 秒後再試。";
    case "empty":
      return "請再說明希望我協助的事情。";
    case "unavailable":
      return "AI 暫不可用或免費額度已達限制，請稍後再試。";
    case "time":
      return new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        dateStyle: "full",
        timeStyle: "short",
      }).format(new Date(result.at));
    case "text":
      return result.text;
  }
}
