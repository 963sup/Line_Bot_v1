export class DailyCheckInError extends Error {
  constructor(
    readonly status = 400,
    message = "會員簽到時間不正確。",
  ) {
    super(message);
    this.name = "DailyCheckInError";
  }
}
