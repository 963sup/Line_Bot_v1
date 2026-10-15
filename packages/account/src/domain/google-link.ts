import { UserError } from "./user.js";

export type GoogleLinkOwner = {
  id: string;
  status: string;
  statusVersion: number;
  authUserId: string | null;
};
export type GoogleLinkStage = { id: string; googleId: string | null; googleSubject: string | null };
export type GoogleLinkConfirmation = {
  googleId: string | null;
  googleSubject: string | null;
  googleEmail: string | null;
};

export const expiredGoogleLink = () => new UserError(410, "綁定請求已失效，請從帳號設定重新開始。");

export function requireGoogleLinkOwner(owner: GoogleLinkOwner | null) {
  if (!owner || owner.status !== "active") throw new UserError(403, "請使用已啟用的原 LINE 會員。");
  return owner;
}

export function newGoogleLinkRequest(owner: GoogleLinkOwner, now: number) {
  if (owner.authUserId) throw new UserError(409, "此使用者已綁定 Google。");
  return { userId: owner.id, userVersion: owner.statusVersion, expiresAt: now + 10 * 60_000 };
}

export function stageGoogleLink(request: GoogleLinkStage | null, authId: string, subject: string) {
  if (!request) throw expiredGoogleLink();
  if (request.googleId) {
    if (request.googleId === authId && request.googleSubject === subject) return null;
    throw new UserError(409, "此請求已有 Google 帳號，請從帳號設定重新開始。");
  }
  return request.id;
}

export function confirmGoogleLink(request: GoogleLinkConfirmation | null) {
  if (!request) throw expiredGoogleLink();
  if (!request.googleId || !request.googleSubject || !request.googleEmail)
    throw new UserError(409, "請先完成 Google 登入。");
  return { id: request.googleId, subject: request.googleSubject, email: request.googleEmail };
}

export function unlinkGoogleLink(linked: boolean) {
  if (!linked) throw new UserError(409, "目前沒有可解除的 Google 綁定。");
  return { event: "google_unlinked" };
}
