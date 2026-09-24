import MemberPanel from "../../../modules/account/panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import {
  ActionRow,
  PageHeading,
  PageState,
  SectionHeading,
} from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const miniApp = lineMiniApp();
  return (
    <AppShell>
      <PageHeading title="Profile" />

      <SectionHeading title="Account" />
      <div className="menu-group">
        <ActionRow
          href="/settings/profile"
          icon="◎"
          tone="pink"
          title="Profile"
          description="顯示名稱、自我介紹、login 與 visibility"
        />
        <ActionRow
          href="/settings/network"
          icon="↗"
          tone="purple"
          title="Following & Followers"
          description="管理 User follow 關係"
        />
        <ActionRow
          href="/settings/permissions"
          icon="⌘"
          tone="blue"
          title="Permissions"
          description="查看功能與管理範圍"
        />
      </div>
      <MemberPanel liffId={miniApp.liffId} miniAppUrl={miniApp.url} />

      <SectionHeading title="Settings" />
      <div className="menu-group">
        <ActionRow
          href="/enterprises"
          icon="◇"
          tone="pink"
          title="Enterprise"
          description="Enterprise 與跨 Organization 治理"
        />
        <ActionRow
          href="/organizations"
          icon="▦"
          tone="orange"
          title="Organizations"
          description="Organization、成員、邀請與 Owner"
        />
        <ActionRow
          href="/team"
          icon="◫"
          tone="purple"
          title="Teams"
          description="Organization-scoped Team"
        />
        <ActionRow href="/diary" icon="□" title="Work Diary" description="既有外部工作日誌" />
        <ActionRow href="/expenses" icon="$" title="Expenses" description="費用紀錄與既有操作" />
        <ActionRow href="/partners" icon="◇" title="Partners" description="合作夥伴、消息與推薦" />
        <ActionRow href="/admin" icon="⌁" title="Admin" description="具管理責任時使用" />
      </div>

      <SectionHeading title="Preferences" />
      <PageState title="尚未建立 Preferences">
        目前沒有獨立的偏好設定資料與持久化契約，因此不顯示無法保存的假設定。
      </PageState>
    </AppShell>
  );
}
