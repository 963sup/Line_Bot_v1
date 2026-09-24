export const assistantSurfaceModes = ["ask", "generate", "review"] as const;

export type AssistantSurfaceMode = (typeof assistantSurfaceModes)[number];

export const assistantSurfaceConfig = {
  ask: {
    label: "Ask",
    description: "一次一題取得工作協助；不保存跨頁對話 session。",
    maxLength: 500,
    submitLabel: "Ask AI",
  },
  generate: {
    label: "Generate",
    description: "把內容整理成 Issue draft；不會建立或發布 Issue。",
    maxLength: 500,
    submitLabel: "Generate draft",
  },
  review: {
    label: "Review",
    description: "提供文字風險與改進建議；不會核准或修改正式資料。",
    maxLength: 360,
    submitLabel: "Review",
  },
} as const satisfies Record<
  AssistantSurfaceMode,
  { label: string; description: string; maxLength: number; submitLabel: string }
>;

export function isAssistantSurfaceMode(value: unknown): value is AssistantSurfaceMode {
  return assistantSurfaceModes.includes(value as AssistantSurfaceMode);
}
