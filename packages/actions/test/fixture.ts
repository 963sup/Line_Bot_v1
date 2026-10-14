import { randomUUID } from "node:crypto";
import type { Database } from "@line_bot_v1/platform/postgres";
import { createWbs } from "@line_bot_v1/wbs/application/use-cases/content";
import { createWbsGovernance } from "@line_bot_v1/wbs/application/use-cases/governance";
import {
  createPostgresWbsGovernanceStore,
  createPostgresWbsStore,
} from "@line_bot_v1/wbs/composition/bootstrap/store";
export async function seedCapability(
  db: Database,
  query: (text: string, values?: unknown[]) => Promise<unknown>,
) {
  await db.transaction(async (sql) => {
    for (const id of ["owner", "viewer", "ignored", "outsider"]) {
      await sql.query(
        "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
        [id],
      );
      await sql.query("SELECT claim_account_login($1,'USER',$1,1)", [id]);
    }
  });
  await query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Actions','private')",
  );
  await query(
    "SELECT * FROM app_private.provision_repository('other','owner','owner','USER','Other','private')",
  );
  await query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo','viewer','read',1),('repo','ignored','read',1)",
  );
  await query(
    "INSERT INTO app_private.repository_subscriptions(repository_id,user_id,state,version,updated_at) VALUES('repo','ignored','IGNORED',1,1)",
  );
  await query(
    "INSERT INTO app_private.user_identities(provider,subject,user_id) VALUES('line:primary',$1,'viewer')",
    [`U${"1".repeat(32)}`],
  );
  const content = createWbs({
    activeUser: async () => ({ id: "owner" }),
    store: () => createPostgresWbsStore(db),
    now: () => 10,
  });
  const init = await content.execute("proof", {
    action: "initialize",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 0,
  });
  const draft = await content.execute("proof", {
    action: "create-node",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: init.revision.version,
    node: {
      id: "work",
      parentId: null,
      position: 0,
      kind: "WORK_PACKAGE",
      title: "Work",
      description: "",
      deliverable: "Result",
      acceptanceCriteria: "Checked",
    },
  });
  const governance = createWbsGovernance({
    activeUser: async () => ({ id: "owner" }),
    store: () => createPostgresWbsGovernanceStore(db),
    now: () => 20,
  });
  return {
    revisionId: draft.revision.id,
    async publish() {
      const p = await governance.execute("proof", {
        action: "create-proposal",
        repositoryId: "repo",
        requestId: randomUUID(),
        expectedVersion: 0,
        title: "Scope",
        reason: "",
        candidateRevisionId: draft.revision.id,
        baseBaselineId: null,
      });
      await governance.execute("proof", {
        action: "review-proposal",
        repositoryId: "repo",
        requestId: randomUUID(),
        expectedVersion: p.version,
        proposalId: p.proposalId,
        expectedProposalVersion: 1,
        expectedPolicyVersion: 1,
        decision: "APPROVE",
        note: "",
      });
      return governance.execute("proof", {
        action: "publish-proposal",
        repositoryId: "repo",
        requestId: randomUUID(),
        expectedVersion: 2,
        proposalId: p.proposalId,
        expectedProposalVersion: 1,
        expectedPolicyVersion: 1,
      });
    },
  };
}
