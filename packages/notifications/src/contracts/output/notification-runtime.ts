/** The host supplies identity qualification and a clock, never recipient payload authority. */
export interface NotificationRuntime {
  activeUser(subject: string): Promise<{ id: string }>;
  now(): number;
}
