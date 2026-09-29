import { teamAssert } from "../errors/team-error.js";

export function teamVersion(actual: number, expected: number) {
  teamAssert(actual === expected, 409, "團隊資料已更新，請重新載入後再確認。");
}
