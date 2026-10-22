---
name: add-feature
description: Build a feature end to end in this repo (Ostra) the way the codebase already does it — Go service method with `service.Error` (Kind + Field) in control/internal/service, Garage admin API calls through the `Garage` interface (+ fakeGarage), chi handler and route in control/internal/api with the response envelope, types/queries/mutations in web/src/lib/api, React page or dialog with `useQuery`, a hand-written `.Skeleton`, `QueryError`/`EmptyState`, mobile list + desktop table, `applyApiError` for forms — plus Go tests on real SQLite with the Garage fake, CHANGELOG, and the CI checks. Use whenever the user wants a new endpoint, page, dialog, setting, or capability in the control-plane or dashboard: "tambah fitur", "bikin endpoint", "halaman baru", "tambah tombol/dialog", bucket quotas, roles/multi-user, audit log, domain re-verification, Cloudflare for SaaS, object preview/rename — even if they only describe the backend or only the UI.
---

# Add a feature (Ostra: Go control-plane + React dashboard)

A feature here usually crosses four layers. Build them in this order, because each one's
types are the next one's input, and the compiler then tells you what's missing:

1. **Data** — schema/query changes (only if needed → `sqlc-migration` skill first)
2. **Service** — business rules in `control/internal/service` (or `auth`)
3. **API** — handler + route in `control/internal/api`
4. **Dashboard** — `web/src/lib/api` types → components → route

Then tests, CHANGELOG, and the checks CI runs.

Before writing, read the closest existing feature end to end and copy its shape. Good
references: access keys (`service/keys.go` → `api/storage_handlers.go` → `lib/api/storage.ts`
→ `components/keys/*` → `routes/(app)/keys/*`), custom domains (DB-backed, with status and
polling), object browser (`service/objects.go`, streaming, `objects_handlers.go`).

Language rule: all code, comments, log/error messages, UI copy and docs are English, even when
the user writes to you in Indonesian.

## 0. Pin down the behavior first

State back, briefly, before coding: the endpoint(s) (method + path), request/response shape,
validation rules and their messages, which errors are 400/404/409, who sees it in the UI, and
whether data lives in SQLite, in Garage, or both. If something is ambiguous and changes the
design (e.g. "quota" = bytes or objects? enforced by Garage or just displayed?), ask.

Garage facts worth knowing up front (they decide 404/409 and what the fake must mimic):
bucket global aliases are unique (a clash is a 4xx), but **key names are not** — two keys may
share a name, so a key rename/create has no 409. A missing bucket is 404 `NoSuchBucket`, a
missing key 404 `NoSuchAccessKey`. The secret key is only returned by `CreateKey`; `GetKey` and
`UpdateKey` return key info without it. Admin API v2 calls are `METHOD /v2/<Operation>?id=...`.

If it touches auth, Caddy `ask`, proxies/client IP, or Docker config, it's security-sensitive:
CONTRIBUTING requires a test proving the unsafe case is rejected. Plan that test now.

## 1. Data

- Needs a new table/column/query → follow the `sqlc-migration` skill, then come back.
- Needs a new Garage admin API call → add it to `control/internal/garage/client.go` (use
  `c.do(ctx, method, "/v2/...", query, body, &out)`, see `EnableWebsite`), add a case in
  `garage/client_test.go`, add the method to the `Garage` interface in `service/service.go`,
  and implement it on `fakeGarage` in `service/domains_test.go` with realistic Garage
  behavior (including its error codes) — otherwise service tests won't compile. Make the new
  fake method honor `g.failAll` (not every existing method does — the key methods don't), or
  you can't test the Garage-down path.

## 2. Service

Put the logic in a method on `*Service` in the file for that resource (`buckets.go`, `keys.go`,
`domains.go`, …; new resource → new file). Patterns to follow:

- **Errors the user should see** go through the helpers in `service/errors.go`:
  `invalid(field, ...)` → 400, `notFound(...)` → 404, `conflict(field, ...)` → 409. Set `field`
  to the JSON name of the form input the error belongs to (`"name"`, `"domain"`, `"bucket"`)
  so the dashboard shows it under that input; leave it `""` for page-level errors. Any other
  error becomes a generic 500 (or 502 for Garage 5xx) without leaking details — that's the
  intent, so don't wrap internal errors into `service.Error`.
- **Lowercase, plain messages** like the existing ones: `"bucket %q not found"`,
  `"domain %s is already registered"`.
- **Normalize then validate** inputs at the top (`strings.TrimSpace`, `NormalizeDomain`,
  `ValidateDomain`/`validate.go`), **before any Garage call**. It's the cleaner design, and
  it's also the only part the API tests can reach (their Garage is a nil stub, see Tests). If
  create and update share a rule (name length, format), extract one helper used by both.
- `sql.ErrNoRows` → `notFound("x not found")`; Garage 404 → `garage.IsNotFound(err)`.
- Logging follows the file you're in: `domains.go` and `systemkey.go` log lifecycle changes
  and background failures (`slog.Info("domain active", ...)`, `slog.Error(...)`); plain
  dashboard CRUD in `buckets.go`/`keys.go` logs nothing, since the request itself is the
  record. Add logging for background work, state machines, and anything an operator would
  look for in the logs later — not for every CRUD call.
- Keep functions under the complexity limits (cyclomatic 12, cognitive 15 for Go). If a method
  grows, split out well-named helpers like `lookupBucket` / `ensureDomainAvailable` rather than
  raising a limit.
- Hidden internals stay hidden: the system S3 key is filtered out of key lists and bucket
  access; keep it that way for anything new that lists keys.

## 3. API

In `control/internal/api` (`storage_handlers.go`, or a new `<resource>_handlers.go` once it
grows), with a route in `Public()` in `api.go` inside the `requireUser` group:

```go
func (h *Handler) createThing(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name string `json:"name"`
	}
	if !decode(w, r, &in) { // 64 KiB limit, unknown fields rejected
		return
	}
	t, err := h.svc.CreateThing(r.Context(), in.Name)
	respond(w, r, http.StatusCreated, t, err)
}
```

- `respond` / `writeData` / `writeError` produce the envelope
  (`{success, statusCode, message, data, meta, error:{type,message,errors}}`) that
  `web/src/lib/api/client.ts` expects. Don't write JSON by hand.
- Status codes: 200 for reads/updates/deletes, 201 for creates.
- Methods: `PATCH /things/{id}` for a partial update of fields (the client has `api.patch`),
  `PUT` when the body replaces a whole sub-resource exactly (like key permissions on a
  bucket), `POST /things/{id}/<verb>` for an action that isn't a field change (`verify`,
  `download-link`). An update returns the same shape as the resource's `GET`, so the
  dashboard can drop it straight into the cache.
- URL params: `chi.URLParam(r, "id")`; integer IDs via `parseID` (it currently says "domain not
  found" — generalize it if you reuse it for another resource).
- JSON is camelCase. If the source is a store row, check every field is safe to expose
  (no `passwordHash`, `verifyToken`, secrets) and map nullable columns with `nullable(...)` into
  a response struct (see `domainResponse`).
- Routes are REST-ish and nested under the owner: `/buckets/{id}/objects`,
  `/keys/{id}/buckets/{bucketId}`, actions as `POST /domains/{id}/verify`.

## 4. Dashboard

### `web/src/lib/api/storage.ts` (or `objects.ts`/`auth.ts`)

- Add the TypeScript interface mirroring the Go JSON exactly (field names, `string | null` for
  nullable, string unions for statuses). The section header says these mirror
  `control/internal/service` and `control/internal/api` — keep them in sync by hand.
- Add a key to `storageKeys` (`thing: (id: string) => ["things", id] as const`, list key as
  prefix so invalidating the list also hits details).
- Queries as `queryOptions` factories (`thingsQuery()`), mutations as plain functions using
  `data(api.post<T>(...))`. `encodeURIComponent` string IDs in paths.
- Poll only when the server is doing work in the background (`pollWhilePending` for domains).

### Components (`web/src/components/<resource>/`)

- **Data component with its own skeleton** as a static property:
  `ThingTable.Skeleton = () => <TableSkeleton columns={COLUMNS} />;` (tables) or a hand-written
  skeleton using `@/components/ui/skeleton` that matches the real layout (`StatCards.Skeleton`).
- **Lists render twice**: `ListGroup` + `ListRowContent` for mobile, and the `Table` inside
  `hidden ... md:flex panel` for desktop — copy `key-table.tsx`.
- **Forms/dialogs**: `react-hook-form` + the `@/components/form/*` inputs' `.WithRHF` variants,
  each with a `startContent` icon and a `placeholder`; a `FIELDS` const of server field names
  and `onError: (error) => applyApiError(error, setError, FIELDS)` so 400s land on the right
  input and everything else becomes a toast. On success invalidate the affected `storageKeys`
  (including `overview` if counts change). Copy `create-key-dialog.tsx`.
- **Edit dialogs** need more than a create dialog:
  - reset the form to the current values each time it opens (`reset(current)` in `onOpenChange`);
  - on success, put the returned object into the detail cache (`queryClient.setQueryData`);
  - invalidate every other query that *displays* the changed field. Key names show on bucket
    pages, and bucket names show on domains, so grep `web/src` for the field;
  - call `router.invalidate()` if the detail route has a `loader` that feeds the tab title
    (`keys/$keyId.tsx`, `domains/$domainId.tsx`), or the title stays stale.
- **Destructive actions** go through `confirm-dialog.tsx`.
- **More than one header action**: wrap them in `<div className="flex gap-2">` as in
  `domains/$domainId.tsx`, and check at phone width that the header still fits.
- Icons are lucide names via `<Icon name="key-round" />`.

### Route (`web/src/routes/(app)/...`)

```tsx
export const Route = createFileRoute("/(app)/things/")({
  head: () => pageMeta("Things", "One-line description."),
  component: Things,
});

function Things() {
  const things = useQuery(thingsQuery());
  return (
    <>
      <AppHeader title="Things" description="…" endContent={<CreateThingDialog />} />
      <div className="p-4 md:flex md:flex-col md:p-6">
        {things.isPending ? <ThingTable.Skeleton />
          : things.isError ? <QueryError error={things.error} onRetry={() => things.refetch()} />
          : things.data.length === 0 ? <EmptyState icon="…" title="No things yet" description="…" action={<CreateThingDialog />} />
          : <ThingTable things={things.data} />}
      </div>
    </>
  );
}
```

- New top-level page → add it to `navGroups` in `src/config/navigation.ts` (with a
  `shortTitle` if the title is long for the mobile tab bar).
- `src/routeTree.gen.ts` is generated by the TanStack Router Vite plugin and committed. After
  adding/renaming a route file, regenerate it with `npx vite build` (or have `npm run dev`
  running) before `npm run typecheck`, or tsc will reject the new path.
- Must work on phone width and in dark mode; reuse existing tokens/classes instead of new colors.

## 5. Tests

Go (required for new behavior):

- **Service tests** in `control/internal/service/<resource>_test.go`, using
  `newTestService(t, newFakeGarage("bucket-a"), &fakeDNS{}, false)` — a real SQLite in a temp
  dir plus the in-memory Garage fake. For the error kind, use the existing helper
  `wantKind(t, err, KindNotFound)` (in `domains_test.go`). It doesn't check `Field`, so for a
  form error, which the dashboard places under an input, assert the field too:

  ```go
  var se *Error
  if !errors.As(err, &se) || se.Kind != KindInvalid || se.Field != "name" {
  	t.Fatalf("want invalid name, got %v", err)
  }
  ```

  If assertions on `Field` repeat, add a `wantField(t, err, kind, field)` helper next to
  `wantKind` instead of copying the block.

  Cover the happy path, each validation rule, not-found, conflict, and Garage failing
  (`g.failAll = errors.New("down")`).
- **API tests** (`control/internal/api/api_test.go` style, `newTestServer` + `call`) when the
  handler does more than call the service: auth required (401 without a token), status codes,
  field errors in the envelope (`error.errors.<field>`), unknown JSON fields rejected, JSON
  shape of anything mapped by hand. Limitation: `newTestServer` wires `stubGarage{}`, a nil
  embedded interface, so any request that reaches Garage panics and comes back as a 500.
  Test only what happens before Garage here (auth, decode, validation); Garage-dependent
  behavior belongs in the service tests. If an endpoint really needs Garage in an API test,
  extend `stubGarage` with just the method you need rather than reusing `fakeGarage` across
  packages.
- Security-sensitive changes: a test that sends the unsafe input and asserts it's rejected.

The dashboard has no test runner; its gate is typecheck + lint + prettier + build. ESLint
doesn't check formatting, so run `npx prettier --write <new and changed files>` in `web/` as
soon as the UI is written; otherwise `prettier --check` fails at the end. The pre-commit hook
would fix it too, but only when the user commits.

## 6. Finish

1. `CHANGELOG.md`: a line under `## [Unreleased]` → `### Added` / `### Changed` / `### Security`
   for anything user-visible, written for operators, not developers.
2. Docs:
   - **README API table** (the `| Method | Path | Description |` table, around "API" in
     `README.md`): add or change a row for every endpoint you touched.
   - New env vars: README and `.env.example` (and `scripts/gen-env.sh` if it needs a
     generated secret).
   - ROADMAP: tick the item if this completes one.
3. Run what CI runs (`.github/workflows/ci.yml` is the source of truth if it has changed; the
   `pre-pr-verify` skill does this generically):

   ```bash
   # control/
   gofmt -l .        # must print nothing (it exits 0 either way)
   go vet ./... && go test -race ./...
   go run github.com/fzipp/gocyclo/cmd/gocyclo@v0.6.0 -over 12 -ignore '_test|internal/store/' .
   go run github.com/uudashr/gocognit/cmd/gocognit@v1.3.0 -over 15 -ignore '_test|internal/store/' .
   go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 ./...
   # web/ (in a fresh checkout or worktree, `npm ci --no-audit --no-fund` first)
   npm run typecheck && npm run lint && npx prettier --check . && npm run build
   npm audit --omit=dev --audit-level=high
   ```

4. If the dev stack is up (`docker compose up -d --build`, then `npm run dev` in `web/` for
   hot reload), click through the feature in the browser — including the empty, loading, error
   and phone-width states — and say what you checked. If you didn't run it, say so.

Don't commit or push; the user commits themselves. End with a short summary: files per layer,
endpoints added, tests added, check results, and anything left for the user to decide.
