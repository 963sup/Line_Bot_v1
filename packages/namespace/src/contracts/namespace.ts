import type { NamespaceBinding, NamespaceTarget } from "../domain/namespace.js";

export interface NamespaceStore {
  resolve(login: string): Promise<NamespaceBinding | null>;
  read(target: NamespaceTarget): Promise<NamespaceBinding | null>;
  readMany(targets: readonly NamespaceTarget[]): Promise<NamespaceBinding[]>;
  claim(target: NamespaceTarget, login: string, at: number): Promise<NamespaceBinding>;
  rename(
    target: NamespaceTarget,
    expectedLogin: string,
    login: string,
    at: number,
  ): Promise<NamespaceBinding>;
}
