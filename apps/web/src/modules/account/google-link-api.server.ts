import { supabaseIdentity } from "@line-work/account/adapters/supabase-identity";
import type { createGoogleLink } from "@line-work/account/application/user";
import { UserError } from "@line-work/account/domain/user";
import { jsonResponse } from "../../shared/server/http";
import { apiError, readJsonBody } from "./http.server";

export function createGoogleLinkRequest(
  service: ReturnType<typeof createGoogleLink>,
  dependencies: {
    requestIdentity: (request: Request) => Promise<string>;
    limitRequest: (token: string) => Promise<void>;
  },
) {
  return {
    async GET(request: Request) {
      try {
        return jsonResponse({
          pending: await service.pending(await dependencies.requestIdentity(request)),
        });
      } catch (e) {
        return apiError(e);
      }
    },
    async POST(request: Request) {
      try {
        const body = await readJsonBody(request);
        if (body.action === "stage") {
          const token = request.headers.get("x-google-link") ?? "";
          if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UserError(410, "綁定連結已失效。");
          await dependencies.limitRequest(token);
          const authorization = request.headers.get("authorization") ?? "";
          if (!authorization.startsWith("Bearer ")) throw new UserError(401, "請先登入 Google。");
          await service.stage(token, await supabaseIdentity().verify(authorization.slice(7)));
        } else {
          const subject = await dependencies.requestIdentity(request);
          if (body.action === "start") return jsonResponse(await service.start(subject));
          if (body.action === "unlink") {
            await service.unlink(subject);
            return jsonResponse({ ok: true });
          }
          if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id)) {
            throw new UserError(400, "綁定請求不正確。");
          }
          if (body.action === "confirm") await service.confirm(subject, body.id);
          else if (body.action === "cancel") await service.cancel(subject, body.id);
          else throw new UserError(400, "不支援的操作。");
        }
        return jsonResponse({ ok: true });
      } catch (e) {
        return apiError(e);
      }
    },
  };
}
