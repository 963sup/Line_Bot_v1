import assert from "node:assert/strict";
import { test } from "node:test";
import { WbsError } from "@line_bot_v1/wbs/domain/document";
import {
  type ProjectWbsMetricsHttpDependencies,
  projectWbsMetricsRequest,
} from "../src/modules/project/project-wbs-metrics-http.server";
import { RequestIdentityError } from "../src/shared/server/request-identity-error";

const metrics = {
  initialized: true,
  pendingProposals: 2,
  baseline: { id: "baseline", revisionId: "revision", number: 3, publishedAt: 10 },
  draftRevisionId: "draft",
  differences: [],
} as const;

test("Project WBS metrics HTTP uses verified identity and preserves missing/source failures", async () => {
  const calls: unknown[] = [];
  let failure: "none" | "missing" | "source" = "none";
  const services: ProjectWbsMetricsHttpDependencies = {
    identity: async () => "verified-line-subject",
    read: async (subject, projectId) => {
      calls.push([subject, projectId]);
      if (failure === "missing") throw new WbsError(404, "missing");
      if (failure === "source") throw new Error("database unavailable");
      return { actorUserId: "canonical-user", projectId, metrics };
    },
  };
  const request = (projectId: string) =>
    projectWbsMetricsRequest(
      new Request(`https://example.test/api/project-wbs/metrics?projectId=${projectId}`),
      services,
    );

  const response = await request("project-1&userId=attacker");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), {
    actorUserId: "canonical-user",
    projectId: "project-1",
    metrics,
  });
  assert.deepEqual(calls, [["verified-line-subject", "project-1"]]);
  assert.equal((await request("")).status, 400);
  assert.equal((await request("%20")).status, 400);
  assert.equal(
    (
      await projectWbsMetricsRequest(new Request("https://example.test/api/project-wbs/metrics"), {
        ...services,
        identity: async () => {
          throw new RequestIdentityError(401, "login required");
        },
      })
    ).status,
    401,
  );
  failure = "missing";
  assert.equal((await request("project-1")).status, 404);
  failure = "source";
  assert.equal((await request("project-1")).status, 503);
});
