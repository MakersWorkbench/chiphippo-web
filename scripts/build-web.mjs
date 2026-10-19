/*
 * Copyright 2026 Charles Gantt
 *
 * This file is part of Chip Hippo.
 *
 * Chip Hippo is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * Chip Hippo is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Chip Hippo. If not, see <https://www.gnu.org/licenses/>.
 */

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(repoRoot, "src", "web");
const output = join(repoRoot, "dist", "web");
const entries = [
  "chiphippo-icon.svg",
  "styles/theme.css",
  "styles/app.css",
  "scripts/platform/browser-bootstrap.js",
  "scripts/app.js",
  "scripts/embed-mode.js",
  "scripts/web-chrome.js",
];

await rm(output, { force: true, recursive: true });
await mkdir(dirname(output), { recursive: true });
await cp(source, output, { recursive: true });
await rm(join(output, "scripts", "tests"), { force: true, recursive: true });

let html = await readFile(join(output, "index.html"), "utf8");
// CHIPHIPPO_SITE_ORIGINS: comma-separated origins of the host websites this
// build works with (they may embed it, supply project files, and receive saved
// circuits). Unset builds a standalone workbench that trusts no outside site.
// The server must be started with the same value (server/chiphippo-server.mjs).
const SITE_ORIGINS = (process.env.CHIPHIPPO_SITE_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter((origin) => /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(origin));
if (SITE_ORIGINS.length) {
  // The desktop app's CSP forbids all network access, so only the BUILT page
  // may reach the host sites (for Save to site). The server's CSP header is the
  // stricter gate in production.
  if (!html.includes("base-uri    'none';")) {
    throw new Error("index.html CSP changed; update build-web.mjs");
  }
  html = html.replace(
    "base-uri    'none';",
    `base-uri    'none';\n        connect-src 'self' ${SITE_ORIGINS.join(" ")};`,
  );
  html = html.replace(
    "</head>",
    `    <meta name="chiphippo-site-origins" content="${SITE_ORIGINS.join(",")}" />\n  </head>`,
  );
}
const manifest = {};
for (const entry of entries) {
  let contents = await readFile(join(source, entry));
  // embed-mode.js and web-chrome.js import app.js for its `booted` promise.
  // Point that import at the fingerprinted copy (app.js is listed first), or
  // the browser loads app.js a second time under its plain name and the whole
  // application initializes twice (two toolbars). Done BEFORE the digest so the
  // rewritten file gets a new name and no stale cached copy can be reused.
  if (manifest["scripts/app.js"] && entry !== "scripts/app.js") {
    const appFile = manifest["scripts/app.js"].split("/").pop();
    contents = Buffer.from(
      contents.toString("utf8").replace('"./app.js"', `"./${appFile}"`),
    );
  }
  const digest = createHash("sha256")
    .update(contents)
    .digest("hex")
    .slice(0, 12);
  const extension = extname(entry);
  const fingerprinted = `${entry.slice(0, -extension.length)}.${digest}${extension}`;
  await writeFile(join(output, fingerprinted), contents);
  html = html.replaceAll(`/app/${entry}`, `/app/${fingerprinted}`);
  manifest[entry] = fingerprinted;
}
await writeFile(join(output, "index.html"), html);
await writeFile(
  join(output, "asset-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(
  `Built ${Object.keys(manifest).length} fingerprinted entries in ${output}`,
);
