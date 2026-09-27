const API_ORIGIN = "https://api.github.com";

export async function githubJson(path, { token, fetchImpl = fetch } = {}) {
  if (!token) throw new Error("GitHub readback requires a token.");
  let response;
  try {
    response = await fetchImpl(`${API_ORIGIN}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("GitHub evidence read failed.");
  }

  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`GitHub returned non-JSON evidence (${response.status}).`);
    }
  }
  if (!response.ok) throw new Error(`GitHub evidence request failed (${response.status}).`);
  return body;
}

export function requireRepository(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) {
    throw new Error("GitHub repository must be owner/name.");
  }
  return repository;
}
