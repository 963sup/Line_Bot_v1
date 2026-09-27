/** Stable, provider-independent identity. Existing text values are never re-keyed. */
export type AccountId = string;

/** Human identity reference; qualification and kind must still be checked by the owner. */
export type UserId = AccountId;
