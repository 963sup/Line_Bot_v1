export function projectRefFromSupabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SUPABASE_URL must be a valid https://<project-ref>.supabase.co URL.");
  }
  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  if (url.protocol !== "https:" || !match || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("SUPABASE_URL must be a valid https://<project-ref>.supabase.co URL.");
  }
  return match[1];
}

export function assertRemoteTarget(supabaseUrl, postgresUrl) {
  const projectRef = projectRefFromSupabaseUrl(supabaseUrl);
  let databaseUrl;
  try {
    databaseUrl = new URL(postgresUrl);
  } catch {
    throw new Error("POSTGRES_URL_NON_POOLING must be a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("POSTGRES_URL_NON_POOLING must use postgres:// or postgresql://.");
  }
  if (decodeURIComponent(databaseUrl.pathname) !== "/postgres") {
    throw new Error("POSTGRES_URL_NON_POOLING must target the postgres database.");
  }
  if (databaseUrl.port === "6543") {
    throw new Error("POSTGRES_URL_NON_POOLING must not use the transaction pooler on port 6543.");
  }
  const hostnameMatches = databaseUrl.hostname.includes(projectRef);
  const usernameMatches = decodeURIComponent(databaseUrl.username).endsWith(`.${projectRef}`);
  if (!hostnameMatches && !usernameMatches) {
    throw new Error(
      `POSTGRES_URL_NON_POOLING does not target SUPABASE_URL project ${projectRef}; refusing remote mutation.`,
    );
  }
  return projectRef;
}

export function assertConfirmedProject(projectRef, confirmedProject) {
  if (!confirmedProject || confirmedProject !== projectRef) {
    throw new Error(
      `SUPABASE_CONFIRM_PROJECT must exactly match target project ${projectRef}; refusing remote access.`,
    );
  }
}
