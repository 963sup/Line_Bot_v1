import assert from "node:assert/strict";
import test from "node:test";
import { validateRuntimeDataAccess } from "./data-access-core.mjs";

function fixture() {
  return {
    semanticModel: { semanticOwners: [{ id: "account" }, { id: "attendance" }] },
    implementationTopology: {
      modules: {
        "@line-work/account": { path: "packages/account", semanticOwner: "account" },
        "@line-work/attendance": { path: "packages/attendance", semanticOwner: "attendance" },
      },
    },
    dataTopology: {
      relations: [
        { name: "users", authority: true, semanticOwner: "account" },
        { name: "attendance_sessions", authority: true, semanticOwner: "attendance" },
        {
          name: "attendance_identity_bindings",
          authority: false,
          role: "derived-projection",
          participants: ["account", "attendance"],
        },
      ],
    },
  };
}

test("owner adapter may read and mutate its authoritative relation", () => {
  const f = fixture();
  assert.deepEqual(
    validateRuntimeDataAccess(f.semanticModel, f.implementationTopology, f.dataTopology, {
      "packages/attendance/src/adapters/postgres/attendance.ts":
        "SELECT * FROM attendance_sessions; UPDATE attendance_sessions SET ended_at=$1 WHERE id=$2",
    }),
    [],
  );
});

test("foreign authoritative mutation is rejected", () => {
  const f = fixture();
  const errors = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    {
      "packages/attendance/src/adapters/postgres/attendance.ts":
        "UPDATE users SET status='active' WHERE id=$1",
    },
  );
  assert.match(errors.join("\n"), /mutates users owned by account/);
});

test("foreign authoritative read is rejected", () => {
  const f = fixture();
  const errors = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    {
      "packages/attendance/src/adapters/postgres/attendance.ts": "SELECT * FROM users",
    },
  );
  assert.match(errors.join("\n"), /reads users owned by account/);
});

test("declared derived projection read is allowed", () => {
  const f = fixture();
  assert.deepEqual(
    validateRuntimeDataAccess(f.semanticModel, f.implementationTopology, f.dataTopology, {
      "packages/attendance/src/adapters/postgres/attendance.ts":
        "SELECT * FROM attendance_identity_bindings",
    }),
    [],
  );
});

test("undeclared derived projection consumer is rejected", () => {
  const f = fixture();
  f.dataTopology.relations[2].participants = ["account"];
  const errors = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    {
      "packages/attendance/src/adapters/postgres/attendance.ts":
        "SELECT * FROM attendance_identity_bindings",
    },
  );
  assert.match(errors.join("\n"), /without declared derived-projection participation/);
});

test("non-postgres source is outside direct database access surface", () => {
  const f = fixture();
  assert.deepEqual(
    validateRuntimeDataAccess(f.semanticModel, f.implementationTopology, f.dataTopology, {
      "packages/attendance/src/domain.ts": "SELECT * FROM users",
    }),
    [],
  );
});
