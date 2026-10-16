import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { TeamError, teamAssert } from "../contracts/errors/team-error.js";
import type { TeamActor, TeamRepository } from "../contracts/input/team-collaboration.js";
import { parseTeamCommand } from "./commands/team-command.js";
import { normalizeTeamSlug } from "./commands/team-slug.js";

const stableId = /^[\w-]{1,128}$/;

export function createTeamCollaboration(repository: () => TeamRepository, now: () => number) {
  return {
    view(actor: TeamActor, organizationAccountId = "", teamId = "") {
      teamAssert(
        organizationAccountId === "" || stableId.test(organizationAccountId),
        400,
        "組織帳號 ID 無效。",
      );
      teamAssert(teamId === "" || stableId.test(teamId), 400, "團隊 ID 無效。");
      teamAssert(!teamId || organizationAccountId, 400, "請先選擇組織。");
      return repository().view(actor, organizationAccountId, teamId);
    },
    viewByLocator(actor: TeamActor, organizationLogin: string, teamSlug: string) {
      let login: string;
      try {
        login = normalizeAccountLogin(organizationLogin);
      } catch {
        throw new TeamError(400, "Organization login 不正確。");
      }
      return repository().viewByLocator(actor, login, normalizeTeamSlug(teamSlug));
    },
    execute(actor: TeamActor, input: unknown) {
      const command = parseTeamCommand(input);
      return repository().execute(actor, command, now());
    },
  };
}
