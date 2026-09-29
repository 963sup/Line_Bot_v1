import type {
  ActiveExpenseUser,
  ExpenseRepository,
} from "../contracts/repositories/expense-repository.js";
import type { Expense } from "../domain/aggregates/expense.js";

export interface GetExpenseDependencies {
  activeUser: ActiveExpenseUser;
  store(): ExpenseRepository;
}

/** Reads an expense using the member ID resolved from the verified server-side subject. */
export function createGetExpense(deps: GetExpenseDependencies) {
  return async (subject: string, id: string): Promise<Expense> => {
    const owner = (await deps.activeUser(subject)).id;
    return deps.store().get(id, owner);
  };
}
