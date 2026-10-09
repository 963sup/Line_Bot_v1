export type PublicOrganization = Readonly<{
  id: string;
  login: string;
  name: string;
}>;

export interface OrganizationPublicStore {
  byLogin(login: string): Promise<PublicOrganization | null>;
}
