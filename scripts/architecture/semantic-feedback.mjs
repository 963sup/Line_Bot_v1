const allowedStatuses = new Set(["pass", "fail", "unknown"]);

function fail(message) {
  throw new Error("Semantic feedback: " + message);
}

function overallStatus(comparisons) {
  const states = new Set(comparisons.map((comparison) => comparison.result));
  if (states.has("drift")) return "drift";
  if (states.has("review")) return "review";
  if (states.has("inconclusive")) return "inconclusive";
  return "aligned";
}

export function compareSemanticFeedback(compiled, bundle) {
  if (compiled.errors.length) {
    fail("semantic architecture is invalid");
  }
  const feedback = compiled.model.evidenceModel?.feedback;
  if (!feedback) fail("feedback model is missing");
  if (bundle?.version !== feedback.bundleVersion) {
    fail("bundle version does not match semantic feedback contract");
  }
  if (typeof bundle.observedAt !== "string" || Number.isNaN(Date.parse(bundle.observedAt))) {
    fail("observedAt must be an ISO-compatible timestamp");
  }
  if (typeof bundle.source !== "string" || !bundle.source.trim()) {
    fail("source must be a non-empty evidence reference");
  }

  const channel = (feedback.channels ?? []).find((candidate) => candidate.id === bundle.channel);
  if (!channel) fail("unknown evidence channel " + bundle.channel);
  if (!Array.isArray(bundle.claims) || bundle.claims.length === 0) {
    fail("claims must be a non-empty array");
  }

  const seen = new Set();
  const comparisons = [];
  for (const claim of bundle.claims) {
    if (typeof claim?.capability !== "string" || !claim.capability) {
      fail("each claim must name a capability");
    }
    if (seen.has(claim.capability)) {
      fail("duplicate capability claim " + claim.capability);
    }
    seen.add(claim.capability);
    if (!allowedStatuses.has(claim.status)) {
      fail("unsupported status for " + claim.capability);
    }
    if (typeof claim.evidenceRef !== "string" || !claim.evidenceRef.trim()) {
      fail("evidenceRef is required for " + claim.capability);
    }

    const capability = compiled.capabilities.get(claim.capability);
    if (!capability) fail("unknown capability " + claim.capability);
    const owner = compiled.owners.get(capability.owner);
    const expectation = capability.runtimeExpectation;
    const aggregateMembers = (capability.members ?? [])
      .map((member) => compiled.capabilities.get(member))
      .filter(Boolean)
      .map((member) => ({
        capability: member.id,
        expectation: member.runtimeExpectation,
        implementationStatus: member.implementation?.status ?? null,
      }));

    let result = "aligned";
    let reason = "Observation matches the declared runtime expectation.";
    if (claim.status === "unknown") {
      result = "inconclusive";
      reason = "Observation is insufficient to compare with the declared runtime expectation.";
    } else if (expectation === "required" && claim.status === "fail") {
      result = "drift";
      reason = "A capability declared required at runtime was observed unavailable or failing.";
    } else if (expectation === "not-asserted" && claim.status === "pass") {
      result = "review";
      reason =
        "Runtime capability was observed although canonical semantics do not assert runtime availability.";
    } else if (expectation === "not-asserted" && claim.status === "fail") {
      reason =
        "Canonical semantics do not assert runtime availability, so no runtime drift is claimed.";
    }

    comparisons.push({
      capability: capability.id,
      owner: capability.owner,
      ownerLifecycle: owner?.lifecycle ?? null,
      kind: capability.kind,
      implementationStatus: capability.implementation?.status ?? null,
      aggregateMembers,
      expectation,
      observed: claim.status,
      evidenceRef: claim.evidenceRef,
      result,
      reason,
    });
  }

  const candidates = comparisons
    .filter((comparison) => comparison.result !== "aligned")
    .map((comparison) => ({
      capability: comparison.capability,
      owner: comparison.owner,
      trigger: comparison.result,
      reason: comparison.reason,
      review: [
        "architecture/semantic-model.json",
        compiled.owners.get(comparison.owner)?.doc ?? null,
        compiled.mappings.get(comparison.owner) ?? null,
      ].filter(Boolean),
      mayRevise: channel.mayRevise,
    }));

  return {
    status: overallStatus(comparisons),
    observedAt: bundle.observedAt,
    source: bundle.source,
    channel: {
      id: channel.id,
      evidenceClass: channel.evidenceClass,
    },
    observationAuthority: feedback.observationAuthority,
    comparisons,
    revisionProposal: {
      derived: true,
      autoApply: false,
      candidates,
    },
  };
}
