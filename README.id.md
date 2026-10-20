# storage-edge

[English](README.md) · **Bahasa Indonesia**

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

Langkah selanjutnya menuju rilis open source ada di [ROADMAP.md](ROADMAP.md). Mau berkontribusi? Lihat [CONTRIBUTING.md](CONTRIBUTING.md). Laporan celah keamanan: [SECURITY.md](SECURITY.md).

## Deploy production

Butuh server dengan Docker dan port 80/443 yang bisa diakses dari internet.

**1. DNS.** Arahkan record berikut ke IP server (ganti `domainku.com` dengan domainmu):

| Record | Untuk |
|---|---|
| `console.domainku.com` | Dashboard |
| `s3.domainku.com` | S3 API |
| `edge.domainku.com` | Target CNAME custom domain milik user |
| `*.web.domainku.com` | Akses web per bucket (opsional) |

**2. Konfigurasi dan jalankan.**

```bash
./scripts/gen-env.sh          # buat .env dan isi semua secret
# edit .env: isi BASE_DOMAIN=domainku.com dan ACME_EMAIL
docker compose pull           # image rilis dari ghcr.io/byhandi/storage-edge
docker compose up -d
```

Untuk memakai versi tertentu, isi `CONTROL_IMAGE=ghcr.io/byhandi/storage-edge:<versi>` di `.env`. Kalau mau membangun dari source, pakai `docker compose up -d --build`.

Layout Garage dibuat otomatis (`garage server --single-node`), sertifikat diambil dari Let's Encrypt saat request pertama.

**3. Buat akun admin pertama**, lalu buka `https://console.domainku.com`:

```bash
docker compose exec control /control createuser --email kamu@domainku.com --name "Nama Kamu"
```

`docker-compose.yml` sudah aman untuk production: verifikasi DNS custom domain aktif, cookie sesi `Secure`, dan port admin Garage tidak di-publish. Semua kelonggaran development ada di `docker-compose.dev.yml`, dan control-plane menolak start kalau kelonggaran itu dipakai dengan domain selain `.localhost`/`.test`.

## Backup dan restore

```bash
./scripts/backup.sh                 # → backups/storage-edge-<waktu UTC>/
./scripts/restore.sh backups/storage-edge-20261020T082634Z
```

- **Cold backup:** semua service dihentikan selama penyalinan (biasanya beberapa detik, tergantung ukuran data) supaya metadata Garage, blok data, dan database control-plane konsisten. Service dinyalakan lagi otomatis, juga kalau backup gagal.
- Isi backup: volume `garage-meta`, `garage-data`, `control-data`, `caddy-data` (sertifikat TLS), `MANIFEST` (waktu dan versi), dan `SHA256SUMS`.
- `.env` **tidak** ikut karena berisi secret. Simpan terpisah di tempat aman, atau pakai `--with-env`. Restore ke server baru tetap jalan dengan `.env` baru; efeknya hanya semua sesi login harus masuk ulang.
- `restore.sh` memeriksa checksum dulu. Kalau ada arsip yang rusak, tidak ada data yang diubah. Kalau checksum cocok, isi volume dihapus dan diganti isi backup (minta konfirmasi, atau `--yes` untuk script).
- Salin folder backup ke luar server (mis. object storage lain atau disk terpisah). Backup yang hanya ada di server yang sama tidak melindungi dari kerusakan disk.

## Upgrade

1. Baca [CHANGELOG.md](CHANGELOG.md) untuk versi tujuan, terutama bagian yang breaking.
2. Backup: `./scripts/backup.sh`.
3. Ganti versi lalu jalankan:
   ```bash
   # di .env: CONTROL_IMAGE=ghcr.io/byhandi/storage-edge:<versi-baru>
   docker compose pull
   docker compose up -d
   ```
   Kalau deploy dari source: `git pull` lalu `docker compose up -d --build`.
4. Migrasi database jalan otomatis saat control-plane start. Pastikan semua service `healthy` di `docker compose ps`, dan cek `docker compose logs control` kalau tidak.

**Rollback:** migrasi tidak dibatalkan otomatis. Kembalikan `CONTROL_IMAGE` ke versi lama, lalu `./scripts/restore.sh <backup-sebelum-upgrade>`.

Caddy dan image lain dinaikkan lewat PR Dependabot bulanan. Garage sengaja dikecualikan: naikkan manual (ganti tag `dxflrs/garage` di `docker-compose.yml`) setelah membaca catatan rilis Garage dan membuat backup.

## Menjalankan di lokal

Butuh Docker. Port 80, 443, dan 8080 harus kosong.

```bash
./scripts/gen-env.sh --dev    # .env untuk lokal: BASE_DOMAIN=localhost, ikut memakai docker-compose.dev.yml
docker compose up -d --build
./scripts/init-dev.sh         # bucket "assets", key, sample/, akun admin, cdn.brandku.localhost
```

`--dev` menulis `COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml` ke `.env`, jadi semua perintah `docker compose` otomatis memakai override development: verifikasi DNS dimatikan, cookie tanpa `Secure`, sertifikat dari CA lokal Caddy, port debug (`3900`, `3903`, `8080`) di-bind ke `127.0.0.1`, dan ada service `awscli`.

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

`npm run build` menulis hasil build ke `control/internal/ui/dist/web`, yang di-embed ke binary Go. Image Docker selalu mem-build dashboard sendiri, jadi tidak perlu build manual sebelum `docker compose build`.

### Akun admin

Tidak ada halaman register. Akun dibuat dan di-reset lewat CLI di container:

```bash
docker compose exec control /control createuser --email kamu@contoh.com --name "Nama Kamu"
docker compose exec control /control setpassword --email kamu@contoh.com
```

Password ditanyakan secara interaktif (atau `--password-stdin` untuk script). `setpassword` juga mengakhiri semua sesi user itu.

## CI dan rilis

- **CI** (`.github/workflows/ci.yml`) jalan untuk setiap PR dan push ke `main`: gofmt, `go vet`, `go test -race`, govulncheck, typecheck/lint/Prettier/`npm audit` untuk web, shellcheck, validasi compose, dan build image amd64 + arm64.
- **Rilis** (`.github/workflows/release.yml`): ubah `[Unreleased]` di [CHANGELOG.md](CHANGELOG.md) jadi versi baru, lalu push tag:

  ```bash
  git tag v0.1.0
  git push origin v0.1.0
  ```

  Workflow menjalankan CI, mem-push image multi-arch ke `ghcr.io/byhandi/storage-edge` (tag `0.1.0`, `0.1`, dan `latest`), lalu membuat GitHub Release dari isi CHANGELOG. Tag dengan akhiran seperti `-rc.1` jadi pre-release dan tidak mengubah `latest`.
- **Dependabot** membuka paling banyak satu PR gabungan per ekosistem per bulan (Go, npm, Docker, Compose, GitHub Actions). CI juga jalan tiap Senin, jadi celah keamanan yang baru diumumkan tetap membuat govulncheck/npm audit gagal walau tidak ada commit baru.

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

Di lokal (`docker-compose.dev.yml`) verifikasi DNS dimatikan, jadi domain langsung `active`.

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
| `docker-compose.yml` | Production: Garage, control, Caddy |
| `docker-compose.dev.yml` | Override development: port debug, setting longgar, `awscli` (profile `tools`) |
| `garage/garage.toml.tmpl` | Template config Garage; `__BASE_DOMAIN__` diisi service `garage-config` |
| `caddy/Caddyfile` | Production (Let's Encrypt) |
| `caddy/Caddyfile.dev` | Development (`local_certs`) |
| `control/Dockerfile` | Multi-stage: build dashboard (Node), lalu binary Go dengan dashboard di-embed |
| `control/cmd/control` | Entry point: server, `createuser`, `setpassword`, `version`, `healthcheck` |
| `control/internal/service` | Logika bisnis: bucket, access key, custom domain, worker |
| `control/internal/auth` | Login, JWT, refresh token, rate limit, argon2id |
| `control/internal/garage` | Client admin API Garage v2 |
| `control/internal/dnscheck` | Cek CNAME/A + TXT |
| `control/internal/api` | Router chi: dashboard + `/api` (:8080) dan internal (:9000) |
| `control/internal/ui` | Serve dashboard yang di-embed (SPA fallback, CSP, cache aset) |
| `control/db` | Migrasi goose + query sqlc (`cd control/db && sqlc generate`) |
| `web/` | Dashboard: Vite + React + TanStack Router/Query + shadcn |
| `scripts/gen-env.sh` | Buat/lengkapi `.env` (`--dev` untuk lokal) |
| `scripts/init-dev.sh` | Setup development, aman dijalankan ulang |
| `scripts/backup.sh`, `scripts/restore.sh` | Backup dan restore semua data |
| `.github/workflows/` | CI dan release |
| `CHANGELOG.md` | Catatan perubahan per versi (dipakai sebagai catatan rilis) |

## Catatan production

- Semua domain diturunkan dari `BASE_DOMAIN`. `EDGE_HOSTNAME` dan `RESERVED_DOMAINS` bisa diganti di `.env` kalau perlu.
- Kalau ada proxy atau load balancer lain di depan Caddy, isi `TRUSTED_PROXIES` dengan alamatnya. Defaultnya loopback dan jaringan privat (tempat Caddy bawaan berada). IP client dipakai untuk rate limit login.
- Jangan pakai `scripts/init-dev.sh` atau `docker-compose.dev.yml` di production.
- Wildcard `*.s3.domainku.com` (virtual-hosted style) butuh DNS challenge, artinya Caddy perlu di-build dengan plugin DNS provider. Tanpa itu, S3 API hanya path-style.
- Port internal control-plane (9000) tidak boleh di-proxy ke publik.
- Mengaktifkan custom domain berarti website bucket dinyalakan, jadi isi bucket juga bisa dibaca publik lewat `<bucket>.web.<domain>`.
- Nama alias bucket maksimal 63 karakter, jadi domain yang lebih panjang dari itu belum bisa dipakai sebagai custom domain.
- `replication_factor = 1` berarti tanpa redundansi. Untuk data penting, pakai minimal 3 node.
