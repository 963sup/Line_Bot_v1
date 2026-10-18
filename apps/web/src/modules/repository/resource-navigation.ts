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
  | "objects"
  | "wiki"
  | "insights"
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
  const items: {
    href: string;
    label: string;
    section: RepositoryResourceSection;
    group: "primary" | "more";
  }[] = [
    {
      href: repositoryPath(ownerLogin, repositoryName),
      label: "Overview",
      section: "overview",
      group: "primary",
    },
    {
      href: repositoryObjectsPath(ownerLogin, repositoryName),
      label: "Objects",
      section: "objects",
      group: "primary",
    },
    {
      href: repositoryIssuesPath(ownerLogin, repositoryName),
      label: "Issues",
      section: "issues",
      group: "primary",
    },
    {
      href: repositoryDiscussionsPath(ownerLogin, repositoryName),
      label: "Discussions",
      section: "discussions",
      group: "primary",
    },
    {
      href: `${repositoryPath(ownerLogin, repositoryName)}/wiki`,
      label: "Wiki",
      section: "wiki",
      group: "primary",
    },
    {
      href: `${repositoryPath(ownerLogin, repositoryName)}/insights`,
      label: "Insights",
      section: "insights",
      group: "primary",
    },
    {
      href: repositoryLabelsPath(ownerLogin, repositoryName),
      label: "Labels",
      section: "labels",
      group: "more",
    },
    {
      href: repositoryMilestonesPath(ownerLogin, repositoryName),
      label: "Milestones",
      section: "milestones",
      group: "more",
    },
  ];
  if (canManage) {
    items.push(
      {
        href: repositorySettingsPath(ownerLogin, repositoryName),
        label: "Settings",
        section: "settings",
        group: "more",
      },
      {
        href: repositoryAccessPath(ownerLogin, repositoryName),
        label: "Access",
        section: "access",
        group: "more",
      },
    );
  }
  return items;
}

export function repositoryObjectsPath(ownerLogin: string, repositoryName: string) {
  return `${repositoryPath(ownerLogin, repositoryName)}/objects`;
}

export function repositoryObjectPath(ownerLogin: string, repositoryName: string, objectId: string) {
  return `${repositoryObjectsPath(ownerLogin, repositoryName)}/${encodeURIComponent(objectId)}`;
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
