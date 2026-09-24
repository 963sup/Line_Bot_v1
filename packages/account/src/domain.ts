/** Stable, provider-independent identity. Existing text values are never re-keyed. */
export type AccountId = string;

/** Human identity reference; qualification and kind must still be checked by the owner. */
export type UserId = AccountId;

export const ACCOUNT_KIND = {
  user: "USER",
  enterprise: "ENTERPRISE",
  organization: "ORGANIZATION",
} as const;

/** Kind classifies identity; it is not a role, qualification or capability grant. */
export type AccountKind = (typeof ACCOUNT_KIND)[keyof typeof ACCOUNT_KIND];
