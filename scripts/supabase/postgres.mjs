import { readFileSync } from "node:fs";
import { Client } from "pg";

const root = new URL("../../", import.meta.url);
const caSource = new URL("packages/platform/src/database/postgres/ca.ts", root);

export function supabaseCaFromSource(source) {
  const match = source.match(/export const supabaseCa\s*=\s*("(?:\\.|[^"\\])*");/s);
  if (!match) throw new Error("Could not read repository-owned Supabase root CA.");
  const certificate = JSON.parse(match[1]);
  if (
    !certificate.startsWith("-----BEGIN CERTIFICATE-----\n") ||
    !certificate.endsWith("-----END CERTIFICATE-----\n")
  ) {
    throw new Error("Repository-owned Supabase root CA is malformed.");
  }
  return certificate;
}

function repositorySupabaseCa() {
  return supabaseCaFromSource(readFileSync(caSource, "utf8"));
}

export function postgresConfig(rawUrl, { remote }) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("PostgreSQL connection URL is invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("PostgreSQL connection URL must use postgres:// or postgresql://.");
  }
  if (!url.hostname || !url.username || !url.pathname.slice(1)) {
    throw new Error("PostgreSQL connection URL is incomplete.");
  }
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: remote ? { rejectUnauthorized: true, ca: repositorySupabaseCa() } : false,
    application_name: "line-bot-schema-operator",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 120_000,
    query_timeout: 130_000,
  };
}

export async function withPostgres(rawUrl, options, work) {
  const client = new Client(postgresConfig(rawUrl, options));
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

export async function executeSql(rawUrl, sql, options) {
  return withPostgres(rawUrl, options, (client) => client.query(sql));
}

export async function queryRows(rawUrl, sql, options) {
  return withPostgres(rawUrl, options, async (client) => {
    const result = await client.query(sql);
    if (Array.isArray(result)) {
      const final = result.at(-1);
      return final?.rows ?? [];
    }
    return result.rows;
  });
}
