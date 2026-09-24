export class AttendanceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
