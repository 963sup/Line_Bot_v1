import { UserError } from "@line-work/account/domain/user";
import { infrastructureFailureCode } from "../../shared/server/failure-code";

/** Membership-specific public diagnostic wrapper over neutral infrastructure classification. */
export function membershipFailureCode(error: unknown) {
  return error instanceof UserError
    ? `membership_${error.status}`
    : infrastructureFailureCode(error);
}
