import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import RepositoryList, {
  RepositoryCollectionActions,
} from "../../../modules/repository/repository-list";
import { PageHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[]; resource?: string | string[] }>;
}) {
  const { intent, resource } = await searchParams;
  const createIssue = intent === "create-issue";
  const manageAccess = intent === "manage-access";
  const manageSettings = intent === "manage-settings";
  const browseResource = resource === "issues" || resource === "discussions" ? resource : undefined;
  const choosingRepository =
    createIssue || manageAccess || manageSettings || Boolean(browseResource);

  return (
    <AppShell>
      <PageHeading
        title={choosingRepository ? "Choose Repository" : "Repositories"}
        description={
          createIssue
            ? "選擇具 write 或 admin capability 的 Repository，再建立該 Repository 擁有的 Issue。"
            : manageAccess
              ? "選擇具 admin capability 的 Repository，再管理 Direct User 與 Organization Team access。"
              : manageSettings
                ? "選擇具 admin capability 的 Repository，再設定地址與打卡範圍。"
                : browseResource === "issues"
                  ? "選擇 Repository，再進入該 Repository 的 canonical Issues surface。"
                  : browseResource === "discussions"
                    ? "選擇 Repository，再進入該 Repository 的 canonical Discussions surface。"
                    : undefined
        }
        actions={
          choosingRepository ? undefined : (
            <div className="collection-heading-actions">
              <RepositoryCollectionActions />
            </div>
          )
        }
        back="/home"
      />
      <RepositoryList
        liffId={lineMiniApp().liffId}
        intent={
          createIssue
            ? "create-issue"
            : manageAccess
              ? "manage-access"
              : manageSettings
                ? "manage-settings"
                : browseResource === "issues"
                  ? "browse-issues"
                  : browseResource === "discussions"
                    ? "browse-discussions"
                    : undefined
        }
      />
    </AppShell>
  );
}
