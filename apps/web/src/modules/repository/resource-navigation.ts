export function repositoryPath(ownerLogin: string, repositoryName: string) {
  return `/${encodeURIComponent(ownerLogin)}/${encodeURIComponent(repositoryName)}`;
}

export function repositoryAccessPath(ownerLogin: string, repositoryName: string) {
  return `${repositoryPath(ownerLogin, repositoryName)}/access`;
}

export function repositorySettingsPath(ownerLogin: string, repositoryName: string) {
  return `${repositoryPath(ownerLogin, repositoryName)}/settings`;
}

export function repositoryIssuesPath(ownerLogin: string, repositoryName: string) {
  return `${repositoryPath(ownerLogin, repositoryName)}/issues`;
}

export type RepositoryResourceSection =
  | "wbs"
  | "overview"
  | "issues"
  | "discussions"
  | "labels"
  | "milestones"
  | "settings"
  | "access";

export function repositoryResourceNavigationItems(
  ownerLogin: string,
  repositoryName: string,
  canManage: boolean,
) {
  const items: { href: string; label: string; section: RepositoryResourceSection }[] = [
    { href: `${repositoryPath(ownerLogin, repositoryName)}/wbs`, label: "WBS", section: "wbs" },
    { href: repositoryPath(ownerLogin, repositoryName), label: "Overview", section: "overview" },
    { href: repositoryIssuesPath(ownerLogin, repositoryName), label: "Issues", section: "issues" },
    {
      href: repositoryDiscussionsPath(ownerLogin, repositoryName),
      label: "Discussions",
      section: "discussions",
    },
    { href: repositoryLabelsPath(ownerLogin, repositoryName), label: "Labels", section: "labels" },
    {
      href: repositoryMilestonesPath(ownerLogin, repositoryName),
      label: "Milestones",
      section: "milestones",
    },
  ];
  if (canManage) {
    items.push(
      {
        href: repositorySettingsPath(ownerLogin, repositoryName),
        label: "Settings",
        section: "settings",
      },
      {
        href: repositoryAccessPath(ownerLogin, repositoryName),
        label: "Access",
        section: "access",
      },
    );
  }
  return items;
}

export function repositoryIssueCreatePath(ownerLogin: string, repositoryName: string) {
  return `${repositoryIssuesPath(ownerLogin, repositoryName)}?create=1`;
}

export function repositoryDiscussionsPath(ownerLogin: string, repositoryName: string) {
  return `${repositoryPath(ownerLogin, repositoryName)}/discussions`;
}

export function repositoryDiscussionPath(
  ownerLogin: string,
  repositoryName: string,
  discussionId: string,
  discussionNumber: number | null,
) {
  const base = repositoryDiscussionsPath(ownerLogin, repositoryName);
  return discussionNumber === null
    ? `${base}/${encodeURIComponent(discussionId)}`
    : `${base}/number/${encodeURIComponent(String(discussionNumber))}`;
}

export function repositoryLabelsPath(ownerLogin: string, repositoryName: string) {
  return `${repositoryPath(ownerLogin, repositoryName)}/labels`;
}

export function repositoryMilestonesPath(ownerLogin: string, repositoryName: string) {
  return `${repositoryPath(ownerLogin, repositoryName)}/milestones`;
}

export function repositoryIssuePath(
  ownerLogin: string,
  repositoryName: string,
  issueNumber: number,
) {
  return `${repositoryIssuesPath(ownerLogin, repositoryName)}/${issueNumber}`;
}

export function repositoryStarListsPath() {
  return "/repositories/lists";
}

export function repositoryStarListCreatePath() {
  return "/repositories/lists/new";
}

export function repositoryStarListDiscoverPath() {
  return "/repositories/lists/discover";
}

export function repositoryStarListPath(listId: string) {
  return `${repositoryStarListsPath()}/${encodeURIComponent(listId)}`;
}
