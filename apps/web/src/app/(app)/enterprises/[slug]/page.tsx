import { normalizeEnterpriseSlug } from "@line-work/enterprise/domain";
import { notFound } from "next/navigation";
import EnterprisePanel from "../../../../modules/enterprise/panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
import { PageHeading } from "../../../../shared/ui/page-layout";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let enterpriseSlug: string;
  try {
    enterpriseSlug = normalizeEnterpriseSlug(slug);
  } catch {
    notFound();
  }

  return (
    <AppShell>
      <PageHeading
        title="企業管理"
        description="以 Enterprise slug 定位同一個治理範圍；實際可見內容仍由目前 LINE User 的 affiliation 與 owner policy 決定。"
        back="/enterprises"
      />
      <EnterprisePanel liffId={lineMiniApp().liffId} initialSlug={enterpriseSlug} />
    </AppShell>
  );
}
