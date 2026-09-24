import type { UserUseCases } from "@line-work/account/application/user";
import { UserError } from "@line-work/account/domain/user";
import type { DailyCheckIn } from "@line-work/daily-check-in/application";
import { jsonResponse } from "../../shared/server/http";
import { apiError, readJsonBody } from "./http.server";

type AccountView = NonNullable<Awaited<ReturnType<UserUseCases["getUser"]>>>;
type UserRequests = {
  activeLineUser: UserUseCases["activeLineUser"];
  checkIn: DailyCheckIn["checkIn"];
  pauseUser: UserUseCases["pauseUser"];
  updateLogin: UserUseCases["updateLogin"];
  getUser(subject: string): Promise<(AccountView & { coins: unknown }) | null>;
  requestIdentity: (request: Request) => Promise<string>;
};

export function createUserRequest(dependencies: UserRequests) {
  return {
    GET: (request: Request) => get(request, dependencies),
    POST: (request: Request) => post(request, dependencies),
  };
}

async function get(request: Request, dependencies: UserRequests) {
  try {
    const subject = await dependencies.requestIdentity(request);
    const account = await dependencies.getUser(subject);
    // Published membership routes retain the historical wire field.
    return jsonResponse({
      member: account,
    });
  } catch (e) {
    return apiError(e);
  }
}
async function post(request: Request, dependencies: UserRequests) {
  try {
    const body = await readJsonBody(request);
    const subject = await dependencies.requestIdentity(request);

    if (body.action === "deactivate") {
      return jsonResponse({ member: await dependencies.pauseUser(subject) });
    }
    if (body.action === "checkIn") {
      return jsonResponse(await dependencies.checkIn(subject));
    }
    if (body.action === "updateLogin") {
      return jsonResponse({ member: await dependencies.updateLogin(subject, body.login) });
    }
    await dependencies.activeLineUser(subject);
    throw new UserError(400, "不支援的會員操作。");
  } catch (e) {
    return apiError(e);
  }
}
