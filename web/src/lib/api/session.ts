import { queryOptions } from "@tanstack/react-query";

import { api } from "./client";
import { ApiError } from "./errors";

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
}

export interface SessionContext {
  user: CurrentUser;
}

/**
 * Ostra has a single admin role, so the session is just who is signed in.
 * Kept as a context object so the shell has one place to read from if roles are
 * ever added.
 */
async function fetchSessionContext(): Promise<SessionContext> {
  const me = await api.get<CurrentUser>("/me");
  if (!me.data) {
    throw new ApiError("Signed in, but /me did not return a user.", 500);
  }
  return { user: me.data };
}

export const SESSION_CONTEXT_KEY = ["session", "context"] as const;

export function sessionContextQuery() {
  return queryOptions({
    queryKey: SESSION_CONTEXT_KEY,
    queryFn: fetchSessionContext,
    // The shell reads this on every navigation; refetching that often is waste.
    staleTime: 5 * 60_000,
  });
}
