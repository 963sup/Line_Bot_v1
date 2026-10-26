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

// Partial reruns retain successful jobs from earlier attempts. Select the latest
// execution of each job, so an older success cannot hide a newer failure.
export async function readLatestRunJobs({
  repository,
  runId,
  maxAttempt,
  token,
  fetchImpl = fetch,
}) {
  requireRepository(repository);
  if (!/^\d+$/.test(String(runId))) throw new Error("GitHub workflow run ID is invalid.");
  const latest = new Map();
  for (let page = 1; page <= 100; page++) {
    const body = await githubJson(
      `/repos/${repository}/actions/runs/${runId}/jobs?filter=all&per_page=100&page=${page}`,
      { token, fetchImpl },
    );
    if (!Array.isArray(body.jobs)) throw new Error("GitHub Release job evidence is invalid.");
    for (const job of body.jobs) {
      if (
        !Number.isSafeInteger(job?.id) ||
        job.id <= 0 ||
        !Number.isSafeInteger(job.run_attempt) ||
        job.run_attempt <= 0 ||
        typeof job.name !== "string" ||
        !job.name ||
        (maxAttempt !== undefined && job.run_attempt > maxAttempt)
      )
        throw new Error("GitHub Release job identity or attempt is invalid.");
      const previous = latest.get(job.name);
      if (
        !previous ||
        job.run_attempt > previous.run_attempt ||
        (job.run_attempt === previous.run_attempt && job.id > previous.id)
      )
        latest.set(job.name, job);
    }
    if (body.jobs.length < 100) return [...latest.values()];
  }
  throw new Error("GitHub Release job history exceeds the evidence page limit.");
}
