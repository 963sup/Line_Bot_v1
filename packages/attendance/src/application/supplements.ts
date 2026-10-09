import type {
  AttendanceSupplementReview,
  AttendanceSupplementSubmission,
} from "../contracts/input/attendance-supplement.js";
import type { AttendanceSupplementDependencies } from "../contracts/supplements.js";

export function createAttendanceSupplements(dependencies: AttendanceSupplementDependencies) {
  const recipient = (subject: string) => ({ provider: dependencies.provider(), subject });

  return {
    list: async (subject: string) => {
      const user = await dependencies.activeUser(subject);
      return dependencies.store().list(user.id, dependencies.now(), recipient(subject));
    },
    submit: async (subject: string, command: AttendanceSupplementSubmission) => {
      const user = await dependencies.activeUser(subject);
      return dependencies.store().submit(user.id, command, dependencies.now(), recipient(subject));
    },
    review: async (subject: string, command: AttendanceSupplementReview) => {
      const reviewer = await dependencies.activeUser(subject);
      return dependencies
        .store()
        .review(reviewer.id, command, dependencies.now(), recipient(subject));
    },
  };
}
