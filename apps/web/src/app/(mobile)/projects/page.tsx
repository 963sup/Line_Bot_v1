import ProjectList from "../../../modules/project/project-list";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="Projects"
        description="跨 Repository 的規劃空間；目前提供已授權 Project 的唯讀列表。"
        back="/home"
      />
      <ProjectList liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
