/** The host supplies identity qualification and a clock, never recipient payload authority. */
export type NotificationRuntime = {
  activeUser(subject: string): Promise<{ id: string }>;
  now(): number;
};
