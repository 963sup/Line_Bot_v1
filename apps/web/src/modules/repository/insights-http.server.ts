import type { RepositoryPulse } from "@line_bot_v1/insights/contracts/dto/repository-pulse";
import { RepositoryError } from "@line_bot_v1/repository/domain";
import { jsonResponse } from "../../shared/server/http";
import { repositoryFailure, repositoryPathSelector } from "./http.server";

export async function insightsRequest(
  request: Request,
  read: (
    subject: string,
    selector: { ownerLogin: string; repositoryName: string },
    period: { from?: number; to?: number },
  ) => Promise<RepositoryPulse>,
  identity: (request: Request) => Promise<string>,
) {
  try {
    const subject = await identity(request);
    const query = new URL(request.url).searchParams;
    const selector = repositoryPathSelector(query.get("owner") ?? "", query.get("name") ?? "");
    const period: { from?: number; to?: number } = {};
    for (const key of ["from", "to"] as const) {
      if (!query.has(key)) continue;
      const raw = query.get(key) ?? "";
      const value = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value))
        throw new RepositoryError(400, "期間必須使用非負整數時間戳記。");
      period[key] = value;
    }
    if ((period.to ?? Date.now()) <= (period.from ?? 0))
      throw new RepositoryError(400, "期間起點必須早於終點。");
    return jsonResponse(await read(subject, selector, period));
  } catch (error) {
    return repositoryFailure(error);
  }
}
