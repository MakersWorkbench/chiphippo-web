# Deploying Chip Hippo Web

The web edition is a fingerprinted static tree plus a small dependency-free,
read-only Node server (`server/chiphippo-server.mjs`). Simulation runs in each
visitor's browser, so the server needs very little CPU, and it stores no user
projects. It runs on a small ARM64 or x86 host. The names below
(`lab.example.com`, `www.example.com`) are placeholders.

## Choose which sites it works with

By default a build is a **standalone workbench**: no outside website may embed it,
supply project files to it, or receive saved circuits, and the **Save to site**
button is hidden. To work with your own website, set `CHIPHIPPO_SITE_ORIGINS`
to a comma-separated list of its origins, **identically at build time and when
starting the server**:

```sh
export CHIPHIPPO_SITE_ORIGINS=https://www.example.com,https://staging.example.com
cd src && npm ci && npm run web:build
CHIPHIPPO_SITE_ORIGINS=$CHIPHIPPO_SITE_ORIGINS node ../server/chiphippo-server.mjs
```

The build bakes the list into the page (a `<meta name="chiphippo-site-origins">`
and the page's connection policy). The server uses it for `frame-ancestors` on
`/embed/*` and for `connect-src`. The first origin is the one **Save to site**
proposes. If you run the server in a container or service, pass the variable there.

## Serve it

Run the server (it listens on `127.0.0.1:${PORT:-4173}`; set `CHIPHIPPO_WEB_ROOT`
to the built `dist/web`) behind a TLS-terminating reverse proxy.

- **Caddy** (certificates are automatic):

  ```
  lab.example.com {
      encode gzip
      reverse_proxy 127.0.0.1:4173
  }
  ```
- **Nginx**: see `nginx/chiphippo.conf`, plus `systemd/chiphippo.service` and
  `chiphippo.env.example` if you run the server as a systemd service.
- **Docker**: any Node 20+ image works, for example
  `docker run -d --restart unless-stopped --network host --read-only --cap-drop ALL \
  -e PORT=4173 -e CHIPHIPPO_WEB_ROOT=/app/dist/web -e CHIPHIPPO_SITE_ORIGINS=... \
  -v /opt/chiphippo/current:/app:ro -w /app node:22-slim node server/chiphippo-server.mjs`.

Point your DNS at the host. If the DNS provider can proxy, use "DNS only" until
the certificate is issued.

## Releases and rollback

Unpack each build into its own directory (`/opt/chiphippo/releases/<tag>`) and
point `/opt/chiphippo/current` at it. Rolling back is re-pointing the link and
restarting the server. Verify `/api/health`, `/app/`, one `/embed/...` URL and the
browser console after every release.

## Backups and monitoring

Watch the service, proxy 5xx responses, disk usage, certificate renewal and
`/api/health`. The lab has no write endpoint; circuit files you save to a Drupal
site live in that site's Media Library and follow its backups.

## GPL source release

Tag the exact deployed commit, publish that tag and these deployment notes, and
keep the in-app Source link pointed at the matching public repository. Preserve
`LICENSE`, `NOTICE`, history and upstream attribution.
