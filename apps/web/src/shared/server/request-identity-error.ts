export class RequestIdentityError extends Error {
  constructor(
    public readonly status: 401 | 429 | 503,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
