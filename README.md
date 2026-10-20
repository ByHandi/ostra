# storage-edge

Object storage self-hosted ala Cloudflare R2: **Garage** sebagai storage, **Caddy** sebagai pintu depan dengan TLS otomatis, dan **control-plane** (Go + dashboard React) untuk mengelola bucket, access key, dan custom domain per bucket.

```
                  Internet
                     │
        ┌────────────┴─────────────┐
        │          Caddy           │  ← TLS otomatis per domain
        └──┬──────────────┬────────┘
           │              │
     s3.localhost    cdn.brandku.localhost, <bucket>.web.localhost, ...
     (S3 API)        (public read, custom domain per bucket)
           │              │
           ▼              ▼
   Garage :3900     Garage :3902 (web endpoint)
                          ▲
   control :8080 (dashboard + /api, lewat console.localhost)
           :9000 (internal: /caddy/ask, hanya untuk Caddy)
             │
             ├── SQLite (/data/control.db): domain, akun admin, sesi
             └── admin API Garage :3903: pasang/lepas alias, aktifkan website
```

## Status

- [x] Hari ke-1: Garage single-node, Caddy dengan on-demand TLS, kerangka control-plane
- [x] Hari ke-2: SQLite, verifikasi DNS (CNAME + TXT), integrasi admin API Garage, JSON API, worker
- [x] Hari ke-3: dashboard (dari template shadcn-vite, di-embed ke binary Go), login admin, manajemen bucket dan access key

Langkah selanjutnya menuju rilis open source ada di [ROADMAP.md](ROADMAP.md).

## Menjalankan di lokal

Butuh Docker. Port 80, 443, dan 8080 harus kosong.

```bash
./scripts/gen-env.sh          # bikin/lengkapi .env, isi secret yang kosong
docker compose up -d --build
./scripts/init-dev.sh         # layout Garage, bucket "assets", key, sample/, akun admin, cdn.brandku.localhost
```

Dashboard: **https://console.localhost** (atau http://127.0.0.1:8080). Login dengan `DEV_ADMIN_EMAIL` dan `DEV_ADMIN_PASSWORD` dari `.env`.

Tes custom domain dan S3 API:

```bash
curl -k https://cdn.brandku.localhost/            # index.html lewat custom domain
curl -k https://assets.web.localhost/hello.txt    # lewat <bucket>.web.localhost
docker compose run --rm awscli s3 ls s3://assets/ # S3 API dengan access key dari .env
```

`-k` diperlukan karena di mode dev sertifikat diterbitkan oleh CA lokal Caddy. `*.localhost` otomatis resolve ke 127.0.0.1 di curl dan browser modern. Kalau tidak, tambahkan `--resolve <domain>:443:127.0.0.1`.

### Mengembangkan dashboard

```bash
cd web
npm install
npm run dev      # http://localhost:5173, /api di-proxy ke control-plane di 127.0.0.1:8080
```

`npm run build` menulis hasil build ke `control/internal/ui/dist`, yang di-embed ke binary Go. Image Docker selalu mem-build dashboard sendiri, jadi tidak perlu build manual sebelum `docker compose build`.

### Akun admin

Tidak ada halaman register. Akun dibuat dan di-reset lewat CLI di container:

```bash
docker compose exec control /control createuser --email kamu@contoh.com --name "Nama Kamu"
docker compose exec control /control setpassword --email kamu@contoh.com
```

Password ditanyakan secara interaktif (atau `--password-stdin` untuk script). `setpassword` juga mengakhiri semua sesi user itu.

## Alur custom domain

```
POST /api/domains ──► pending ──(worker tiap 30 dtk / POST .../verify)──► DNS cocok? ──► active
                         ▲                                                   │ tidak
                         └──────────────── lastError diisi ◄─────────────────┘
```

1. User mendaftarkan domain untuk sebuah bucket. Response berisi `dnsRecords` yang harus dipasang:
   - `CNAME <domain> → EDGE_HOSTNAME` (apex domain boleh pakai A/AAAA yang sama dengan IP edge)
   - `TXT _storage-edge.<domain> = storage-edge-verify=<token>`
2. Worker mengecek domain `pending`. Kalau DNS sudah benar, control-plane mengaktifkan website bucket dan memasang domain sebagai alias global di Garage.
3. Status jadi `active`. Saat request pertama datang, Caddy bertanya ke `/caddy/ask`, lalu menerbitkan sertifikat.
4. Kalau Garage menolak (mis. alias sudah dipakai bucket lain), status jadi `error`. `POST .../verify` mencoba ulang.
5. Tiap 5 menit, worker memastikan alias domain aktif masih terpasang. Kalau bucket-nya hilang, status jadi `error`.

Di lokal `DNS_VERIFY=off`, jadi domain langsung `active` tanpa cek DNS.

## API

Format respons mengikuti template `shadcn-vite` dan `go-service-boilerplate`:

```json
{ "success": true, "statusCode": 200, "message": "OK", "data": {}, "meta": null, "error": null }
{ "success": false, "statusCode": 400, "message": "...", "data": null, "meta": null,
  "error": { "type": "validation", "message": "...", "errors": { "domain": ["..."] } } }
```

**Auth.** Access token JWT (15 menit) dikirim di header `Authorization: Bearer`. Refresh token (30 hari, dirotasi setiap dipakai) disimpan di cookie httpOnly `se_refresh` dengan path `/api/auth`. Login dibatasi 5 percobaan per IP, lalu 1 percobaan tiap 12 detik.

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/auth/login` | `{"email","password"}` → `access_token` + cookie |
| POST | `/api/auth/refresh-token` | Tukar cookie dengan token baru |
| POST | `/api/auth/logout` | Cabut sesi, hapus cookie |
| GET | `/api/me` | User yang sedang login |
| POST | `/api/me/password` | `{"currentPassword","newPassword"}`, mengakhiri sesi lain |
| GET | `/api/overview` | Statistik + kesehatan cluster |
| GET/POST | `/api/buckets` | Daftar / buat (`{"name"}`) |
| GET/DELETE | `/api/buckets/{id}` | Detail (key + domain) / hapus (harus kosong, tanpa domain) |
| GET/POST | `/api/keys` | Daftar / buat (`{"name"}`, secret hanya dikembalikan di sini) |
| GET/DELETE | `/api/keys/{id}` | Detail izin per bucket / hapus |
| PUT | `/api/keys/{id}/buckets/{bucketId}` | `{"read","write","owner"}`, set izin persis seperti ini |
| GET/POST | `/api/domains` | Daftar / daftarkan (`{"domain","bucket"}`) |
| GET/DELETE | `/api/domains/{id}` | Detail + `dnsRecords` / hapus |
| POST | `/api/domains/{id}/verify` | Cek DNS sekarang |

## Struktur

| Path | Isi |
|---|---|
| `docker-compose.yml` | Garage, control, Caddy, dan `awscli` (profile `tools`) |
| `garage/garage.toml` | Config Garage. Secret diambil dari env |
| `caddy/Caddyfile.dev` | Mode lokal (`local_certs`) |
| `caddy/Caddyfile` | Mode production (Let's Encrypt). Set `CADDYFILE=Caddyfile` di `.env` |
| `control/Dockerfile` | Multi-stage: build dashboard (Node), lalu binary Go dengan dashboard di-embed |
| `control/cmd/control` | Entry point: server, `createuser`, `setpassword` |
| `control/internal/service` | Logika bisnis: bucket, access key, custom domain, worker |
| `control/internal/auth` | Login, JWT, refresh token, rate limit, argon2id |
| `control/internal/garage` | Client admin API Garage v2 |
| `control/internal/dnscheck` | Cek CNAME/A + TXT |
| `control/internal/api` | Router chi: dashboard + `/api` (:8080) dan internal (:9000) |
| `control/internal/ui` | Serve dashboard yang di-embed (SPA fallback, CSP, cache aset) |
| `control/db` | Migrasi goose + query sqlc (`cd control/db && sqlc generate`) |
| `web/` | Dashboard: Vite + React + TanStack Router/Query + shadcn |
| `scripts/gen-env.sh` | Generate/lengkapi `.env` |
| `scripts/init-dev.sh` | Setup development, aman dijalankan ulang |

## Catatan production

- Ganti `root_domain` di `garage/garage.toml`, lalu sesuaikan `WEB_ROOT_DOMAIN`, `EDGE_HOSTNAME`, dan `RESERVED_DOMAINS` di `.env` dengan domain asli.
- **Set `DNS_VERIFY=on` dan `COOKIE_SECURE=true`.** Isi `DNS_SERVER=1.1.1.1:53` supaya hasil cek DNS tidak tertahan cache lokal.
- Buat akun admin dengan `control createuser`. Jangan pakai `scripts/init-dev.sh` di production.
- Hapus port `127.0.0.1:8080` dari service `control` di compose kalau tidak dipakai. Dashboard cukup diakses lewat Caddy.
- Isi `ACME_EMAIL`, `S3_DOMAIN`, `CONSOLE_DOMAIN` di `.env`, lalu set `CADDYFILE=Caddyfile`.
- Wildcard `*.s3.domainku.com` (virtual-hosted style) butuh DNS challenge, artinya Caddy perlu di-build dengan plugin DNS provider. Tanpa itu, S3 API hanya path-style.
- Jangan expose port 3900/3903 ke publik. Di compose, keduanya hanya di-bind ke 127.0.0.1. Port internal control-plane (9000) juga tidak boleh di-proxy ke publik.
- Mengaktifkan custom domain berarti website bucket dinyalakan, jadi isi bucket juga bisa dibaca publik lewat `<bucket>.web.<domain>`.
- Nama alias bucket maksimal 63 karakter, jadi domain yang lebih panjang dari itu belum bisa dipakai sebagai custom domain.
- `replication_factor = 1` berarti tanpa redundansi. Untuk data penting, pakai minimal 3 node.
