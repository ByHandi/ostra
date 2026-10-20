# Changelog

Semua perubahan penting dicatat di sini. Format mengikuti
[Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), dan versi mengikuti
[Semantic Versioning](https://semver.org/lang/id/).

Saat rilis, ganti `[Unreleased]` dengan `[X.Y.Z] - YYYY-MM-DD` lalu push tag `vX.Y.Z`.
Workflow release memakai isi bagian versi itu sebagai catatan GitHub Release.

## [Unreleased]

### Added
- Object storage self-hosted berbasis Garage v2 (single-node), dengan Caddy sebagai pintu depan.
- Custom domain per bucket dengan TLS otomatis (on-demand, hanya untuk domain yang diizinkan).
- Verifikasi kepemilikan domain lewat DNS (CNAME/A ke edge + TXT), dicek ulang otomatis.
- Dashboard admin: overview, bucket, custom domain, access key dengan izin per bucket, pengaturan akun.
- Login admin dengan access token JWT + refresh token berotasi di cookie httpOnly, rate limit login.
- CLI `control createuser`, `control setpassword`, dan `control version`.
- Endpoint `/api/version` dan info versi di halaman Pengaturan.
- Konfigurasi production lewat satu variabel `BASE_DOMAIN`; override development di
  `docker-compose.dev.yml`.
- `TRUSTED_PROXIES` untuk menentukan IP client di belakang proxy.
- CI (Go, web, shell script, image Docker), release image multi-arch ke GHCR, Dependabot.
- Healthcheck untuk semua service (`control healthcheck`, `/healthz` ikut mengecek database);
  service menunggu dependensinya `healthy` sebelum start.
- `scripts/backup.sh` dan `scripts/restore.sh` (cold backup dengan checksum).
- README bahasa Inggris, `SECURITY.md`, dan `CONTRIBUTING.md`.

### Security
- Control-plane menolak start kalau setting development (`DNS_VERIFY=off`,
  `COOKIE_SECURE=false`) dipakai dengan domain selain `.localhost`/`.test`.
