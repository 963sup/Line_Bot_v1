export type LoginOwner = Readonly<{
  id: string;
  kind: "USER" | "ORGANIZATION";
  login: string;
}>;

export interface LoginDirectoryStore {
  resolve(login: string): Promise<LoginOwner | null>;
}
