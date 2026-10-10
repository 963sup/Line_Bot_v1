import type { OrganizationMemberRole } from "../../domain.js";

export type PublicOrganization = Readonly<{
  id: string;
  login: string;
  name: string;
}>;

export type OrganizationViewerCapabilities = Readonly<{
  memberRole: OrganizationMemberRole;
  isOrganizationOwner: boolean;
  viewerIsAMember: true;
  viewerCanAdminister: boolean;
  viewerCanCreateRepositories: boolean;
  viewerCanCreateProjects: boolean;
  viewerCanCreateTeams: boolean;
  organizationVersion: number;
  membershipVersion: number;
  roleVersion: number | null;
}>;

export interface OrganizationPublicStore {
  byLogin(login: string): Promise<PublicOrganization | null>;
}
