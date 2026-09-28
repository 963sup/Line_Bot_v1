import type { Expense, ExpenseCommand } from "../domain.js";
import type { ActiveExpenseUser, ExpenseRepository } from "./ports/expense-repository.js";

export interface CommandExpenseDependencies {
  activeUser: ActiveExpenseUser;
  store(): ExpenseRepository;
}

/** Applies a domain command under the member ID resolved from the verified server-side subject. */
export function createCommandExpense(deps: CommandExpenseDependencies) {
  return async (subject: string, id: string, command: ExpenseCommand): Promise<Expense> => {
    const owner = (await deps.activeUser(subject)).id;
    return deps.store().command(id, owner, command);
  };
}
