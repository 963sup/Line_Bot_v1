import assert from "node:assert/strict";
import test from "node:test";
import { assertRemoteMutationContext } from "./remote.mjs";
import { bucketState, desiredFileBucket, reconcileBucket } from "./storage.mjs";

const configuration = `[storage]
enabled = true
file_size_limit = "50MB"

[storage.buckets.repository-files]
public = false
file_size_limit = "45MiB"
`;
const desired = desiredFileBucket(configuration);
const row = () => ({
  id: desired.id,
  name: desired.id,
  public: false,
  file_size_limit: String(desired.size),
  allowed_mime_types: null,
});

test("native config is the sole explicit Free private Bucket declaration", () => {
  assert.deepEqual(desired, { id: "repository-files", size: 45 * 1024 * 1024, public: false });
  assert.equal(bucketState(desired, null), "missing");
  assert.equal(bucketState(desired, row()), "converged");
  assert.equal(bucketState(desired, { ...row(), public: true }), "conflict");
  assert.equal(bucketState(desired, { ...row(), file_size_limit: null }), "conflict");
  assert.equal(bucketState(desired, { ...row(), allowed_mime_types: ["image/png"] }), "conflict");
  for (const text of [
    configuration.replace("public = false", "public = true"),
    configuration.replace("45MiB", "51MiB"),
    configuration.replace('file_size_limit = "45MiB"', 'file_size_limit = "50MiB"'),
    configuration.replace(
      "[storage.buckets.repository-files]",
      "[storage.buckets.some-other-bucket]",
    ),
    configuration + "\n[storage.buckets.extra]\npublic = false\n",
    configuration + '\nobjects_path = "./fixtures"\n',
    configuration.replace(
      'file_size_limit = "45MiB"',
      'file_size_limit = "45MiB"\nallowed_mime_types = ["image/png"]',
    ),
  ])
    assert.throws(() => desiredFileBucket(text));
  assert.deepEqual(desiredFileBucket(), desired);
});

test("readback is idempotent and never seeds an already converged Bucket", async () => {
  let seeds = 0;
  const result = await reconcileBucket({
    desired,
    read: async () => row(),
    link: async () => assert.fail("unnecessary link"),
    currentMain: async () => assert.fail("unnecessary write"),
    seed: async () => {
      seeds++;
    },
  });
  assert.deepEqual(result, { changed: false, status: "converged" });
  assert.equal(seeds, 0);
});

test("missing Bucket is created once, only after linking and exact main check", async () => {
  let stored = null;
  const events = [];
  const result = await reconcileBucket({
    desired,
    read: async () => stored,
    link: async () => {
      events.push("link");
    },
    currentMain: async () => {
      events.push("main");
    },
    seed: async () => {
      events.push("seed");
      stored = row();
    },
  });
  assert.deepEqual(events, ["link", "main", "seed"]);
  assert.deepEqual(result, { changed: true, status: "converged" });
});

test("divergent Bucket never invokes a write or destructive reconciliation", async () => {
  let called = false;
  await assert.rejects(
    reconcileBucket({
      desired,
      read: async () => ({ ...row(), public: true }),
      link: async () => {
        called = true;
      },
      currentMain: async () => {
        called = true;
      },
      seed: async () => {
        called = true;
      },
    }),
    /review required/,
  );
  assert.equal(called, false);
});

test("unknown provider outcome requires independent readback and no blind retry", async () => {
  let stored = null;
  let calls = 0;
  const args = {
    desired,
    read: async () => stored,
    link: async () => {},
    currentMain: async () => {},
    seed: async () => {
      calls++;
      stored = row();
      throw new Error("provider uncertain");
    },
  };
  const recovered = await reconcileBucket(args);
  assert.equal(recovered.recoveredByReadback, true);
  assert.equal(calls, 1);
  const noOp = await reconcileBucket(args);
  assert.equal(noOp.changed, false);
  assert.equal(calls, 1);
  await assert.rejects(reconcileBucket({ ...args, read: async () => null }), /outcome is unknown/);
});

test("production mutation is gated by existing exact-main Release authority", () => {
  assert.throws(() => assertRemoteMutationContext("sync", {}), /GitHub Actions/);
  assert.doesNotThrow(() =>
    assertRemoteMutationContext("sync", {
      GITHUB_ACTIONS: "true",
      SUPABASE_REMOTE_MUTATION_CONTEXT: "validated-main",
    }),
  );
});
