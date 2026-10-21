export type ContentText = Readonly<{
  title: string;
  body: string;
}>;

export type NormalizeContentResult =
  | Readonly<{ ok: true; value: ContentText }>
  | Readonly<{ ok: false; field: "title" | "body" }>;

export function normalizeContent(input: ContentText): NormalizeContentResult {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 200) return { ok: false, field: "title" };
  if (input.body.length > 262_144) return { ok: false, field: "body" };
  return { ok: true, value: { title, body: input.body } };
}
