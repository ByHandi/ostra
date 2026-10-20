import { api, refreshSession } from "./client";
import { AUTH_ENDPOINTS, LOGIN_PATH } from "./config";
import { ApiError } from "./errors";
import { clearAccessToken, getAccessToken, setAccessToken } from "./token";

interface Session {
  access_token?: string;
  expires_in?: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export async function login(credentials: LoginCredentials): Promise<void> {
  const res = await api.post<Session>(AUTH_ENDPOINTS.login, credentials);
  const token = res.data?.access_token;

  if (!token) {
    throw new ApiError("Login berhasil, tapi server tidak mengirim access token.", 500);
  }

  setAccessToken(token);
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

/**
 * Changing the password ends every other session; the API answers with a fresh
 * pair for this one, so keep using it.
 */
export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  const res = await api.post<Session>("/me/password", payload);
  const token = res.data?.access_token;
  if (token) setAccessToken(token);
}

export async function logout(): Promise<void> {
  // Best-effort revocation — a failure here must not strand the user in a
  // half-signed-out state, so the local teardown happens either way.
  await api.post(AUTH_ENDPOINTS.logout).catch(() => undefined);

  clearAccessToken();
  // Full reload for the same reason as an expired session: it clears the
  // react-query cache and all component state.
  window.location.assign(LOGIN_PATH);
}

let bootstrap: Promise<void> | null = null;

/**
 * Access tokens live in memory only, so every reload starts with none. Trade the
 * httpOnly refresh cookie for a fresh token — once per page load, however many
 * route guards ask for it.
 *
 * Never rejects: "no session" is a normal outcome, and the guards decide what to
 * do about it.
 */
export function ensureSession(): Promise<void> {
  bootstrap ??= refreshSession().then(() => undefined);
  return bootstrap;
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}
