# Oracle ARM deployment

The Node service is dependency-free and runs on ARM64. Simulation stays in each
visitor's browser; the service is read-only and stores no user projects. The
examples use `breadboardlab.themakersworkbench.com`. Replace that
name in the environment and Nginx files if the final DNS name differs.

## One-time host setup

1. Point the subdomain's `A`/`AAAA` records at the Oracle instance. In the
   Oracle VCN security list and the host firewall, expose only TCP 22, 80, and 443. Port 4173 remains bound to localhost.
2. Install Node.js 20 or newer, Nginx, Certbot, Git, and rsync from the OS
   packages or NodeSource's ARM64 repository.
3. Create a locked service account and release directory:

   ```sh
   sudo useradd --system --no-create-home --shell /usr/sbin/nologin chiphippo
   sudo install -d -o chiphippo -g chiphippo /opt/chiphippo/releases
   sudo install -d -m 0750 /etc/chiphippo
   ```

4. In the release checkout run `cd src && npm ci && npm run web:build`. Place
   the checkout at `/opt/chiphippo/releases/<tag>` and point
   `/opt/chiphippo/current` at it. Copy `deploy/chiphippo.env.example` to
   `/etc/chiphippo/chiphippo.env`, then install the systemd and Nginx files.
5. Obtain the certificate before enabling the TLS virtual host:

   ```sh
   sudo certbot certonly --nginx -d breadboardlab.themakersworkbench.com
   sudo systemctl daemon-reload
   sudo systemctl enable --now chiphippo nginx
   ```

Verify `/api/health`, `/app/`, one `/embed/...` URL, a Drupal Media Library
project embed, and the browser console before switching article embeds.

## Release and rollback

Deploy immutable tagged directories. Run the test suite before changing the
symlink, then restart and health-check:

```sh
sudo ln -sfn /opt/chiphippo/releases/tmwb-web-v0.1.0 /opt/chiphippo/current
sudo systemctl restart chiphippo
curl --fail https://breadboardlab.themakersworkbench.com/api/health
```

Rollback points `current` to the previous tag and restarts the service. Curated
project files stay in Drupal Media Library, independently of this release.

## Backup and monitoring

Use the existing Drupal Media Library backup policy for curated `.chiphippo`
files. Monitor the systemd unit, Nginx 5xx responses, disk usage, certificate
renewal, and `/api/health`. The lab service has no project-write endpoint.

## GPL source release

Tag the exact deployed commit, publish that tag and its complete build/deploy
scripts, and keep the in-app Source Code link pointed at the matching public
repository. Preserve `LICENSE`, `NOTICE`, history, and upstream attribution.
