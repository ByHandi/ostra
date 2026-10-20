import { API_URL, AUTH_ENDPOINTS, LOGIN_PATH } from "./config";
import { ApiError } from "./errors";
import { clearAccessToken, getAccessToken, setAccessToken } from "./token";

export interface ApiEnvelope<T = unknown, M = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: M;
  error?: {
    type?: string;
    message: string;
    errors?: Record<string, string[]> | null;
  } | null;
}

/**
 * Paths that must never trigger refresh-and-retry. Refreshing in response to a
 * failed refresh (or a rejected login) would loop.
 */
const NO_REFRESH: readonly string[] = [AUTH_ENDPOINTS.refresh, AUTH_ENDPOINTS.login];

function endpoint(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL.replace(/\/$/, "")}${normalized}`;
}

function skipsRefresh(path: string): boolean {
  const [pathname] = path.split("?");
  return NO_REFRESH.includes(pathname);
}

let refreshPromise: Promise<boolean> | null = null;

async function performRefresh(attempt = 0): Promise<boolean> {
  try {
    const res = await fetch(endpoint(AUTH_ENDPOINTS.refresh), {
      method: "POST",
      // Sends the httpOnly refresh cookie. Requires the API to answer with
      // `Access-Control-Allow-Credentials: true` and an explicit origin.
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) return false;

    const body = (await res.json().catch(() => null)) as ApiEnvelope<{
      access_token?: string;
    }> | null;
    const token = body?.data?.access_token;
    if (!token) return false;

    setAccessToken(token);
    return true;
  } catch {
    // Transport failure, not a rejected token. One retry, because a momentary
    // blip during boot would otherwise sign the user out of a session that is
    // perfectly valid. A rejected token returns above and is never retried.
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return performRefresh(attempt + 1);
    }

    return false;
  }
}

/**
 * Exchanges the refresh cookie for a new access token, coalescing concurrent
 * callers into one in-flight request.
 *
 * The coalescing is the whole point: if six queries 401 at the same moment, six
 * separate refreshes would race. On a backend that rotates refresh tokens, calls
 * two through six present an already-consumed token and the session is destroyed
 * — the exact failure this pattern exists to prevent.
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

function onSessionExpired(): void {
  clearAccessToken();

  // A full document navigation, deliberately: it drops the react-query cache and
  // every component's state, so nothing from the dead session can be read by
  // whoever signs in next. `router.navigate` would leave all of it in place.
  if (!window.location.pathname.startsWith(LOGIN_PATH)) {
    window.location.assign(LOGIN_PATH);
  }
}

/** Sends the request with the access token attached. Throws only on transport failure. */
async function send(method: string, path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    return await fetch(endpoint(path), {
      ...init,
      method,
      headers,
      credentials: "include",
    });
  } catch (cause) {
    throw new ApiError("Can't reach the server", 0, { cause });
  }
}

/** Turns a response into a success envelope, or throws `ApiError` for anything else. */
async function readEnvelope<T, M>(res: Response): Promise<ApiEnvelope<T, M>> {
  if (res.status === 204) return { success: true };

  const body = (await res.json().catch(() => null)) as ApiEnvelope<T, M> | null;
  if (res.ok && body?.success) return body;

  const error = body?.error;
  throw new ApiError(
    error?.message ?? body?.message ?? `Request failed (${res.status})`,
    res.status,
    {
      type: error?.type,
      fieldErrors: error?.errors ?? null,
    },
  );
}

async function request<T = unknown, M = unknown>(
  method: string,
  path: string,
  init: RequestInit = {},
  isRetry = false,
): Promise<ApiEnvelope<T, M>> {
  const res = await send(method, path, init);

  if (res.status === 401 && !isRetry && !skipsRefresh(path)) {
    if (await refreshSession()) {
      return request<T, M>(method, path, init, true);
    }

    onSessionExpired();
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  return readEnvelope<T, M>(res);
}

function withBody(method: string) {
  return <T = unknown, M = unknown>(path: string, data?: unknown, init: RequestInit = {}) => {
    const isFormData = data instanceof FormData;

    return request<T, M>(method, path, {
      ...init,
      body: isFormData ? data : data === undefined ? undefined : JSON.stringify(data),
      headers: {
        // Let the browser set the multipart boundary itself.
        ...(isFormData || data === undefined ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
  };
}

/**
 * The one gate every call goes through. Attaches the access token, transparently
 * refreshes once on 401, and throws `ApiError` on anything that is not a success
 * envelope.
 */
export const api = {
  get: <T = unknown, M = unknown>(path: string, init?: RequestInit) =>
    request<T, M>("GET", path, init),
  post: withBody("POST"),
  patch: withBody("PATCH"),
  put: withBody("PUT"),
  delete: <T = unknown, M = unknown>(path: string, init?: RequestInit) =>
    request<T, M>("DELETE", path, init),
};
