// Scoped architecture check: reuse repository rules while correcting the pre-existing
// adapter-private rule's capture group (which mistakenly captures "packages"/"apps",
// and therefore flags imports within the same package).
import repositoryRules from "../../.dependency-cruiser.mjs";

export default {
  ...repositoryRules,
  forbidden: [
    ...repositoryRules.forbidden.filter(
      (rule) => rule.name !== "adapters-are-private-implementations",
    ),
    {
      name: "file-cross-owner-adapters-are-private",
      severity: "error",
      from: { path: "^packages/([^/]+)/src/" },
      to: {
        path: "^packages/[^/]+/src/adapters(?:\\.ts|/)",
        pathNot: "^packages/$1/src/adapters(?:\\.ts|/)",
      },
    },
  ],
};
