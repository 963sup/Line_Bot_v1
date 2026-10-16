import type { Permission } from "../domain/permission.js";

export type PermissionReceipt = { requestId: string; version: number };

export type PermissionGrant = {
  permission: string;
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
    enabled: boolean;
    reason: string;
    at: number;
  }[];
  moreHistory: boolean;
};

/** Published request accepted by the typed permission capability. */
export type PermissionChangeRequest = {
  requestId: string;
  target: string;
  permission: Permission;
  enabled: boolean;
  expectedVersion: number;
  reason: string;
};
