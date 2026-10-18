import type { ProjectWbsMetrics } from "@line_bot_v1/wbs/contracts/output/project-metrics";
import { WbsError } from "@line_bot_v1/wbs/domain/document";
import { jsonResponse } from "../../shared/server/http";
import { projectWbsFailure, projectWbsSelector } from "./project-wbs-transport.server";

export type ProjectWbsMetricsHttpDependencies = Readonly<{
  identity(request: Request): Promise<string>;
  read(
    subject: string,
    projectId: string,
  ): Promise<Readonly<{ actorUserId: string; projectId: string; metrics: ProjectWbsMetrics }>>;
}>;

export async function projectWbsMetricsRequest(
  request: Request,
  services: ProjectWbsMetricsHttpDependencies,
) {
  try {
    const subject = await services.identity(request);
    const projectId = projectWbsSelector(
      new URL(request.url).searchParams.get("projectId") ?? "",
    ).projectId;
    return jsonResponse(await services.read(subject, projectId));
  } catch (error) {
    if (error instanceof WbsError) return jsonResponse({ error: error.message }, error.status);
    return projectWbsFailure(error);
  }
}
