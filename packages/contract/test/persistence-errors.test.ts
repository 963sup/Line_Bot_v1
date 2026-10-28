import assert from "node:assert/strict";
import test from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresContracts } from "../src/adapters/outbound/persistence/contracts.js";
import { PostgresContractDocuments } from "../src/adapters/outbound/persistence/documents.js";
import { ContractError } from "../src/domain/error.js";

test("Contract adapters preserve infrastructure and business error identity", async () => {
  for (const original of [
    new TypeError("corrupt stored data"),
    Object.assign(new Error("connection lost"), { code: "08006" }),
    new ContractError(409, "conflict", "VERSION_CONFLICT"),
  ]) {
    const db: Database = {
      transaction: async () => {
        throw original;
      },
    };
    const unused = () => {
      throw new Error("unexpected dependency access");
    };
    const contracts = new PostgresContracts(unused, db);
    const documents = new PostgresContractDocuments(unused, db);
    await assert.rejects(
      contracts.read("actor", { repositoryId: "repo", contractId: "contract" }),
      (error: unknown) => error === original,
    );
    await assert.rejects(
      documents.transact(
        "actor",
        {
          repositoryId: "repo",
          documentId: "doc",
          requestId: "request",
          fingerprint: "f",
          intentFingerprint: "i",
        },
        async () => undefined,
      ),
      (error: unknown) => error === original,
    );
  }
});
