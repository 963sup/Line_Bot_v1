export type PermissionGrant = {
  permission: string;
  workplaceId: string | null;
  workplaceName: string | null;
  effective: boolean;
};
export type PermissionView = {
  userId: string;
  canManage: boolean;
  own: PermissionGrant[];
  target: { id: string; status: string; version: number; grants: PermissionGrant[] } | null;
  history: {
    requestId: string;
    actor: string;
    permission: string;
    workplaceId: string | null;
    enabled: boolean;
    reason: string;
    at: number;
  }[];
  moreHistory: boolean;
};
