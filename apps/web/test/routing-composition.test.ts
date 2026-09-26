import assert from "node:assert/strict";
import { test } from "node:test";

test("canonical route compositions do not initialize Postgres during module import", async () => {
  const previousPostgresUrl = process.env.POSTGRES_URL;
  const previousVercelEnv = process.env.VERCEL_ENV;
  delete process.env.POSTGRES_URL;
  delete process.env.VERCEL_ENV;

  try {
    const directory = await import("../src/app/(public)/_composition/directory.server");
    const profileRepositories = await import(
      "../src/app/(public)/_composition/repository.server"
    );
    const repository = await import("../src/app/(resource)/_composition/repository.server");
    const collection = await import(
      "../src/app/api/_composition/repository-collection.server"
    );

    assert.equal(typeof directory.publicOrganizations, "function");
    assert.equal(typeof profileRepositories.publicRepositories, "function");
    assert.equal(typeof repository.publicRepositories, "function");
    assert.equal(typeof collection.repositoryCollection.accessible, "function");
  } finally {
    if (previousPostgresUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = previousPostgresUrl;

    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
  }
});
