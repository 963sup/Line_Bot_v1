export { ProjectError } from "./domain/errors/project-error.js";
export type { ProjectOwnerKind } from "./domain/value-objects/project-owner-kind.js";

export type ProjectAccessRole = "READ" | "WRITE" | "ADMIN";
export type ProjectCollaboratorRole = "NONE" | "READER" | "WRITER" | "ADMIN";
export type ProjectFieldDataType =
  | "DATE"
  | "ITERATION"
  | "MULTI_SELECT"
  | "NUMBER"
  | "SINGLE_SELECT"
  | "TEXT";
export type ProjectOptionColor =
  | "BLUE"
  | "GRAY"
  | "GREEN"
  | "ORANGE"
  | "PINK"
  | "PURPLE"
  | "RED"
  | "YELLOW";
export type ProjectViewLayout = "BOARD_LAYOUT" | "ROADMAP_LAYOUT" | "TABLE_LAYOUT";
export type ProjectStatusUpdateStatus =
  | "AT_RISK"
  | "COMPLETE"
  | "INACTIVE"
  | "OFF_TRACK"
  | "ON_TRACK";
