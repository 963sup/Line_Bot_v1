import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { ContentPlanItemBasis } from "@line_bot_v1/content/domain/plan-reference";
import type { ResourceQuantityBasis } from "@line_bot_v1/resources/domain/engineering-reference";
import {
  type ContractRevision,
  freezeContractLines,
  type HistoricalResourceContractLine,
  reviseContract,
} from "../src/domain/contract.js";
import { ContractError } from "../src/domain/error.js";

function content(unit: "m" | "pcs" = "m"): ContentPlanItemBasis {
  return {
    repositoryId: "repo",
    planRevisionId: randomUUID(),
    planVersion: 2,
    node: {
      id: randomUUID(),
      kind: "TASK",
      title: "Install cable",
      body: "Task basis",
      path: [{ id: randomUUID(), kind: "WORK", title: "Cable work" }],
      plannedQuantity: {
        value: "10",
        measure: { id: randomUUID(), name: "Length", subject: "Installed length", unit },
      },
    },
  };
}

function resource(): ResourceQuantityBasis {
  return {
    resourceId: randomUUID(),
    resourceRevisionId: randomUUID(),
    resourceVersion: 2,
    name: "Legacy cable",
    measure: { id: randomUUID(), name: "Length", subject: "Installed length", unit: "m" },
    sourceQuantity: "10",
  };
}

function context(version: number) {
  return {
    id: randomUUID(),
    contractId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    actorUserId: "owner",
    at: version,
  };
}

function line(basis = content(), agreedQuantity = "1.200") {
  const lineId = randomUUID();
  return {
    input: {
      lineId,
      planRevisionId: basis.planRevisionId,
      nodeId: basis.node.id,
      agreedQuantity,
    },
    basis,
  };
}

function draft(): ContractRevision {
  const first = line();
  return reviseContract(
    null,
    0,
    {
      action: "create",
      title: "  Installation  ",
      body: "  preserve markdown\r\n",
      lines: freezeContractLines([first.input], [first.basis]),
    },
    context(1),
  );
}

test("Content-backed draft, activation and close append complete immutable snapshots", () => {
  const created = draft();
  assert.equal(created.title, "Installation");
  assert.equal(created.body, "  preserve markdown\r\n");
  assert.equal(created.lines[0]?.agreedQuantity, "1.2");
  const activated = reviseContract(
    created,
    1,
    { action: "activate", lines: created.lines.filter((line) => "content" in line) },
    context(2),
  );
  const closed = reviseContract(activated, 2, { action: "close" }, context(3));
  assert.deepEqual([created.state, activated.state, closed.state], ["DRAFT", "ACTIVE", "CLOSED"]);
  assert.equal(activated.parentRevisionId, created.id);
  assert.notStrictEqual(activated.lines, created.lines);
  const activatedLine = activated.lines[0];
  const createdLine = created.lines[0];
  assert.ok(activatedLine && "content" in activatedLine);
  assert.ok(createdLine && "content" in createdLine);
  assert.notStrictEqual(activatedLine.content, createdLine.content);
  assert.notStrictEqual(activatedLine.content.node.path, createdLine.content.node.path);
  assert.deepEqual(closed.lines, created.lines);
});

test("illegal transitions, stale versions and no-op draft edits retain distinct errors", () => {
  const created = draft();
  assert.throws(
    () => reviseContract(created, 0, { action: "close" }, context(2)),
    (error) => error instanceof ContractError && error.code === "VERSION_CONFLICT",
  );
  assert.throws(
    () => reviseContract(created, 1, { action: "close" }, context(2)),
    (error) => error instanceof ContractError && error.code === "LIFECYCLE_CONFLICT",
  );
  assert.throws(
    () =>
      reviseContract(
        created,
        1,
        {
          action: "edit",
          title: created.title,
          body: created.body,
          lines: created.lines.filter((line) => "content" in line),
        },
        context(2),
      ),
    (error) => error instanceof ContractError && error.code === "LIFECYCLE_CONFLICT",
  );
});

test("line policy is bounded, unique, source-aligned and strictly positive", () => {
  const pieces = line(content("pcs"), "1.0");
  assert.throws(() => freezeContractLines([pieces.input], [pieces.basis]), ContractError);
  const zero = line(content("m"), "0");
  assert.throws(() => freezeContractLines([zero.input], [zero.basis]), ContractError);
  const missingQuantity = line({
    ...content(),
    node: { ...content().node, plannedQuantity: null },
  });
  assert.throws(() => freezeContractLines([missingQuantity.input], [missingQuantity.basis]));
  const valid = line();
  assert.throws(
    () => freezeContractLines([valid.input, valid.input], [valid.basis, valid.basis]),
    ContractError,
  );
  assert.throws(() => freezeContractLines([valid.input], [content()]), ContractError);
  const hundred = Array.from({ length: 100 }, () => line());
  assert.equal(
    freezeContractLines(
      hundred.map((value) => value.input),
      hundred.map((value) => value.basis),
    ).length,
    100,
  );
  const extra = line();
  assert.throws(() =>
    freezeContractLines(
      [...hundred.map((value) => value.input), extra.input],
      [...hundred.map((value) => value.basis), extra.basis],
    ),
  );
});

test("aggregate validation cannot be bypassed with caller-constructed frozen lines", () => {
  const invalid = { lineId: randomUUID(), content: content(), agreedQuantity: "0" };
  assert.throws(
    () =>
      reviseContract(
        null,
        0,
        { action: "create", title: "Agreement", body: "", lines: [invalid] },
        context(1),
      ),
    (error) => error instanceof ContractError && error.code === "INVALID_INPUT",
  );
  assert.throws(() =>
    reviseContract(
      null,
      0,
      {
        action: "create",
        title: "Agreement",
        body: "",
        lines: [{ ...invalid, content: content("pcs"), agreedQuantity: "1.0" }],
      },
      context(1),
    ),
  );
  assert.throws(() =>
    reviseContract(
      null,
      0,
      {
        action: "create",
        title: "Agreement",
        body: "",
        lines: [
          { ...invalid, content: { ...content(), repositoryId: "other" }, agreedQuantity: "1" },
        ],
      },
      context(1),
    ),
  );
});

test("activation requalification cannot rewrite Content pins or agreed quantities", () => {
  const created = draft();
  const frozen = created.lines[0];
  assert.ok(frozen && "content" in frozen);
  for (const changed of [
    { ...frozen, agreedQuantity: "2" },
    { ...frozen, content: { ...frozen.content, planRevisionId: randomUUID() } },
    {
      ...frozen,
      content: { ...frozen.content, node: { ...frozen.content.node, id: randomUUID() } },
    },
  ])
    assert.throws(
      () => reviseContract(created, 1, { action: "activate", lines: [changed] }, context(2)),
      (error) => error instanceof ContractError && error.code === "LIFECYCLE_CONFLICT",
    );
});

test("historical Resource revisions remain readable and closable but drafts require Content edit", () => {
  const legacyLine: HistoricalResourceContractLine = {
    lineId: randomUUID(),
    resource: resource(),
    agreedQuantity: "1",
  };
  const legacyDraft: ContractRevision = {
    ...context(1),
    version: 1,
    parentRevisionId: null,
    action: "create",
    state: "DRAFT",
    title: "Legacy",
    body: "",
    lines: [legacyLine],
  };
  assert.throws(
    () => reviseContract(legacyDraft, 1, { action: "activate", lines: [] }, context(2)),
    (error) => error instanceof ContractError && error.code === "LIFECYCLE_CONFLICT",
  );
  const replacement = line();
  const edited = reviseContract(
    legacyDraft,
    1,
    {
      action: "edit",
      title: "Migrated",
      body: "",
      lines: freezeContractLines([replacement.input], [replacement.basis]),
    },
    context(2),
  );
  assert.ok(edited.lines.every((value) => "content" in value));
  const legacyActive = { ...legacyDraft, state: "ACTIVE" as const };
  const closed = reviseContract(legacyActive, 1, { action: "close" }, context(2));
  assert.ok("resource" in (closed.lines[0] ?? {}));
});
