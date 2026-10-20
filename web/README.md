# storage-edge web

Dashboard untuk storage-edge: bucket, custom domain, dan access key. Dibangun dari
template [`shadcn-vite`](https://github.com/ByHandi/shadcn-vite) (Vite + React 19 +
TanStack Router/Query + shadcn + Tailwind 4).

Hasil build di-embed ke binary control-plane (`control/internal/ui`) dan dilayani dari
origin yang sama dengan API. Jadi tidak ada CORS, dan `VITE_API_URL` defaultnya `/api`.

## Perintah

| Perintah            | Kegunaan                                                                                |
| ------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`       | Dev server di :5173, `/api` di-proxy ke `CONTROL_URL` (default `http://127.0.0.1:8080`) |
| `npm run build`     | Typecheck lalu build ke `../control/internal/ui/dist/web`                               |
| `npm run typecheck` | `tsc` saja                                                                              |
| `npm run lint`      | ESLint                                                                                  |
| `npm run format`    | Prettier                                                                                |

Untuk `npm run dev`, control-plane harus jalan (`docker compose up -d` di root repo).
Cookie sesi bisa dipakai lewat `http://` karena `docker-compose.dev.yml` mematikan flag `Secure` (setup dari `scripts/gen-env.sh --dev`).

## Struktur

| Path                                             | Isi                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `src/routes/(auth)`                              | Halaman login                                                            |
| `src/routes/(app)`                               | Dashboard, Buckets, Custom Domains, Access Keys, Pengaturan              |
| `src/components/{overview,buckets,domains,keys}` | Komponen per fitur                                                       |
| `src/lib/api/client.ts`                          | Gerbang semua request: access token, refresh otomatis saat 401, envelope |
| `src/lib/api/storage.ts`                         | Tipe, query, dan mutation untuk bucket, key, domain, overview            |
| `src/lib/format.ts`                              | Format ukuran, angka, dan tanggal (locale `id-ID`)                       |

## Skeleton

Setiap komponen yang menampilkan data punya skeleton sendiri sebagai properti statis,
dengan bentuk yang sama seperti komponen aslinya:

```tsx
{
  buckets.isPending ? <BucketTable.Skeleton /> : <BucketTable buckets={buckets.data} />;
}
```

Skeleton tabel memakai `TableSkeleton`, yang langsung menampilkan header kolom asli dan
hanya membuat sel isinya berkedip. Halaman memakai `useQuery` (bukan loader route), jadi
header halaman tetap tampil dan hanya bagian datanya yang diganti skeleton.

## Auth

Access token disimpan di memory saja. Saat halaman dimuat, `ensureSession()` menukar
cookie refresh httpOnly (`/api/auth/refresh-token`) dengan access token baru. Kalau
request mendapat 401, `client.ts` me-refresh satu kali lalu mengulang request. Kalau
gagal lagi, user diarahkan ke `/login`.
