export type LineWebhookEvent = Record<string, unknown>;

const object = (value: unknown): value is LineWebhookEvent =>
  !!value && typeof value === "object" && !Array.isArray(value);

type LineWebhookEnvelope = Readonly<{
  destination: string;
  events: LineWebhookEvent[];
}>;

/** Call only after verifying the original bytes with the channel secret. */
export function parseLineWebhook(raw: Uint8Array): LineWebhookEnvelope | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(raw).toString("utf8"));
    if (
      !object(payload) ||
      typeof payload.destination !== "string" ||
      !/^U[a-f0-9]{32}$/i.test(payload.destination) ||
      !Array.isArray(payload.events) ||
      !payload.events.every(object)
    )
      return null;
    return { destination: payload.destination, events: payload.events };
  } catch {
    return null;
  }
}

/** Decode native mention ranges without deciding which messages the product handles. */
export function parseLineMessage(event: LineWebhookEvent) {
  const message = event.type === "message" && object(event.message) ? event.message : undefined;
  const text =
    message?.type === "text" && typeof message.text === "string" ? message.text : undefined;
  const imageId =
    message?.type === "image" && typeof message.id === "string" ? message.id : undefined;
  const mentions =
    object(message?.mention) && Array.isArray(message.mention.mentionees)
      ? message.mention.mentionees.filter(object)
      : [];
  const self = mentions.filter(
    (m) =>
      m.type === "user" &&
      m.isSelf === true &&
      Number.isInteger(m.index) &&
      Number.isInteger(m.length) &&
      Number(m.index) >= 0 &&
      Number(m.length) > 0 &&
      Number(m.index) + Number(m.length) <= (text?.length ?? 0),
  );
  let mentionedText = text;
  for (const m of self.sort((a, b) => Number(b.index) - Number(a.index))) {
    mentionedText =
      mentionedText!.slice(0, Number(m.index)) +
      mentionedText!.slice(Number(m.index) + Number(m.length));
  }
  return { text, imageId, mentionedText, mentioned: self.length > 0 };
}

/** Platform source identity is not a product membership or WorkGroup role. */
export function parseLineSource(source: unknown) {
  if (
    !object(source) ||
    typeof source.userId !== "string" ||
    !/^U[a-f0-9]{32}$/i.test(source.userId) ||
    !["user", "group", "room"].includes(String(source.type))
  )
    return null;
  const type = source.type as "user" | "group" | "room";
  const scopeId =
    type === "user" ? source.userId : type === "group" ? source.groupId : source.roomId;
  if (typeof scopeId !== "string" || !scopeId) return null;
  return { type, userId: source.userId, scopeId };
}
