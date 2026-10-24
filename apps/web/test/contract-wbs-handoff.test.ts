import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contractWbsHandoffSearch,
  parseContractWbsHandoff,
} from "../src/modules/project/contract-wbs-handoff";

const source = {
  contractOwner: "source-owner",
  contractRepository: "agreement-repo",
  contractId: "11111111-1111-4111-8111-111111111111",
  contractRevisionId: "22222222-2222-4222-8222-222222222222",
};

test("Contract to Project WBS selection carries only version-pinned source locators", () => {
  const encoded = contractWbsHandoffSearch(source);
  assert.deepEqual(parseContractWbsHandoff(new URLSearchParams(encoded)), source);
  assert.equal(encoded.includes("agreedQuantity"), false);
  assert.equal(encoded.includes("fileSha256"), false);
});

test("incomplete or forged Contract handoff cannot select a WBS source", () => {
  assert.equal(parseContractWbsHandoff(new URLSearchParams()), null);
  for (const invalid of [
    { ...source, contractId: "not-an-id" },
    { ...source, contractRevisionId: "bad" },
    { ...source, contractOwner: "" },
    { ...source, contractOwner: "  source-owner  " },
    { ...source, contractRepository: "x".repeat(129) },
  ]) {
    assert.equal(parseContractWbsHandoff(new URLSearchParams(invalid)), null);
  }
});
