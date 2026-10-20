import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/errors";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // A 401 has already been through refresh-and-retry inside the gate, and a
        // 4xx will not fix itself — retrying only fires doomed requests while the
        // redirect is in flight. Network errors and 5xx are worth another go.
        if (error instanceof ApiError && !error.isNetworkError && error.status < 500) {
          return false;
        }

        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});
