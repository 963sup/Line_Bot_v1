import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { normalizeTeamSlug } from "@line_bot_v1/team/domain/value-objects/team-slug";
import { notFound } from "next/navigation";
import TeamPanel from "../../../../../../modules/team/panel";
import { PageHeading } from "../../../../../../shared/ui/page-layout";
import AppShell from "../../../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ login: string; teamSlug: string }>;
}) {
  const { login, teamSlug } = await params;
  let organizationLogin: string;
  let canonicalTeamSlug: string;
  try {
    organizationLogin = normalizeAccountLogin(login);
    canonicalTeamSlug = normalizeTeamSlug(teamSlug);
  } catch {
    notFound();
  }

  return (
    <AppShell>
      <PageHeading
        title="組織團隊"
        description="以 Organization login + Team slug 定位同一個 Team；實際可見內容仍由目前 LINE User 的 Organization 與 Team participation 決定。"
        back="/team"
      />
      <TeamPanel
        liffId={lineMiniApp().liffId}
        initialOrganizationLogin={organizationLogin}
        initialTeamSlug={canonicalTeamSlug}
      />
    </AppShell>
  );
}
