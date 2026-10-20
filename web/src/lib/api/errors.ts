export interface ApiErrorOptions {
  /** Machine-readable discriminator from the API, when it sends one. */
  type?: string;
  /** Per-field validation messages, keyed by field name. */
  fieldErrors?: Record<string, string[]> | null;
  cause?: unknown;
}

/**
 * Thrown by every failed call in `lib/api/client`. The gate throws rather than
 * returning a `{ success: false }` envelope so that react-query, error
 * boundaries, and `try/catch` all see failures through one mechanism.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly type: string | undefined;
  readonly fieldErrors: Record<string, string[]> | null;

  constructor(message: string, status: number, options: ApiErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.status = status;
    this.type = options.type;
    this.fieldErrors = options.fieldErrors ?? null;
  }

  /** True for a transport failure — the request never reached the API. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}
