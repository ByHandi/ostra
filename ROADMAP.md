# Roadmap

Urutan kerja menuju rilis open source pertama, lalu pengembangan setelahnya.
Fase 1 dan 2 adalah syarat sebelum repo dibuka ke publik.

## Sudah selesai

### Fondasi: storage dan routing
- [x] Garage v2 single-node via Docker Compose (S3 API, web endpoint, admin API)
- [x] Caddy sebagai pintu depan: S3 API, dashboard, dan catch-all custom domain
- [x] On-demand TLS: sertifikat hanya diterbitkan untuk domain yang diizinkan control-plane
      (`/caddy/ask` di port internal yang tidak terekspos)
- [x] Custom domain per bucket lewat alias global Garage (Host header → bucket)
- [x] `<bucket>.web.<domain>` hanya dapat sertifikat kalau bucket ada dan website-nya aktif
- [x] `scripts/gen-env.sh` (secret acak, melengkapi key baru di `.env`) dan
      `scripts/init-dev.sh` (setup dev, aman dijalankan ulang)

### Control-plane (Go)
- [x] SQLite (modernc, tanpa CGO) dengan migrasi goose yang di-embed dan query sqlc
- [x] Siklus hidup custom domain: daftar → verifikasi DNS (CNAME/A + TXT) → pasang alias → aktif
- [x] Worker: cek domain pending tiap 30 detik, reconcile alias domain aktif tiap 5 menit
- [x] Validasi domain (format, batas 63 karakter, domain sistem yang dicadangkan)
- [x] Manajemen bucket: daftar dengan statistik, detail, buat, hapus (hanya kosong dan tanpa domain)
- [x] Manajemen access key: buat (secret ditampilkan sekali), hapus, izin read/write/owner per bucket
- [x] Overview: statistik storage, jumlah domain per status, kesehatan cluster Garage
- [x] Format respons API sama dengan template `shadcn-vite` / `go-service-boilerplate`,
      termasuk error per field

### Auth dan keamanan
- [x] Login admin dengan password argon2id; tanpa halaman register
- [x] Access token JWT 15 menit + refresh token 30 hari di cookie httpOnly, SameSite=Strict,
      dirotasi setiap dipakai (yang disimpan hanya hash-nya)
- [x] Ganti password mengakhiri semua sesi lain; logout mencabut refresh token
- [x] Rate limit login per IP
- [x] CLI `control createuser` dan `control setpassword`
- [x] Dashboard dilayani dengan CSP ketat, `X-Frame-Options`, `nosniff`; aset hash di-cache immutable
- [x] Image `scratch`, user non-root; port admin Garage dan debug hanya di-bind ke `127.0.0.1`

### Dashboard (React)
- [x] Berdasarkan template `shadcn-vite`; boneyard dicopot
- [x] Halaman: login, dashboard, buckets (+ detail), custom domains (+ detail dengan record DNS),
      access keys (+ editor izin per bucket), pengaturan (profil, ganti password, tema)
- [x] Skeleton manual per komponen (`BucketTable.Skeleton`, `StatCards.Skeleton`, dst.)
- [x] Polling otomatis selama ada domain pending
- [x] UI dalam Bahasa Indonesia, responsif sampai layar ponsel, mode terang dan gelap
- [x] Di-embed ke binary Go (`go:embed`), satu origin dengan API; `npm run dev` dengan proxy `/api`
- [x] Dockerfile multi-stage: build dashboard (Node), lalu binary Go

### Testing
- [x] Unit test Go: auth (sesi, rotasi, kedaluwarsa, rate limit), service (domain, bucket, key,
      reconcile), DNS checker, client Garage, router API, handler UI
- [x] Diuji end-to-end di stack lokal: login, buat bucket/domain/key, atur izin, upload dengan
      key baru lalu baca lewat custom domain, penolakan hapus bucket, logout

---

## Keputusan yang masih ditunggu

- [ ] **Lisensi** (MIT / Apache-2.0 / AGPL-3.0). Menahan: `LICENSE`, catatan lisensi di README.
- [x] **Nama repo GitHub**: `ByHandi/storage-edge`, image `ghcr.io/byhandi/storage-edge`.

---

## Fase 1: Aman untuk dibuka (wajib)

### 1.1 Default `.env` yang aman
Saat ini `.env.example` berisi `COOKIE_SECURE=false` dan `DNS_VERIFY=off`, sehingga deploy
yang mengikuti `gen-env.sh` langsung mendapat setting development.

- [x] `.env.example` tidak lagi berisi setting dev; default di kode sudah aman (`COOKIE_SECURE=true`, `DNS_VERIFY=on`)
- [x] Setting dev dipindah ke `docker-compose.dev.yml`, aktif lewat `COMPOSE_FILE` yang ditulis
      `scripts/gen-env.sh --dev`
- [x] Control-plane menolak start kalau `DNS_VERIFY=off` / `COOKIE_SECURE=false` dipakai
      bersama `EDGE_HOSTNAME` selain `.localhost`/`.test`

**Selesai kalau:** deploy production yang hanya mengikuti README tidak pernah berjalan dengan setting dev.

### 1.2 Lisensi
- [ ] Tambah `LICENSE` sesuai keputusan di atas
- [ ] Bagian lisensi di README, termasuk catatan bahwa Garage berlisensi AGPL-3.0 dan
      dipakai sebagai service terpisah lewat API (kode storage-edge tidak ikut terikat AGPL)
- [ ] Cek lisensi dependency (Go dan npm) kompatibel dengan lisensi yang dipilih

### 1.3 Config production tanpa edit file
Saat ini `garage/garage.toml` meng-hardcode `.localhost` dan compose default ke mode dev.

- [x] `garage/garage.toml.tmpl` + service `garage-config` (busybox) yang mengisi `BASE_DOMAIN`;
      semua domain lain diturunkan dari `BASE_DOMAIN`
- [x] Garage memakai `--single-node`, jadi layout cluster tidak perlu disiapkan manual
- [x] `docker-compose.yml` sekarang versi production (Caddyfile production, tanpa port debug,
      tanpa `awscli`); development lewat `docker-compose.dev.yml`
- [x] Panduan deploy production di README: DNS yang perlu dipasang (`console`, `s3`, `edge`,
      wildcard `*.web`), isi `.env`, membuat admin pertama

**Selesai kalau:** deploy production cukup dengan mengisi `.env` dan menjalankan satu perintah compose.

### 1.4 Trusted proxy untuk IP client
Rate limit login memakai `X-Forwarded-For` dengan asumsi request selalu lewat Caddy bawaan.
Di belakang proxy lain, header ini bisa dipalsukan sehingga rate limit bisa dibobol.

- [x] Env `TRUSTED_PROXIES` (daftar CIDR). `X-Forwarded-For` hanya dibaca kalau request
      datang dari IP di daftar itu, ditelusuri dari kanan; selain itu pakai alamat koneksi
- [x] Default: loopback + jaringan privat (tempat Caddy bawaan di jaringan Docker)
- [x] Test untuk header palsu dari IP yang tidak dipercaya, plus diuji langsung lewat Caddy

### 1.5 Kerentanan dependency
- [x] `control/go.mod`: `go 1.26.9` (4 CVE `net/http` di 1.26.5)
- [x] `web/package.json`: `shadcn` (CLI) dipindah ke `devDependencies`, lalu `npm audit fix`
      (temuan high `@modelcontextprotocol/sdk` dan `brace-expansion` sudah hilang)
- [x] `govulncheck ./...` tanpa temuan yang terpanggil kode; `npm audit --omit=dev` bersih
- Sisa yang diketahui: `golang.org/x/crypto` GO-2026-5932 (level modul, belum ada perbaikan,
  tidak dipanggil kode) dan `braces` lewat CLI `shadcn` (dev saja, tidak masuk bundle;
  perbaikannya butuh `npm audit fix --force`). Pantau di Fase 2 lewat Dependabot.

---

## Fase 2: CI/CD dan distribusi

- [x] GitHub Actions untuk PR (`.github/workflows/ci.yml`), plus shellcheck dan validasi compose:
  - Go: `gofmt`, `go vet`, `go test`, `govulncheck`
  - Web: `typecheck`, `lint`, `prettier --check`, `npm audit --omit=dev`
  - `docker build` (tanpa push) untuk memastikan image tetap bisa dibangun
- [x] Release: tag `v*` → CI → build image multi-arch (`linux/amd64`, `linux/arm64`, cross-compile
      tanpa QEMU) → push ke GHCR dengan provenance + SBOM → GitHub Release dari CHANGELOG
- [x] Compose production memakai image dari GHCR (`CONTROL_IMAGE` untuk pin versi); dev tetap build lokal
- [x] Dependabot untuk Go modules, npm, image Docker (Dockerfile + compose), dan GitHub Actions
- [x] `CHANGELOG.md`, `control version`, `/api/version`, dan versi di halaman Pengaturan
- [ ] Rilis pertama `v0.1.0` (setelah lisensi diputuskan), lalu pastikan package GHCR berstatus Public

---

## Fase 3: Operasional

- [ ] Subcommand `control healthcheck` + `healthcheck` di compose (image `scratch` tidak punya curl)
- [ ] Panduan backup dan restore: volume `garage-meta`, `garage-data`, dan `control.db`
      (pakai `sqlite3 .backup` atau snapshot volume saat service berhenti)
- [ ] Panduan upgrade antar versi (migrasi berjalan otomatis saat start)
- [ ] `SECURITY.md`: cara melaporkan celah keamanan
- [ ] README dalam bahasa Inggris (versi Indonesia tetap ada)
- [ ] `CONTRIBUTING.md`: cara menjalankan dev, test, dan konvensi kode

---

## Fase 4: Target deploy lain

- [ ] Panduan untuk Coolify / Dokploy (host Docker dengan port 80/443 sendiri)
- [ ] Opsi Postgres untuk control-plane (sqlc sudah siap; perlu migrasi dan driver pgx),
      supaya bisa lebih dari 1 replica
- [ ] Manifest Kubernetes / Helm chart (Garage, control-plane, Caddy atau ingress dengan
      on-demand TLS)
- [ ] Catatan keterbatasan PaaS (Railway, Render, Fly): custom domain dengan TLS otomatis
      butuh akses langsung ke port 443

---

## Ide fitur (belum dijadwalkan)

- Browser objek di dashboard: lihat, upload, hapus file
- Quota per bucket (sudah didukung admin API Garage)
- Verifikasi ulang berkala untuk domain aktif (deteksi DNS yang sudah dicabut)
- Wildcard virtual-hosted S3 (`*.s3.domain`) lewat Caddy dengan plugin DNS challenge
- Multi-user dengan role (admin / read-only) dan audit log
- Cache di depan custom domain (Caddy cache atau CDN eksternal)
- Garage multi-node: panduan cluster 3 node dan `replication_factor = 3`
