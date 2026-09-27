import type { UserUseCases } from "@line-work/account/application/user";
import { UserError } from "@line-work/account/domain/user";
import type { DailyCheckIn } from "@line-work/daily-check-in/application";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { jsonResponse } from "../../shared/server/http";
import { apiError, readJsonBody } from "./http.server";

type AccountView = NonNullable<Awaited<ReturnType<UserUseCases["getUser"]>>>;
type DailyCheckInView = Awaited<ReturnType<DailyCheckIn["currentView"]>>;
type CoinView = DailyCheckInView & { balance: number };
type CoinProjection = CoinView | { unavailable: true };
type AccountWithCoins = AccountView & { coins: CoinProjection };

type UserRequests = {
  activeLineUser: UserUseCases["activeLineUser"];
  checkIn: DailyCheckIn["checkIn"];
  readClaim: DailyCheckIn["readClaim"];
  pauseUser: UserUseCases["pauseUser"];
  updateLogin: UserUseCases["updateLogin"];
  getUser(subject: string): Promise<AccountView | null>;
  coinView(userId: string): Promise<CoinView>;
  requestIdentity: (request: Request) => Promise<string>;
};

const unavailableCoins = Object.freeze({ unavailable: true as const });

export function createUserRequest(dependencies: UserRequests) {
  return {
    GET: (request: Request) => get(request, dependencies),
    POST: (request: Request) => post(request, dependencies),
  };
}

async function projectAccount(
  account: AccountView | null,
  dependencies: UserRequests,
): Promise<AccountWithCoins | null> {
  if (!account) return null;
  try {
    return { ...account, coins: await dependencies.coinView(account.id) };
  } catch (error) {
    captureHandledServerError(error, {
      service: "daily-check-in-projection",
      operation: "membership-view",
      status: 503,
    });
    return { ...account, coins: unavailableCoins };
  }
}

async function get(request: Request, dependencies: UserRequests) {
  try {
    const subject = await dependencies.requestIdentity(request);
    const query = new URL(request.url).searchParams;
    if (query.has("checkInDay")) {
      return jsonResponse({
        claim: await dependencies.readClaim(subject, query.get("checkInDay")),
      });
    }
    // Account availability is independent from the optional DailyCheckIn/Wallet presentation.
    const account = await dependencies.getUser(subject);
    return jsonResponse({
      member: await projectAccount(account, dependencies),
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
      // Read the Account projection before mutation so a successful DailyCheckIn commit is never
      // turned into an unknown result by a later Account read.
      const account = await dependencies.getUser(subject);
      const result = await dependencies.checkIn(subject, body.expectedDay);
      const member = await projectAccount(account, dependencies);
      return jsonResponse({
        member,
        checkIn: {
          ...result,
          coins: member?.coins ?? unavailableCoins,
        },
      });
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
