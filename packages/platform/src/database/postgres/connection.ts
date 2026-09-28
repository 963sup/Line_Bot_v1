const secureSslModes = new Set(["require", "verify-ca", "verify-full"]);

export function normalizePostgresConnectionUrl(
  raw: string,
  vercel = Boolean(process.env.VERCEL_ENV),
) {
  if (!raw) throw new Error("supabase_database_not_configured");

  const parsed = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol))
    throw new Error("invalid_database_url");

  const sslKeys = [...parsed.searchParams.keys()].filter((key) => key.startsWith("ssl"));
  const sslMode = parsed.searchParams.get("sslmode");

  if (
    sslKeys.some((key) => key !== "sslmode") ||
    (sslMode !== null && !secureSslModes.has(sslMode))
  ) {
    throw new Error("configure_ssl_with_server_environment");
  }

  // Provider-owned connection URLs may carry sslmode=require/verify-*.
  // The platform adapter owns the effective TLS policy, so remove only that hint
  // before node-postgres parses the URL and keep every unrelated provider parameter.
  parsed.searchParams.delete("sslmode");

  if (vercel && (!parsed.hostname.endsWith(".pooler.supabase.com") || parsed.port !== "6543")) {
    throw new Error("supabase_database_pooler_required");
  }

  return parsed.toString();
}
