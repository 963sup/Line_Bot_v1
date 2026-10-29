import { createPostgresContentWbsExpansionReader } from "@line_bot_v1/content/composition/bootstrap/wbs-expansion";
import { createProjectWbs } from "@line_bot_v1/wbs/application/use-cases/project-content";
import { createProjectWbsGovernance } from "@line_bot_v1/wbs/application/use-cases/project-governance";
import { createPostgresProjectWbsStore } from "@line_bot_v1/wbs/composition/bootstrap/project-content";
import { createPostgresProjectWbsGovernanceStore } from "@line_bot_v1/wbs/composition/bootstrap/project-governance";
import { activeLineUser } from "./account.server";

let store: ReturnType<typeof createPostgresProjectWbsStore> | undefined;
export const projectWbs = createProjectWbs({
  activeUser: activeLineUser,
  store: () =>
    (store ??= createPostgresProjectWbsStore({
      contentReader: createPostgresContentWbsExpansionReader,
    })),
  now: Date.now,
});

let governanceStore: ReturnType<typeof createPostgresProjectWbsGovernanceStore> | undefined;
export const projectWbsGovernance = createProjectWbsGovernance({
  activeUser: activeLineUser,
  store: () => (governanceStore ??= createPostgresProjectWbsGovernanceStore()),
  now: Date.now,
});
