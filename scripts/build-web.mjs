/*
 * Copyright 2026 Jason Figge
 * SPDX-License-Identifier: GPL-3.0-or-later
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
const manifest = {};
for (const entry of entries) {
  const contents = await readFile(join(source, entry));
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
