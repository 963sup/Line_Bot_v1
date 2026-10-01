export { requireActiveTargetUser, resolveVerifiedLineActor } from "./postgres/actor.js";
export {
  hasPermission,
  PostgresPermissionStore,
  protectPermissionAdministrator,
} from "./postgres/permissions.js";
export {
  governanceFingerprint,
  readGovernanceReplay,
  recordGovernanceResult,
} from "./postgres/receipts.js";
export { PostgresRoleAssignments } from "./postgres/role-assignments.js";
export {
  grantTeamMaintainer,
  hasEnterpriseOwnerAssignment,
  hasOrganizationOwnerAssignment,
  hasReplacementOrganizationOwner,
  isOrganizationOwner,
  isTeamMaintainer,
  readOrganizationOwnerAssignments,
  readOrganizationOwnerScopeIds,
  requireEnterpriseLifecycleOwner,
  requireEnterpriseOwner,
  requireOrganizationLifecycleOwner,
  requireOrganizationOwner,
  revokeOrganizationOwnerForMembershipRemoval,
  revokeTeamMaintainer,
} from "./postgres/typed-role-assignments.js";
