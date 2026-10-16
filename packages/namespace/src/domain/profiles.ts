import { NamespaceError, normalizeAccountLogin } from "./namespace.js";

const NAMESPACE_PROFILE_VERSION = 1 as const;

export const NAMESPACE_FAMILIES = Object.freeze([
  "account-login",
  "enterprise-slug",
  "repository-name",
  "organization-team-slug",
  "enterprise-team-slug",
  "repository-label",
  "organization-issue-type",
  "discussion-category",
  "project-field",
  "field-option",
  "project-view",
] as const);

export type NamespaceFamily = (typeof NAMESPACE_FAMILIES)[number];

export type NamespaceScopeKind =
  | "GLOBAL"
  | "OWNER_ACCOUNT"
  | "ORGANIZATION"
  | "ENTERPRISE"
  | "REPOSITORY"
  | "PROJECT"
  | "PROJECT_FIELD";

export type ScopedNamespaceTargetKind =
  | "USER"
  | "ORGANIZATION"
  | "ENTERPRISE"
  | "REPOSITORY"
  | "TEAM"
  | "ENTERPRISE_TEAM"
  | "LABEL"
  | "ISSUE_TYPE"
  | "DISCUSSION_CATEGORY"
  | "PROJECT_FIELD"
  | "FIELD_OPTION"
  | "PROJECT_VIEW";

export type NamespaceProfile = Readonly<{
  family: NamespaceFamily;
  version: typeof NAMESPACE_PROFILE_VERSION;
  scopeKind: NamespaceScopeKind;
  targetKinds: readonly ScopedNamespaceTargetKind[];
  retainsAliases: boolean;
  rename: boolean;
  release: boolean;
  normalize(value: unknown): string;
}>;

function stringInput(value: unknown): string {
  if (typeof value !== "string") throw new NamespaceError(400, "Namespace name is invalid.");
  return value;
}

function invalid(family: NamespaceFamily): never {
  throw new NamespaceError(400, `Invalid ${family} namespace name.`);
}

function asciiSlug(family: NamespaceFamily, value: unknown, max: number): string {
  const name = stringInput(value).trim().toLowerCase();
  if (name.length < 1 || name.length > max || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) {
    return invalid(family);
  }
  return name;
}

function teamSlug(family: NamespaceFamily, value: unknown): string {
  const name = stringInput(value).normalize("NFKC").trim().toLowerCase();
  if (name.length < 1 || name.length > 80 || !/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(name)) {
    return invalid(family);
  }
  return name;
}

function exact(family: NamespaceFamily, value: unknown, max: number): string {
  const name = stringInput(value);
  const visibleLength = name.trim().length;
  if (visibleLength < 1 || visibleLength > max) return invalid(family);
  return name;
}

const profiles = {
  "account-login": {
    family: "account-login",
    version: NAMESPACE_PROFILE_VERSION,
    scopeKind: "GLOBAL",
    targetKinds: ["USER", "ORGANIZATION"],
    retainsAliases: false,
    rename: true,
    release: false,
    normalize: normalizeAccountLogin,
  },
  "enterprise-slug": {
    family: "enterprise-slug",
    version: NAMESPACE_PROFILE_VERSION,
    scopeKind: "GLOBAL",
    targetKinds: ["ENTERPRISE"],
    retainsAliases: false,
    rename: false,
    release: false,
    normalize: (value: unknown) => asciiSlug("enterprise-slug", value, 39),
  },
  "repository-name": {
    family: "repository-name",
    version: NAMESPACE_PROFILE_VERSION,
    scopeKind: "OWNER_ACCOUNT",
    targetKinds: ["REPOSITORY"],
    retainsAliases: true,
    rename: true,
    release: false,
    normalize(value: unknown) {
      const name = stringInput(value).trim();
      if (name.length < 1 || name.length > 100) return invalid("repository-name");
      return name;
    },
  },
  "organization-team-slug": {
    family: "organization-team-slug",
    version: NAMESPACE_PROFILE_VERSION,
    scopeKind: "ORGANIZATION",
    targetKinds: ["TEAM"],
    retainsAliases: false,
    rename: true,
    release: false,
    normalize: (value: unknown) => teamSlug("organization-team-slug", value),
  },
  "enterprise-team-slug": {
    family: "enterprise-team-slug",
    version: NAMESPACE_PROFILE_VERSION,
    scopeKind: "ENTERPRISE",
    targetKinds: ["ENTERPRISE_TEAM"],
    retainsAliases: false,
    rename: true,
    release: false,
    normalize: (value: unknown) => teamSlug("enterprise-team-slug", value),
  },
  "repository-label": {
    family: "repository-label",
    version: NAMESPACE_PROFILE_VERSION,
    scopeKind: "REPOSITORY",
    targetKinds: ["LABEL"],
    retainsAliases: false,
    rename: true,
    release: true,
    normalize: (value: unknown) => exact("repository-label", value, 50),
  },
  "organization-issue-type": {
    family: "organization-issue-type",
    version: NAMESPACE_PROFILE_VERSION,
    scopeKind: "ORGANIZATION",
    targetKinds: ["ISSUE_TYPE"],
    retainsAliases: false,
    rename: true,
    release: true,
    normalize(value: unknown) {
      const name = stringInput(value).trim();
      if (name.length < 1 || name.length > 120) return invalid("organization-issue-type");
      return name;
    },
  },
  "discussion-category": {
    family: "discussion-category",
    version: NAMESPACE_PROFILE_VERSION,
    scopeKind: "REPOSITORY",
    targetKinds: ["DISCUSSION_CATEGORY"],
    retainsAliases: false,
    rename: true,
    release: true,
    normalize: (value: unknown) => asciiSlug("discussion-category", value, 120),
  },
  "project-field": {
    family: "project-field",
    version: NAMESPACE_PROFILE_VERSION,
    scopeKind: "PROJECT",
    targetKinds: ["PROJECT_FIELD"],
    retainsAliases: false,
    rename: true,
    release: true,
    normalize: (value: unknown) => exact("project-field", value, 120),
  },
  "field-option": {
    family: "field-option",
    version: NAMESPACE_PROFILE_VERSION,
    scopeKind: "PROJECT_FIELD",
    targetKinds: ["FIELD_OPTION"],
    retainsAliases: false,
    rename: true,
    release: true,
    normalize: (value: unknown) => exact("field-option", value, 120),
  },
  "project-view": {
    family: "project-view",
    version: NAMESPACE_PROFILE_VERSION,
    scopeKind: "PROJECT",
    targetKinds: ["PROJECT_VIEW"],
    retainsAliases: false,
    rename: true,
    release: true,
    normalize: (value: unknown) => exact("project-view", value, 120),
  },
} satisfies Record<NamespaceFamily, NamespaceProfile>;

for (const profile of Object.values(profiles)) {
  Object.freeze(profile.targetKinds);
  Object.freeze(profile);
}
export const NAMESPACE_PROFILES: Readonly<Record<NamespaceFamily, NamespaceProfile>> =
  Object.freeze(profiles);

export function normalizeNamespaceName(family: NamespaceFamily, value: unknown): string {
  const profile: NamespaceProfile | undefined = NAMESPACE_PROFILES[family];
  if (!profile) throw new NamespaceError(400, "Namespace family is invalid.");
  return profile.normalize(value);
}
