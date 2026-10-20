# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub instead: go to the repository's **Security** tab and choose
**Report a vulnerability** (<https://github.com/ByHandi/storage-edge/security/advisories/new>).

Include as much of the following as you can:

- the affected component (control-plane API, dashboard, Docker/Caddy configuration, scripts),
- the version (`docker compose exec control /control version`, or the commit),
- steps to reproduce, or a proof of concept,
- the impact you expect (data exposure, account takeover, denial of service, …).

We aim to acknowledge reports within 7 days and to keep you updated until a fix is released.
Once fixed, the issue is disclosed in a GitHub Security Advisory and in [CHANGELOG.md](CHANGELOG.md)
under **Security**, with credit to the reporter unless you prefer to stay anonymous.

## Supported versions

Only the latest release receives security fixes. Upgrading is described in the
[README](README.md#upgrading).

## Scope

In scope: everything in this repository, including the default `docker-compose.yml`, the Caddy
configuration, and the scripts.

Out of scope, please report upstream:

- vulnerabilities in [Garage](https://git.deuxfleurs.fr/Deuxfleurs/garage) or
  [Caddy](https://github.com/caddyserver/caddy) themselves,
- setups that use `docker-compose.dev.yml` or `scripts/init-dev.sh` outside local development
  (they intentionally relax security and are refused for non-local domains).

## Hardening notes for operators

- Keep `.env` private (it holds the Garage RPC secret, the Garage admin token, and the JWT signing key).
- Never publish the Garage admin port (3903) or the control-plane internal port (9000).
- Set `TRUSTED_PROXIES` correctly if another proxy sits in front of Caddy; otherwise login rate
  limiting may see the proxy instead of the client.
- Back up regularly and store backups off the server (see [README](README.md#backup-and-restore)).
