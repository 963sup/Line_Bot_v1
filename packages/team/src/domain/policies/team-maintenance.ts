import type { UserStatus } from "@line_bot_v1/account/domain/user";
import { teamAssert } from "../errors/team-error.js";

type TeamMembershipStatus = "pending" | "active" | "removed";

export type TeamMemberState = Readonly<{
  userId: string;
  userStatus: UserStatus;
  membershipStatus: TeamMembershipStatus;
  isMaintainer: boolean;
}>;

export function requireTeamMaintainer(isMaintainer: boolean) {
  teamAssert(isMaintainer, 403, "需要團隊維護者權限。");
}

export function requireAnotherEffectiveMaintainer(
  members: readonly TeamMemberState[],
  targetUserId: string,
) {
  teamAssert(
    members.some(
      (member) =>
        member.userId !== targetUserId &&
        member.userStatus === "active" &&
        member.membershipStatus === "active" &&
        member.isMaintainer,
    ),
    409,
    "不能移除或降權最後一位有效團隊維護者。",
  );
}
