export interface WbsScopeBoundary {
  repositoryAvailable(repositoryId: string): Promise<void>;
  legacyQueueAvailable(): Promise<boolean>;
  projectWritable(projectId: string): Promise<void>;
}
