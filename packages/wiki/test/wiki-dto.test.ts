import assert from "node:assert/strict";
import test from "node:test";
import { createWikiHistory } from "../src/application/use-cases/history.js";
import { createWiki } from "../src/application/use-cases/pages.js";
import type { WikiReads, WikiTransactions } from "../src/contracts/output/wiki-pages.js";
import { reviseWikiPage, type WikiRevision } from "../src/domain/wiki-page.js";

test("published Wiki reads, history, writes and replay detach Domain identity and exclude internal fields", async () => {
  const command = {
    action: "create",
    repositoryId: "repo",
    pageId: "11111111-1111-4111-8111-111111111111",
    requestId: "22222222-2222-4222-8222-222222222222",
    expectedVersion: 0,
    title: "Guide",
    body: "Content",
  };
  const internal = {
    ...reviseWikiPage(
      null,
      0,
      { action: "create", title: command.title, body: command.body },
      {
        id: "33333333-3333-4333-8333-333333333333",
        pageId: command.pageId,
        repositoryId: "repo",
        actorUserId: "owner",
        at: 100,
      },
    ),
    internalOnly: "private implementation detail",
  };
  let replay = false;
  const saved: WikiRevision[] = [];
  const reads: WikiReads = {
    list: async () => ({ pages: [], next: null }),
    read: async () => internal,
    history: async () => ({ revisions: [internal], next: null }),
  };
  const transactions: WikiTransactions = {
    transact: async (_userId, _scope, _evidence, operation) =>
      operation({
        scope: { repositoryId: "repo", permissions: ["write"], archived: false },
        nextId: () => internal.id,
        replay: async () => (replay ? { requestId: command.requestId, revision: internal } : null),
        pages: {
          load: async () => null,
          revision: async () => internal,
          save: async (next) => {
            saved.push(next);
          },
        },
        record: async () => {},
      }),
  };
  const wiki = createWiki({ reads, transactions, now: () => 100 });
  const history = createWikiHistory(reads);
  const read = await wiki.read("owner", command);
  const page = await history.history("owner", command);
  const receipt = await wiki.execute("owner", command);
  replay = true;
  const repeated = await wiki.execute("owner", command);
  const canonical = saved[0];
  assert.ok(canonical);
  assert.equal(saved.length, 1);
  assert.deepEqual(receipt, repeated);
  for (const dto of [read, page.revisions[0], receipt.revision, repeated.revision]) {
    assert.ok(dto);
    assert.notStrictEqual(dto, internal);
    assert.notStrictEqual(dto, canonical);
    assert.equal("internalOnly" in dto, false);
    assert.deepEqual(dto, canonical);
  }
  Reflect.set(read, "title", "consumer mutation");
  assert.equal(internal.title, "Guide");
  assert.equal(canonical.title, "Guide");
  assert.equal(repeated.revision.title, "Guide");
});
