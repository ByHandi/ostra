# Ostra web

Dashboard for Ostra: buckets, custom domains, and access keys. Built from the
[`shadcn-vite`](https://github.com/ByHandi/shadcn-vite) template (Vite + React 19 +
TanStack Router/Query + shadcn + Tailwind 4).

The build output is embedded into the control-plane binary (`control/internal/ui`) and served
from the same origin as the API. So there is no CORS, and `VITE_API_URL` defaults to `/api`.

## Commands

| Command             | Purpose                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev`       | Dev server on :5173, `/api` is proxied to `CONTROL_URL` (default `http://127.0.0.1:8080`) |
| `npm run build`     | Typecheck, then build to `../control/internal/ui/dist/web`                                |
| `npm run typecheck` | `tsc` only                                                                                |
| `npm run lint`      | ESLint                                                                                    |
| `npm run format`    | Prettier                                                                                  |

For `npm run dev`, the control plane must be running (`docker compose up -d` in the repo root).
The session cookie works over `http://` because `docker-compose.dev.yml` turns off the `Secure` flag (set up by `scripts/gen-env.sh --dev`).

## Structure

| Path                                             | Contents                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `src/routes/(auth)`                              | Login page                                                                 |
| `src/routes/(app)`                               | Dashboard, Buckets, Custom Domains, Access Keys, Settings                  |
| `src/components/{overview,buckets,domains,keys}` | Per-feature components                                                     |
| `src/lib/api/client.ts`                          | Gate for every request: access token, automatic refresh on 401, envelope   |
| `src/lib/api/storage.ts`                         | Types, queries, and mutations for buckets, keys, domains, and the overview |
| `src/lib/format.ts`                              | Formatting for sizes, numbers, and dates (locale `en-US`)                  |

## Skeletons

Every component that displays data has its own skeleton as a static property, with the
same shape as the real component:

```tsx
{
  buckets.isPending ? <BucketTable.Skeleton /> : <BucketTable buckets={buckets.data} />;
}
```

Table skeletons use `TableSkeleton`, which renders the real column headers right away and
only pulses the body cells. Pages use `useQuery` (not route loaders), so the page header
stays visible and only the data section is swapped for a skeleton.

## Auth

The access token is kept in memory only. On page load, `ensureSession()` exchanges the
httpOnly refresh cookie (`/api/auth/refresh-token`) for a new access token. If a request
gets a 401, `client.ts` refreshes once and retries the request. If that fails again, the
user is redirected to `/login`.
