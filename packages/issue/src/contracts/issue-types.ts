export type IssueTypeColor =
  | "BLUE"
  | "GRAY"
  | "GREEN"
  | "ORANGE"
  | "PINK"
  | "PURPLE"
  | "RED"
  | "YELLOW";

export type IssueTypeDefinition = Readonly<{
  id: string;
  organizationAccountId: string;
  name: string;
  description: string | null;
  color: IssueTypeColor;
  isEnabled: boolean;
  deletedAt: number | null;
  version: number;
  createdAt: number;
  updatedAt: number;
}>;

type CommandBase = Readonly<{
  requestId: string;
  organizationAccountId: string;
}>;

export type IssueTypeCommand =
  | (CommandBase &
      Readonly<{
        action: "create-issue-type";
        name: string;
        description: string | null;
        color: IssueTypeColor;
        isEnabled: boolean;
      }>)
  | (CommandBase &
      Readonly<{
        action: "update-issue-type";
        issueTypeId: string;
        expectedVersion: number;
        name?: string;
        description?: string | null;
        color?: IssueTypeColor;
        isEnabled?: boolean;
      }>)
  | (CommandBase &
      Readonly<{
        action: "delete-issue-type";
        issueTypeId: string;
        expectedVersion: number;
      }>);

export type IssueTypeList = Readonly<{
  organizationAccountId: string;
  items: readonly IssueTypeDefinition[];
}>;

export type IssueTypeReceipt = Readonly<{
  requestId: string;
  organizationAccountId: string;
  issueTypeId: string;
  action: IssueTypeCommand["action"];
  version: number;
  at: number;
  data: Readonly<Record<string, unknown>>;
}>;

export type IssueTypeIdentity = Readonly<{ userId: string }>;

export interface IssueTypeStore {
  list(identity: IssueTypeIdentity, organizationAccountId: string): Promise<IssueTypeList>;
  execute(
    identity: IssueTypeIdentity,
    command: IssueTypeCommand,
    now: number,
  ): Promise<IssueTypeReceipt>;
}
