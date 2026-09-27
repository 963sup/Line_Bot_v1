/** Project-owned planning identity; Repository work retains its own authority. @public */
export interface Project {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly version: number;
}
