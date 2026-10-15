export type IssueDraft = {
  title: string;
  dueDate: string;
  timeHint: string;
  checklist: string[];
  questions: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateIssueDraft(value: unknown): IssueDraft {
  if (!isRecord(value)) throw new Error("Invalid draft");
  const v = value;
  const fields = ["title", "dueDate", "timeHint", "checklist", "questions"];
  if (Object.keys(v).some((key) => !fields.includes(key)))
    throw new Error("Unexpected draft fields");
  const str = (s: unknown, limit: number): s is string =>
    typeof s === "string" && s.length <= limit && !/[\u0000-\u001f]/.test(s);
  const list = (s: unknown, min: number): s is string[] =>
    Array.isArray(s) && s.length >= min && s.length <= 5 && s.every((t) => str(t, 120) && t.trim());
  if (
    !str(v.title, 80) ||
    !v.title.trim() ||
    !str(v.timeHint, 80) ||
    !str(v.dueDate, 10) ||
    !list(v.checklist, 1) ||
    !list(v.questions, 0)
  ) {
    throw new Error("Invalid draft fields");
  }
  if (
    v.dueDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(v.dueDate) ||
      Number.isNaN(Date.parse(v.dueDate)) ||
      new Date(v.dueDate).toISOString().slice(0, 10) !== v.dueDate)
  ) {
    throw new Error("Invalid draft date");
  }
  return {
    title: v.title,
    dueDate: v.dueDate,
    timeHint: v.timeHint,
    checklist: v.checklist,
    questions: v.questions,
  };
}
