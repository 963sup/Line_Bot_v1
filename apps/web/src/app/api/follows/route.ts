import { UserError } from "@line-work/account/domain/user";
import { apiError, readJsonBody } from "../../../modules/account/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { follows } from "../_composition/account.server";
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
    if (
      keys.some((key) => key !== "action" && key !== "targetUserId") ||
      typeof body.targetUserId !== "string"
    ) {
      throw new UserError(400, "追蹤操作格式不正確。");
    }
    const subject = await requestLineIdentity(request);
    if (body.action === "follow") {
      await follows.follow(subject, body.targetUserId);
    } else if (body.action === "unfollow") {
      await follows.unfollow(subject, body.targetUserId);
    } else {
      throw new UserError(400, "不支援的追蹤操作。");
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
