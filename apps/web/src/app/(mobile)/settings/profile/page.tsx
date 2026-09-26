import LoginPanel from "../../../../modules/account/login-panel";
import ProfilePanel from "../../../../modules/account/profile-panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
import { PageHeading } from "../../../../shared/ui/page-layout";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="編輯個人資料"
        description="編輯產品內的顯示名稱與介紹；LINE Profile 仍只是外部 presentation data。"
        back="/settings"
      />
      <LoginPanel liffId={lineMiniApp().liffId} />
      <ProfilePanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
