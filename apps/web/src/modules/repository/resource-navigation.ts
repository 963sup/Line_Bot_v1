export function repositoryPath(ownerLogin: string, repositoryName: string) {
  return `/${encodeURIComponent(ownerLogin)}/${encodeURIComponent(repositoryName)}`;
}

export function repositoryIssuesPath(ownerLogin: string, repositoryName: string) {
  return `${repositoryPath(ownerLogin, repositoryName)}/issues`;
}

export function repositoryIssueCreatePath(ownerLogin: string, repositoryName: string) {
  return `${repositoryIssuesPath(ownerLogin, repositoryName)}?create=1`;
}

export function repositoryDiscussionsPath(ownerLogin: string, repositoryName: string) {
  return `${repositoryPath(ownerLogin, repositoryName)}/discussions`;
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
