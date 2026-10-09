import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import ServiceSessionControl from "../../../modules/account/service-session-control";
import { ActionRow, PageHeading, SectionHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <AppShell navigation="secondary">
      <PageHeading
        title="Settings"
        description="目前登入者自己的 Account 設定；公開 Profile 仍使用 canonical /{login}。"
        back="/home"
      />

      <SectionHeading title="Account" />
      <div className="menu-group">
        <ActionRow
          href="/settings/profile"
          icon="◎"
          tone="pink"
          title="Edit Profile"
          description="顯示名稱、自我介紹與可見範圍"
        />
        <ActionRow
          href="/settings/account"
          icon="◇"
          tone="green"
          title="Account & Connections"
          description="User lifecycle、LINE 身分與外部連線"
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
        <ActionRow
          href="/settings/users"
          icon="♙"
          tone="orange"
          title="User Management"
          description="查詢 User 狀態與處理停權"
        />
      </div>
      <ServiceSessionControl liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
