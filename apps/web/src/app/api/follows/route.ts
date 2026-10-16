import { UserError } from "@line_bot_v1/account/domain/user";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { apiError, readJsonBody } from "../../../modules/account/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { follows, publicUserById } from "../_composition/account.server";
import { resolveAccountNamespace } from "../_composition/namespace.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const subject = await requestLineIdentity(request);
    const [followers, following] = await Promise.all([
      follows.followers(subject),
      follows.following(subject),
    ]);
    return jsonResponse({ followers, following });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const keys = Object.keys(body);
    const rawTargetUserId = body.targetUserId;
    const rawTargetLogin = body.targetLogin;
    const hasTargetUserId = Object.hasOwn(body, "targetUserId");
    const hasTargetLogin = Object.hasOwn(body, "targetLogin");
    if (
      keys.some((key) => key !== "action" && key !== "targetUserId" && key !== "targetLogin") ||
      hasTargetUserId === hasTargetLogin ||
      (hasTargetUserId && typeof rawTargetUserId !== "string") ||
      (hasTargetLogin && typeof rawTargetLogin !== "string")
    ) {
      throw new UserError(400, "追蹤操作格式不正確。");
    }
    const subject = await requestLineIdentity(request);
    let targetUserId: string;
    if (typeof rawTargetLogin === "string") {
      let targetLogin: string;
      try {
        targetLogin = normalizeAccountLogin(rawTargetLogin);
      } catch {
        throw new UserError(400, "登入名稱格式不正確或已保留。");
      }
      const target = await resolveAccountNamespace(targetLogin);
      if (!target || target.kind !== "USER" || !(await publicUserById(target.id))) {
        throw new UserError(404, "找不到可追蹤的使用者。");
      }
      targetUserId = target.id;
    } else if (typeof rawTargetUserId === "string") {
      targetUserId = rawTargetUserId;
    } else {
      throw new UserError(400, "追蹤操作格式不正確。");
    }
    if (body.action === "follow") {
      await follows.follow(subject, targetUserId);
    } else if (body.action === "unfollow") {
      await follows.unfollow(subject, targetUserId);
    } else {
      throw new UserError(400, "不支援的追蹤操作。");
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
