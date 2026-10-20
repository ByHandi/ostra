/**
 * The control-plane serves this bundle and the API from the same origin, so the
 * default is a path. Override with VITE_API_URL only for an unusual deployment.
 */
export const API_URL = (import.meta.env.VITE_API_URL?.trim() || "/api").replace(/\/$/, "");

export const AUTH_ENDPOINTS = {
  login: "/auth/login",
  refresh: "/auth/refresh-token",
  logout: "/auth/logout",
} as const;

/** Where the gate sends you once the session is unrecoverable. */
export const LOGIN_PATH = "/login";
