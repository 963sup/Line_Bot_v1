export interface ActionTransferFacts {
  read(projectId: string): Promise<number>;
}
