import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { ResourceQuantityBasis } from "@line_bot_v1/resources/contracts/output/engineering-references";
import {
  type ContractRevision,
  freezeContractLines,
  reviseContract,
} from "../src/domain/contract.js";
import { ContractError } from "../src/domain/error.js";

const resource = (unit: "m" | "pcs" = "m"): ResourceQuantityBasis => ({
  resourceId: randomUUID(),
  resourceRevisionId: randomUUID(),
  resourceVersion: 2,
  name: "Cable",
  measure: { id: randomUUID(), name: "Length", subject: "Installed length", unit },
  sourceQuantity: "10",
});

function context(version: number) {
  return {
    id: randomUUID(),
    contractId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    actorUserId: "owner",
    at: version,
  };
}

function line(basis = resource(), agreedQuantity = "1.200") {
  const lineId = randomUUID();
  return {
    input: {
      lineId,
      resourceId: basis.resourceId,
      resourceRevisionId: basis.resourceRevisionId,
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

test("draft, activation and close append complete immutable snapshots", () => {
  const created = draft();
  assert.equal(created.title, "Installation");
  assert.equal(created.body, "  preserve markdown\r\n");
  assert.equal(created.lines[0]?.agreedQuantity, "1.2");
  const activated = reviseContract(
    created,
    1,
    { action: "activate", lines: created.lines },
    context(2),
  );
  const closed = reviseContract(activated, 2, { action: "close" }, context(3));
  assert.deepEqual([created.state, activated.state, closed.state], ["DRAFT", "ACTIVE", "CLOSED"]);
  assert.equal(activated.parentRevisionId, created.id);
  assert.equal(closed.parentRevisionId, activated.id);
  assert.notStrictEqual(activated.lines, created.lines);
  assert.notStrictEqual(activated.lines[0]?.resource, created.lines[0]?.resource);
  assert.notStrictEqual(activated.lines[0]?.resource.measure, created.lines[0]?.resource.measure);
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
        { action: "edit", title: created.title, body: created.body, lines: created.lines },
        context(2),
      ),
    (error) => error instanceof ContractError && error.code === "LIFECYCLE_CONFLICT",
  );
  const active = reviseContract(
    created,
    1,
    { action: "activate", lines: created.lines },
    context(2),
  );
  assert.throws(
    () =>
      reviseContract(
        active,
        2,
        { action: "edit", title: "changed", body: "", lines: active.lines },
        context(3),
      ),
    (error) => error instanceof ContractError && error.code === "LIFECYCLE_CONFLICT",
  );
});

test("line policy is bounded, unique, source-aligned and strictly positive", () => {
  const pieces = line(resource("pcs"), "1.0");
  assert.throws(() => freezeContractLines([pieces.input], [pieces.basis]), ContractError);
  const zero = line(resource("m"), "0");
  assert.throws(() => freezeContractLines([zero.input], [zero.basis]), ContractError);
  const valid = line();
  assert.throws(
    () => freezeContractLines([valid.input, valid.input], [valid.basis, valid.basis]),
    ContractError,
  );
  assert.throws(() => freezeContractLines([valid.input], [resource()]), ContractError);
  const hundred = Array.from({ length: 100 }, () => line());
  assert.equal(
    freezeContractLines(
      hundred.map((value) => value.input),
      hundred.map((value) => value.basis),
    ).length,
    100,
  );
  const extra = line();
  assert.throws(
    () =>
      freezeContractLines(
        [...hundred.map((value) => value.input), extra.input],
        [...hundred.map((value) => value.basis), extra.basis],
      ),
    ContractError,
  );
});

test("aggregate validation cannot be bypassed with caller-constructed frozen lines", () => {
  const basis = resource("m");
  const invalid = {
    lineId: randomUUID(),
    resource: basis,
    agreedQuantity: "0",
  };
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
  assert.throws(
    () =>
      reviseContract(
        null,
        0,
        {
          action: "create",
          title: "Agreement",
          body: "",
          lines: [{ ...invalid, resource: resource("pcs"), agreedQuantity: "1.0" }],
        },
        context(1),
      ),
    (error) => error instanceof ContractError && error.code === "INVALID_INPUT",
  );
});

test("activation requalification cannot rewrite draft pins or agreed quantities", () => {
  const created = draft();
  const line = created.lines[0];
  assert.ok(line);
  for (const changed of [
    { ...line, agreedQuantity: "2" },
    {
      ...line,
      resource: { ...line.resource, resourceRevisionId: randomUUID() },
    },
  ])
    assert.throws(
      () => reviseContract(created, 1, { action: "activate", lines: [changed] }, context(2)),
      (error) => error instanceof ContractError && error.code === "LIFECYCLE_CONFLICT",
    );
});
