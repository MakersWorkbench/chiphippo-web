/*
 * Copyright 2026 Jason Figge
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { createChipHippoServer } from "../chiphippo-server.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const webRoot = join(here, "..", "..", "src", "web");
let server;
let origin;

before(async () => {
  server = createChipHippoServer({ webRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("server exposes health but no project save API", async () => {
  const health = await fetch(`${origin}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, writable: false });

  const save = await fetch(`${origin}/api/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: { version: 5 } }),
  });
  assert.equal(save.status, 404);
});

test("serves app and embed shells with different frame policies", async () => {
  const app = await fetch(`${origin}/app/`);
  assert.equal(app.status, 200);
  assert.match(
    app.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );

  const embed = await fetch(`${origin}/embed/74ls00-intro`);
  assert.equal(embed.status, 200);
  assert.match(
    embed.headers.get("content-security-policy"),
    /frame-ancestors https:\/\/themakersworkbench\.com/,
  );
  assert.match(
    embed.headers.get("content-security-policy"),
    /connect-src 'self' https:\/\/themakersworkbench\.com/,
  );

  const head = await fetch(`${origin}/app/`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal((await fetch(`${origin}/app/missing.js`)).status, 404);
});
