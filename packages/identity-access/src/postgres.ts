export {
  hasPermission,
  protectPermissionAdministrator,
} from "./adapters/outbound/persistence/permissions.js";
export { PostgresPermissionStore } from "./composition/bootstrap/permissions.js";
export { requireActiveTargetUser, resolveVerifiedLineActor } from "./postgres/actor.js";
export {
  governanceFingerprint,
  readGovernanceReplay,
  recordGovernanceResult,
} from "./postgres/receipts.js";
export {
  hasEnterpriseOwnerAssignment,
  hasOrganizationOwnerAssignment,
  isOrganizationOwner,
  requireEnterpriseLifecycleOwner,
  requireEnterpriseOwner,
  requireOrganizationOwner,
} from "./postgres/typed-role-assignments.js";
