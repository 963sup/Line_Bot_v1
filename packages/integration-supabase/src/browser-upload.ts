/** Validate and transport a signed provider ticket; File Finalize determines the durable result. */
export async function uploadSupabaseFile(
  signedUrl: string,
  revisionId: string,
  file: File,
): Promise<void> {
  const destination = new URL(signedUrl);
  const loopback = (hostname: string) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  const local =
    destination.protocol === "http:" &&
    loopback(destination.hostname) &&
    typeof location !== "undefined" &&
    loopback(location.hostname);
  const hosted =
    destination.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/.test(destination.hostname);
  if (
    (!hosted && !local) ||
    destination.username ||
    destination.password ||
    destination.hash ||
    !destination.pathname.startsWith("/storage/v1/object/upload/sign/repository-files/") ||
    !destination.pathname.endsWith(`/${revisionId}`) ||
    !destination.searchParams.get("token")
  )
    throw new Error("Storage ticket is invalid.");

  const payload = new FormData();
  payload.set("cacheControl", "0");
  payload.append("", file);
  try {
    await fetch(signedUrl, {
      method: "PUT",
      headers: { "x-upsert": "false" },
      body: payload,
      cache: "no-store",
    });
  } catch {
    // The provider may have stored exact bytes before the connection failed.
  }
}
