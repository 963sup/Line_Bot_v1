import type { Expense } from "../domain.js";
import type { ReceiptIntakeDependencies } from "./ports/receipt-intake.js";

export type ReceiptIntakeCommand =
  | { type: "start" }
  | { type: "cancel" }
  | { type: "receive"; imageId: string };

export type ReceiptIntakeResult =
  | { type: "started" | "cancelled" | "ignored" }
  | { type: "received"; expense: Expense };

/** The caller supplies a verified LINE subject and scope, never a client-declared owner. */
export function createReceiptIntake(deps: ReceiptIntakeDependencies) {
  return async (
    userId: string,
    scope: string,
    command: ReceiptIntakeCommand,
  ): Promise<ReceiptIntakeResult> => {
    const owner = (await deps.activeUser(userId)).id;
    switch (command.type) {
      case "start":
        await deps.store().arm(scope, owner);
        return { type: "started" };
      case "cancel":
        await deps.store().cancelIntent(scope, owner);
        return { type: "cancelled" };
      case "receive": {
        const expense = await deps.store().receive(scope, owner, command.imageId);
        return expense ? { type: "received", expense } : { type: "ignored" };
      }
    }
  };
}
