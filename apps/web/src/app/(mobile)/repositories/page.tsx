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
  const description = createIssue
    ? "選擇可開啟 Issue 的 Repository，接著進入該 Repository 的 Issue 工作流程。"
    : manageAccess
      ? "選擇你可管理的 Repository，調整它自己的 User 與 Team 存取權。"
      : manageSettings
        ? "選擇你可管理的 Repository，調整生命週期、可見性與座標打卡點。地址是選填資訊。"
        : browseResource === "issues"
          ? "選擇 Repository，再進入該 Repository 的 canonical Issues surface。"
          : browseResource === "discussions"
            ? "選擇 Repository，再進入該 Repository 的 canonical Discussions surface。"
            : undefined;
  const repositoryIntent = createIssue
    ? "create-issue"
    : manageAccess
      ? "manage-access"
      : manageSettings
        ? "manage-settings"
        : browseResource === "issues"
          ? "browse-issues"
          : browseResource === "discussions"
            ? "browse-discussions"
            : undefined;

  return (
    <AppShell>
      <PageHeading
        title={choosingRepository ? "Choose Repository" : "Repositories"}
        {...(description ? { description } : {})}
        {...(!choosingRepository
          ? {
              actions: (
                <div className="collection-heading-actions">
                  <RepositoryCollectionActions />
                </div>
              ),
            }
          : {})}
        back="/home"
      />
      <RepositoryList
        liffId={lineMiniApp().liffId}
        {...(repositoryIntent ? { intent: repositoryIntent } : {})}
      />
    </AppShell>
  );
}
