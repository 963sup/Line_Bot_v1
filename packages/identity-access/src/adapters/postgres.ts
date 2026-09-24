export { requireActiveTargetUser, resolveVerifiedLineActor } from "./postgres/actor.js";
export {
  hasPermission,
  PostgresPermissionStore,
  protectPermissionAdministrator,
  workplacePermissionScope,
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
  hasReplacementEnterpriseOwner,
  hasReplacementOrganizationOwner,
  isEnterpriseOwner,
  isOrganizationOwner,
  isTeamMaintainer,
  readEnterpriseOwnerAssignments,
  readEnterpriseOwnerScopeIds,
  readOrganizationOwnerAssignments,
  readOrganizationOwnerScopeIds,
  requireEnterpriseLifecycleOwner,
  requireEnterpriseOwner,
  requireOrganizationLifecycleOwner,
  requireOrganizationOwner,
  revokeEnterpriseOwnerForAffiliationRemoval,
  revokeOrganizationOwnerForMembershipRemoval,
  revokeTeamMaintainer,
} from "./postgres/typed-role-assignments.js";
