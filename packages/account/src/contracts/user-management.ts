export type ManagedUser = {
  id: string;
  status: "active" | "paused" | "suspended";
  createdAt: number;
  version: number;
  googleLinked: boolean;
  restoreStatus: "active" | "paused";
};
export type UserStatusReceipt = {
  id: string;
  requestId: string;
  status: ManagedUser["status"];
  version: number;
  at: number;
};
export type UserManagementQuery = {
  id?: string;
  status?: ManagedUser["status"];
  after?: string;
};
export type UserManagementView = {
  actorId: string;
  canSuspend: boolean;
  users: ManagedUser[];
  next: string | null;
  detail: null | {
    user: ManagedUser;
    events: { type: string; at: number }[];
    moreEvents: boolean;
    operations: {
      actor: string;
      action: string;
      reason: string;
      status: string;
      version: number;
      at: number;
    }[];
    moreOperations: boolean;
    openAttendance: string[];
    unfinishedIssues: string[];
    unfinishedIssueCount: number;
  };
};
