import { normalizeEnterpriseSlug, normalizeEnterpriseTeamSlug } from "@line-work/enterprise/domain";
import { notFound } from "next/navigation";
import EnterprisePanel from "../../../../../../modules/enterprise/panel";
import { lineMiniApp } from "../../../../../../shared/server/line-mini-app";
import { PageHeading } from "../../../../../../shared/ui/page-layout";
import AppShell from "../../../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; teamSlug: string }>;
}) {
  const { slug, teamSlug } = await params;
  let enterpriseSlug: string;
  let canonicalTeamSlug: string;
  try {
    enterpriseSlug = normalizeEnterpriseSlug(slug);
    canonicalTeamSlug = normalizeEnterpriseTeamSlug(teamSlug);
  } catch {
    notFound();
  }

  return (
    <AppShell>
      <PageHeading
        title="企業團隊"
        description="以 Enterprise slug + Enterprise Team slug 定位同一個治理資源；實際可見內容仍由目前 LINE User 的 Enterprise affiliation 與 owner policy決定。"
        back={`/enterprises/${enterpriseSlug}`}
      />
      <EnterprisePanel
        liffId={lineMiniApp().liffId}
        initialSlug={enterpriseSlug}
        initialTeamSlug={canonicalTeamSlug}
      />
    </AppShell>
  );
}
