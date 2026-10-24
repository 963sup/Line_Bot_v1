import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewedContractSource } from "../src/modules/project/project-wbs-contract-import";

const ids = {
  contract: "11111111-1111-4111-8111-111111111111",
  revision: "22222222-2222-4222-8222-222222222222",
  line: "33333333-3333-4333-8333-333333333333",
};

function response() {
  return {
    repository: { id: "repository-A" },
    revision: {
      repositoryId: "repository-A",
      contractId: ids.contract,
      revisionId: ids.revision,
      state: "ACTIVE",
      lines: [{
        lineId: ids.line,
        agreedQuantity: "26",
        content: {
          node: {
            id: "task",
            kind: "TASK",
            title: "Install assemblies",
            plannedQuantity: {
              value: "26",
              measure: { unit: "SET" },
            },
          },
        },
      }],
    },
  };
}

test("Contract → Project WBS candidate requires authorized ACTIVE exact Contract source", () => {
  const result = reviewedContractSource(response(), ids.contract);
  assert.deepEqual(result, {
    repositoryId: "repository-A",
    contractId: ids.contract,
    revisionId: ids.revision,
    lines: [{ lineId: ids.line, title: "Install assemblies", agreedQuantity: "26", unit: "SET" }],
  });
  const original = response();
  assert.throws(() => reviewedContractSource({
    ...original, revision: { ...original.revision, state: "DRAFT" },
  }, ids.contract));
  assert.throws(() => reviewedContractSource({
    ...original, revision: { ...original.revision, repositoryId: "repository-B" },
  }, ids.contract));
  assert.throws(() => reviewedContractSource(original, ids.revision));
  assert.throws(() => reviewedContractSource({
    ...original,
    revision: {
      ...original.revision,
      lines: [{ ...original.revision.lines[0], content: {
        node: { kind: "OBJECT", plannedQuantity: null },
      }}],
    },
  }, ids.contract));
});
