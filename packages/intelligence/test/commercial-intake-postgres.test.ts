import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import {
  createPostgresFileDependencies,
  createPostgresFileRevisionQualifier,
} from "@line_bot_v1/file/composition/bootstrap/files";
import type { FileRevision } from "@line_bot_v1/file/domain/file";
import { createSql, type SqlRow } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createPostgresCommercialIntakeStore } from "../src/adapters/outbound/persistence/commercial-intake.js";
import { stableCommercialId } from "../src/application/commercial-observations.js";
import { commercialFingerprint, commercialProfile } from "../src/application/commercial-profile.js";
import { createCommercialIntake } from "../src/application/use-cases/commercial-intake.js";
import {
  type CommercialDraftReceipt,
  CommercialIntakeError,
} from "../src/contracts/output/commercial-intake.js";

const ctx = { actorUserId: "owner", traceId: randomUUID() };
const payload = {
  observations: [{ pageNumber: 1, rawLabel: "Title", rawValue: "Quote" }],
  semanticHints: [{ observationIndex: 0, target: "header.title", rowKey: null }],
};

test("durable commercial intake commits dispatch before one call, preserves READY after target rollback, resumes and protects immutable results", async (t) => {
  const sessionsUrl = process.env.CAPABILITY_TEST_DATABASE_URL;
  const fixture = sessionsUrl ? await postgresSessions(sessionsUrl) : await postgresFixture();
  const db = fixture.db;
  const pg = createSql(async (text, values) => {
    const result =
      "pool" in fixture
        ? await fixture.pool.query<SqlRow>(text, values)
        : await fixture.pg.query<SqlRow>(text, values);
    return { rows: result.rows };
  });
  t.after(() => ("close" in fixture ? fixture.close() : fixture.pg.close()));
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1),('other','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Commercial','private')",
  );
  const objects = new Map<string, Uint8Array>();
  const files = createFiles({
    ...createPostgresFileDependencies(db, {
      async putVerified(r: FileRevision, b: Uint8Array) {
        objects.set(r.id, Uint8Array.from(b));
      },
      async readVerified(r: FileRevision) {
        const bytes = objects.get(r.id);
        assert.ok(bytes);
        return bytes;
      },
    }),
    now: () => 1,
  });
  const bytes = new TextEncoder().encode("source-image");
  const upload = await files.upload(
    "owner",
    {
      repositoryId: "repo",
      fileId: randomUUID(),
      requestId: randomUUID(),
      expectedVersion: 0,
      name: "source.png",
      mediaType: "image/png",
    },
    bytes,
  );
  const source = {
    fileId: upload.file.fileId,
    fileRevisionId: upload.file.revisionId,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const command = {
    commandId: randomUUID(),
    repositoryId: "repo",
    source,
    target: { documentId: randomUUID(), draftCommandId: randomUUID(), expectedDocumentVersion: 0 },
  };
  const store = createPostgresCommercialIntakeStore(db, createPostgresFileRevisionQualifier);
  let calls = 0;
  let counterCalls = 0;
  let broken = true;
  let targetFailure: Error = Object.assign(new Error("rollback"), { code: "23502" });
  let receipt: CommercialDraftReceipt | null = null;
  const target = {
    async assertReady() {},
    async receipt() {
      return receipt;
    },
    async createDraftFromExtraction(
      _ctx: unknown,
      input: { commandId: string; documentId: string },
    ) {
      if (broken) throw targetFailure;
      return (receipt = {
        commandId: input.commandId,
        documentId: input.documentId,
        revisionId: randomUUID(),
        documentVersion: 1,
        operation: "CREATE_DRAFT",
      });
    },
  };
  const service = createCommercialIntake({
    async countInputTokens() {
      counterCalls++;
      return 100;
    },
    store,
    target,
    reader: {
      async read() {
        return {
          revision: {
            ...upload.file,
            id: source.fileRevisionId,
            sha256: source.sha256,
            mediaType: "image/png",
            byteLength: bytes.length,
            repositoryId: "repo",
            fileId: source.fileId,
            version: 1,
            parentRevisionId: null,
            actorUserId: "owner",
            at: 1,
          },
          bytes,
        };
      },
    },
    async inspect() {
      return { pageCount: 1 };
    },
    async extract(input) {
      assert.ok(input.timeoutMs > 0 && input.timeoutMs <= input.profile.timeoutMs);
      calls++;
      const row = await db.transaction((sql) =>
        sql.query(
          "SELECT state,dispatch_count,input_token_count,profile FROM document_extraction_jobs WHERE command_id=$1",
          [command.commandId],
        ),
      );
      assert.equal(row.rows[0]?.state, "DISPATCHED");
      assert.equal(row.rows[0]?.dispatch_count, 1);
      assert.equal(row.rows[0]?.input_token_count, 100);
      assert.deepEqual(row.rows[0]?.profile, commercialProfile);
      return payload;
    },
  });
  await assert.rejects(
    service.start(
      ctx,
      Object.assign({ ...command, commandId: randomUUID() }, { model: "browser-model" }),
    ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVALID_INPUT",
  );
  await assert.rejects(
    service.start(ctx, {
      ...command,
      commandId: randomUUID(),
      target: { ...command.target, expectedDocumentVersion: 2147483647 },
    }),
    { code: "INVALID_INPUT" },
  );
  assert.equal(counterCalls, 0);
  assert.equal(calls, 0);
  const first = await service.start(ctx, command);
  assert.equal(first.state, "RESULT_READY");
  assert.equal(first.failure?.code, "DOCUMENT_SAVE_FAILED");
  assert.equal(calls, 1);
  assert.equal(
    (await service.status(ctx, { repositoryId: "repo", commandId: command.commandId })).state,
    "RESULT_READY",
  );
  assert.equal(calls, 1);
  assert.ok(first.extractionResultId);
  const result = await service.readResult("owner", {
    repositoryId: "repo",
    extractionResultId: first.extractionResultId,
  });
  assert.equal(result.observations[0]?.rawValue, "Quote");
  await assert.rejects(
    service.readResult("other", {
      repositoryId: "repo",
      extractionResultId: first.extractionResultId,
    }),
  );
  await assert.rejects(
    db.transaction((sql) =>
      sql.query("UPDATE document_extraction_results SET result='{}' WHERE id=$1", [
        first.extractionResultId,
      ]),
    ),
    (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "42501",
  );
  targetFailure = new CommercialIntakeError("VERSION_CONFLICT", 409, "target.submit");
  assert.equal(
    (await service.resume(ctx, { repositoryId: "repo", commandId: command.commandId })).failure
      ?.code,
    "DOCUMENT_SAVE_FAILED",
  );
  targetFailure = new Error("network");
  assert.equal(
    (await service.resume(ctx, { repositoryId: "repo", commandId: command.commandId })).failure
      ?.code,
    "DOCUMENT_SAVE_OUTCOME_UNKNOWN",
  );
  assert.equal(calls, 1);
  broken = false;
  assert.equal(
    (await service.resume(ctx, { repositoryId: "repo", commandId: command.commandId })).state,
    "DRAFT_SAVED",
  );
  assert.equal(calls, 1);
  assert.equal((await service.start(ctx, command)).state, "DRAFT_SAVED");
  assert.equal(counterCalls, 1);
  const savedReceipt = (
    await service.status(ctx, { repositoryId: "repo", commandId: command.commandId })
  ).receipt;
  assert.ok(savedReceipt);
  await assert.rejects(
    service.start(ctx, { ...command, target: { ...command.target, documentId: randomUUID() } }),
  );
  // A new extraction with a lost transport outcome cannot be dispatched again by start or resume.
  const unknown = {
    ...command,
    commandId: randomUUID(),
    target: { ...command.target, draftCommandId: randomUUID() },
  };
  receipt = null;
  const failing = createCommercialIntake({
    async countInputTokens() {
      return 100;
    },
    store,
    target,
    reader: {
      async read() {
        return {
          revision: {
            ...upload.file,
            id: source.fileRevisionId,
            sha256: source.sha256,
            mediaType: "image/png",
            byteLength: bytes.length,
            repositoryId: "repo",
            fileId: source.fileId,
            version: 1,
            parentRevisionId: null,
            actorUserId: "owner",
            at: 1,
          },
          bytes,
        };
      },
    },
    async inspect() {
      return { pageCount: 1 };
    },
    async extract() {
      calls++;
      throw new Error("network");
    },
  });
  await assert.rejects(failing.start(ctx, unknown));
  assert.equal(calls, 2);
  assert.equal(
    (await failing.resume(ctx, { repositoryId: "repo", commandId: unknown.commandId })).state,
    "OUTCOME_UNKNOWN",
  );
  await failing.start(ctx, unknown);
  assert.equal(calls, 2);
  const reader = {
    async read() {
      return {
        revision: {
          id: source.fileRevisionId,
          fileId: source.fileId,
          repositoryId: "repo",
          version: 1,
          parentRevisionId: null,
          actorUserId: "owner",
          at: 1,
          name: "source.png",
          mediaType: "image/png",
          byteLength: bytes.length,
          sha256: source.sha256,
        },
        bytes,
      };
    },
  };
  const base = {
    async countInputTokens() {
      return 100;
    },
    store,
    target,
    reader,
    async inspect() {
      return { pageCount: 1 };
    },
    async extract() {
      calls++;
      return payload;
    },
  };
  for (const mode of ["over-budget", "counter-unavailable"]) {
    const admissionCommand = { ...command, commandId: randomUUID() };
    const admission = createCommercialIntake({
      ...base,
      async countInputTokens() {
        if (mode === "counter-unavailable") throw new Error("counter offline");
        return 64001;
      },
    });
    await assert.rejects(
      admission.start(ctx, admissionCommand),
      (error: unknown) =>
        error instanceof CommercialIntakeError &&
        error.code ===
          (mode === "over-budget"
            ? "SOURCE_TOKEN_BUDGET_EXCEEDED"
            : "SOURCE_TOKEN_COUNT_UNAVAILABLE"),
    );
    assert.equal(
      (
        await db.transaction((sql) =>
          sql.query("SELECT count(*)::int AS n FROM document_extraction_jobs WHERE command_id=$1", [
            admissionCommand.commandId,
          ]),
        )
      ).rows[0]?.n,
      0,
    );
    assert.equal(calls, 2);
  }
  const missingConfigCommand = { ...command, commandId: randomUUID() };
  const unavailable = createCommercialIntake({
    ...base,
    async assertProviderReady() {
      throw new CommercialIntakeError("EXTRACTION_NOT_CONFIGURED", 503, "extraction.preflight");
    },
  });
  await assert.rejects(
    unavailable.start(ctx, missingConfigCommand),
    (error: unknown) =>
      error instanceof CommercialIntakeError && error.code === "EXTRACTION_NOT_CONFIGURED",
  );
  assert.equal(
    (
      await db.transaction((sql) =>
        sql.query("SELECT count(*)::int AS n FROM document_extraction_jobs WHERE command_id=$1", [
          missingConfigCommand.commandId,
        ]),
      )
    ).rows[0]?.n,
    0,
  );
  assert.equal(calls, 2);
  const blockedCommand = { ...command, commandId: randomUUID() };
  const blocked = createCommercialIntake({
    ...base,
    target: {
      ...target,
      async assertReady() {
        throw new CommercialIntakeError("DOCUMENT_STORE_NOT_READY", 503, "target.preflight");
      },
    },
  });
  await assert.rejects(
    blocked.start(ctx, blockedCommand),
    (error: unknown) =>
      error instanceof CommercialIntakeError && error.code === "DOCUMENT_STORE_NOT_READY",
  );
  assert.equal(
    (
      await db.transaction((sql) =>
        sql.query("SELECT count(*)::int AS n FROM document_extraction_jobs WHERE command_id=$1", [
          blockedCommand.commandId,
        ]),
      )
    ).rows[0]?.n,
    0,
  );
  assert.equal(calls, 2);
  const enrichedBudgetCommand = { ...command, commandId: randomUUID() };
  const largePayload = {
    observations: Array.from({ length: 4000 }, () => ({
      pageNumber: 1,
      rawLabel: null,
      rawValue: "x".repeat(20),
    })),
    semanticHints: [],
  };
  assert.ok(new TextEncoder().encode(JSON.stringify(largePayload)).byteLength < 393216);
  let largeCalls = 0;
  const boundedResult = createCommercialIntake({
    ...base,
    async extract() {
      largeCalls++;
      return largePayload;
    },
  });
  await assert.rejects(
    boundedResult.start(ctx, enrichedBudgetCommand),
    (error: unknown) =>
      error instanceof CommercialIntakeError && error.code === "EXTRACTION_OUTPUT_INVALID",
  );
  assert.equal(
    (
      await boundedResult.status(ctx, {
        repositoryId: "repo",
        commandId: enrichedBudgetCommand.commandId,
      })
    ).state,
    "FAILED",
  );
  await boundedResult.resume(ctx, {
    repositoryId: "repo",
    commandId: enrichedBudgetCommand.commandId,
  });
  assert.equal(largeCalls, 1);
  assert.equal(
    (
      await db.transaction((sql) =>
        sql.query(
          "SELECT count(*)::int AS n FROM document_extraction_results r JOIN document_extraction_jobs j ON j.id=r.job_id WHERE j.command_id=$1",
          [enrichedBudgetCommand.commandId],
        ),
      )
    ).rows[0]?.n,
    0,
  );
  const invalidCommand = { ...command, commandId: randomUUID() };
  const invalid = createCommercialIntake({
    ...base,
    async extract() {
      calls++;
      return {
        ...payload,
        semanticHints: [{ observationIndex: 1, target: "item.quantity", rowKey: "r" }],
      };
    },
  });
  await assert.rejects(
    invalid.start(ctx, invalidCommand),
    (error: unknown) =>
      error instanceof CommercialIntakeError && error.code === "EXTRACTION_OUTPUT_INVALID",
  );
  assert.equal(
    (await invalid.status(ctx, { repositoryId: "repo", commandId: invalidCommand.commandId }))
      .state,
    "FAILED",
  );
  await invalid.resume(ctx, { repositoryId: "repo", commandId: invalidCommand.commandId });
  assert.equal(calls, 3);
  const refusedCommand = { ...command, commandId: randomUUID() };
  const refused = createCommercialIntake({
    ...base,
    async extract() {
      calls++;
      throw new CommercialIntakeError("EXTRACTION_REFUSED", 422, "extraction.provider");
    },
  });
  await assert.rejects(
    refused.start(ctx, refusedCommand),
    (error: unknown) =>
      error instanceof CommercialIntakeError && error.code === "EXTRACTION_REFUSED",
  );
  assert.equal(
    (await refused.status(ctx, { repositoryId: "repo", commandId: refusedCommand.commandId }))
      .state,
    "FAILED",
  );
  await refused.resume(ctx, { repositoryId: "repo", commandId: refusedCommand.commandId });
  assert.equal(calls, 4);
  // Independent callers race for the same paid operation: exactly one owns the fence.
  const concurrent = {
    ...command,
    commandId: randomUUID(),
    target: command.target,
  };
  const reservations = await Promise.all([
    store.reserve("owner", concurrent, commercialFingerprint(concurrent), commercialProfile, {
      pageCount: 1,
      byteLength: bytes.length,
      inputTokenCount: 100,
    }),
    store.reserve("owner", concurrent, commercialFingerprint(concurrent), commercialProfile, {
      pageCount: 1,
      byteLength: bytes.length,
      inputTokenCount: 100,
    }),
  ]);
  assert.equal(reservations.filter((x) => x.owned).length, 1);
  const winner = reservations.find((x) => x.owned);
  assert.ok(winner);
  assert.equal(await store.dispatch({ ...winner.job, token: randomUUID() }), false);
  assert.equal(await store.dispatch(winner.job), true);
  assert.equal(await store.dispatch(winner.job), false);
  await store.fail(winner.job, "EXTRACTION_OUTCOME_UNKNOWN", "extraction.provider", true);
  const lateId = stableCommercialId(winner.job.id, "result");
  const lateResult = {
    ...result,
    extractionResultId: lateId,
    observations: result.observations.map((o, i) => ({
      ...o,
      observationId: stableCommercialId(lateId, `observation:${i}`),
    })),
  };
  await store.complete(winner.job, lateResult);
  const guardedReceipt = createCommercialIntake({
    ...base,
    target: {
      ...target,
      async receipt(
        _actor: string,
        _query: unknown,
        expected?: { documentId: string; expectedVersion: number; extractionResultId: string },
      ) {
        if (!expected || expected.extractionResultId !== first.extractionResultId)
          throw new CommercialIntakeError("COMMAND_ID_CONFLICT", 409, "target.receipt");
        return savedReceipt;
      },
    },
  });
  assert.equal(
    (await guardedReceipt.status(ctx, { repositoryId: "repo", commandId: command.commandId }))
      .state,
    "DRAFT_SAVED",
  );
  await assert.rejects(
    guardedReceipt.status(ctx, { repositoryId: "repo", commandId: concurrent.commandId }),
    (error: unknown) =>
      error instanceof CommercialIntakeError && error.code === "COMMAND_ID_CONFLICT",
  );
  const wrongDocumentReceipt = createCommercialIntake({
    ...base,
    target: {
      ...target,
      async receipt() {
        return { ...savedReceipt, documentId: randomUUID() };
      },
    },
  });
  await assert.rejects(
    wrongDocumentReceipt.status(ctx, { repositoryId: "repo", commandId: command.commandId }),
    (error: unknown) =>
      error instanceof CommercialIntakeError && error.code === "COMMAND_ID_CONFLICT",
  );
  await store.complete(winner.job, lateResult);
  await assert.rejects(store.complete(winner.job, { ...lateResult, semanticHints: [] }));
  // Lease reclamation fences a process lost before dispatch, while retaining pinned intent/profile.
  const expired = { ...command, commandId: randomUUID() };
  const old = await store.reserve(
    "owner",
    expired,
    commercialFingerprint(expired),
    commercialProfile,
    { pageCount: 1, byteLength: bytes.length, inputTokenCount: 100 },
  );
  assert.equal(
    (await service.resume(ctx, { repositoryId: "repo", commandId: expired.commandId })).state,
    "WAITING",
  );
  assert.equal(counterCalls, 1);
  assert.equal(calls, 4);
  await pg.query("UPDATE app_private.document_extraction_jobs SET lease_until=0 WHERE id=$1", [
    old.job.id,
  ]);
  const reclaimed = await store.reserve(
    "owner",
    expired,
    commercialFingerprint(expired),
    commercialProfile,
    { pageCount: 1, byteLength: bytes.length, inputTokenCount: 100 },
  );
  assert.equal(reclaimed.owned, true);
  assert.notEqual(reclaimed.job.token, old.job.token);
  assert.equal(await store.dispatch(old.job), false);
  assert.equal(await store.dispatch(reclaimed.job), true);
  // Force the READY transition to fail: its preceding result insert must roll back too.
  await pg.query(
    `CREATE FUNCTION app_private.test_intake_ready_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='READY' THEN RAISE EXCEPTION 'forced READY failure'; END IF; RETURN NEW; END $$`,
  );
  await pg.query(
    `CREATE TRIGGER test_intake_ready_failure BEFORE UPDATE ON app_private.document_extraction_jobs FOR EACH ROW EXECUTE FUNCTION app_private.test_intake_ready_failure()`,
  );
  const atomicId = stableCommercialId(reclaimed.job.id, "result");
  const atomicResult = {
    ...lateResult,
    extractionResultId: atomicId,
    observations: lateResult.observations.map((o, i) => ({
      ...o,
      observationId: stableCommercialId(atomicId, `observation:${i}`),
    })),
  };
  await assert.rejects(store.complete(reclaimed.job, atomicResult));
  assert.equal(
    (
      await pg.query(
        "SELECT count(*)::int AS n FROM app_private.document_extraction_results WHERE id=$1",
        [atomicId],
      )
    ).rows[0]?.n,
    0,
  );
  assert.equal((await store.find("owner", "repo", expired.commandId))?.state, "DISPATCHED");
  await pg.query("DROP TRIGGER test_intake_ready_failure ON app_private.document_extraction_jobs");
  await pg.query("DROP FUNCTION app_private.test_intake_ready_failure()");
  await store.complete(reclaimed.job, atomicResult);
  // Revocation applies to status, result and resume even after result completion.
  await pg.query("UPDATE app_private.users SET status='suspended' WHERE id='owner'");
  await assert.rejects(service.status(ctx, { repositoryId: "repo", commandId: command.commandId }));
  await assert.rejects(
    service.readResult("owner", {
      repositoryId: "repo",
      extractionResultId: first.extractionResultId,
    }),
  );
});
