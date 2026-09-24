import { attendanceMaintenance } from "./attendance.server";

try {
  console.log(JSON.stringify(await attendanceMaintenance()));
} catch {
  console.error("Attendance maintenance failed; queued work is retained.");
  process.exitCode = 1;
}
