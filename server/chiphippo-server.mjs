/*
 * Copyright 2026 Jason Figge
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".chiphippo": "application/json; charset=utf-8",
});

// CHIPHIPPO_SITE_ORIGINS: comma-separated origins of the host websites that may
// frame /embed/* pages and that the app may contact (Save to site). Unset means
// no outside site: embeds cannot be framed and nothing external is reachable.
// Use the same value the app was built with (scripts/build-web.mjs).
const siteOrigins = () =>
  (process.env.CHIPHIPPO_SITE_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(origin));

const securityHeaders = (embedded) => {
  const sites = siteOrigins();
  return {
    "content-security-policy": [
      "default-src 'self'",
      "base-uri 'none'",
      `connect-src ${["'self'", ...sites].join(" ")}`,
      "font-src 'self' data:",
      "form-action 'none'",
      `frame-ancestors ${embedded && sites.length ? sites.join(" ") : "'none'"}`,
      "img-src 'self' data: blob:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "worker-src 'self' blob:",
    ].join("; "),
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=(), geolocation=(), microphone=()",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
  };
};

function sendJson(response, status, value, headers = {}) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    ...headers,
  });
  response.end(body);
}

function isShellRoute(pathname) {
  return (
    pathname === "/" ||
    /^\/app\/?$/.test(pathname) ||
    /^\/p\/[A-Za-z0-9_-]{1,64}\/?$/.test(pathname) ||
    /^\/embed\/(?:project\/)?[A-Za-z0-9_-]{1,64}\/?$/.test(pathname)
  );
}

function fileFor(webRoot, pathname) {
  const relative = pathname.startsWith("/app/")
    ? pathname.slice("/app/".length)
    : pathname.slice(1);
  const candidate = normalize(join(webRoot, relative));
  const root = normalize(webRoot + sep);
  return candidate.startsWith(root) ? candidate : null;
}

export function createChipHippoServer({ webRoot }) {
  if (!webRoot) throw new Error("webRoot is required");

  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const embedded = url.pathname.startsWith("/embed/");
    const headers = securityHeaders(embedded);

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 404, { error: "Not found" }, headers);
      return;
    }

    if (url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, writable: false }, headers);
      return;
    }

    const shell = isShellRoute(url.pathname);
    const target = shell
      ? join(webRoot, "index.html")
      : fileFor(webRoot, url.pathname);
    if (!target) {
      sendJson(response, 404, { error: "Not found" }, headers);
      return;
    }

    let stats;
    try {
      stats = statSync(target);
    } catch {
      sendJson(response, 404, { error: "Not found" }, headers);
      return;
    }
    if (!stats.isFile()) {
      sendJson(response, 404, { error: "Not found" }, headers);
      return;
    }

    const fingerprinted = /\.[0-9a-f]{12}\.[^.]+$/i.test(target);
    response.writeHead(200, {
      ...headers,
      "content-type":
        MIME[extname(target).toLowerCase()] ?? "application/octet-stream",
      "content-length": stats.size,
      "cache-control": fingerprinted
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(target).pipe(response);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const webRoot =
    process.env.CHIPHIPPO_WEB_ROOT ??
    join(fileURLToPath(new URL("..", import.meta.url)), "src", "web");
  const port = Number(process.env.PORT || 4173);
  createChipHippoServer({ webRoot }).listen(port, "127.0.0.1", () => {
    console.log(`Chip Hippo web server listening on http://127.0.0.1:${port}`);
  });
}
