import MemberPanel from "../../../modules/account/panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { ActionRow, PageHeading, SectionHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const miniApp = lineMiniApp();
  return (
    <AppShell>
      <PageHeading
        title="Settings"
        description="目前登入者自己的 Account 設定；公開 Profile 仍使用 canonical /{login}。"
      />

      <SectionHeading title="Account" />
      <div className="menu-group">
        <ActionRow
          href="/settings/profile"
          icon="◎"
          tone="pink"
          title="Edit Profile"
          description="顯示名稱、自我介紹、login 與 visibility"
        />
        <ActionRow
          href="/settings/network"
          icon="↗"
          tone="purple"
          title="Following & Followers"
          description="管理自己的 User follow 關係"
        />
        <ActionRow
          href="/settings/permissions"
          icon="⌘"
          tone="blue"
          title="Permissions"
          description="查看自己的功能與管理範圍"
        />
      </div>

      <MemberPanel liffId={miniApp.liffId} miniAppUrl={miniApp.url} />
    </AppShell>
  );
}
