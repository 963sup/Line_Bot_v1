import { PageHeading } from "../../shared/ui/page-layout";
import RepositoryResourceNavigation from "./repository-resource-navigation";
import { type RepositoryResourceSection, repositoryPath } from "./resource-navigation";

const titles: Record<RepositoryResourceSection, string> = {
  wbs: "WBS",
  overview: "Overview",
  issues: "Issues",
  discussions: "Discussions",
  labels: "Labels",
  milestones: "Milestones",
  settings: "Settings",
  access: "Access",
};

/** Repository presentation only; permission facts are supplied by the owning query. */
export default function RepositoryPageHeader({
  ownerLogin,
  repositoryName,
  active,
  canManage = false,
  title,
  back,
}: {
  ownerLogin: string;
  repositoryName: string;
  active: RepositoryResourceSection;
  canManage?: boolean;
  title?: string;
  back?: string;
}) {
  return (
    <>
      <PageHeading
        title={title ?? titles[active]}
        description={`${ownerLogin}/${repositoryName}`}
        back={
          back ??
          (active === "overview" ? "/repositories" : repositoryPath(ownerLogin, repositoryName))
        }
      />
      <RepositoryResourceNavigation
        ownerLogin={ownerLogin}
        repositoryName={repositoryName}
        active={active}
        canManage={canManage}
      />
    </>
  );
}
