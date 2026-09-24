export interface AnswerDependencies {
  now(): number;
  acquireCooldown(): boolean;
  generate(input: string): Promise<string | undefined>;
  draftIssue(input: string): Promise<string>;
}
