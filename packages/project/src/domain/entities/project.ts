export type ProjectOwnerKind = "USER" | "ORGANIZATION";

/** Project-owned planning identity; Repository work retains its own authority. @public */
export interface Project {
  readonly id: string;
  readonly ownerAccountId: string;
  readonly ownerAccountKind: ProjectOwnerKind;
  readonly name: string;
  readonly version: number;
}
