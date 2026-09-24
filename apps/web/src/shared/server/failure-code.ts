const providerCodes = new Set([
  "7",
  "14",
  "16",
  "permission-denied",
  "unavailable",
  "unauthenticated",
  "auth/insufficient-permission",
  "auth/invalid-credential",
]);
const networkCodes = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const tlsCodes = new Set([
  "CERT_HAS_EXPIRED",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);
const configurationMessages = new Map([
  ["supabase_database_not_configured", "database_not_configured"],
  ["invalid_database_url", "invalid_database_url"],
  ["configure_ssl_with_server_environment", "database_ssl_configuration"],
  ["supabase_database_pooler_required", "database_pooler_required"],
]);

function safeCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return "";
  const value = error.code;
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** Public-safe infrastructure diagnostics; never exposes provider/database messages. */
export function infrastructureFailureCode(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    const code = safeCode(current);
    if (providerCodes.has(code)) return code;
    if (/^[0-9A-Z]{5}$/.test(code)) return `postgres_${code}`;
    if (networkCodes.has(code)) return `network_${code.toLowerCase()}`;
    if (tlsCodes.has(code)) return `tls_${code.toLowerCase()}`;
    if (code === "ERR_INVALID_URL") return "invalid_database_url";

    if (current instanceof Error) {
      const configuration = configurationMessages.get(current.message);
      if (configuration) return configuration;
    }

    if (typeof current !== "object" || current === null || !("cause" in current)) break;
    current = current.cause;
  }
  return "unknown";
}
