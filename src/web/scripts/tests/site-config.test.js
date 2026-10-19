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

import assert from "node:assert/strict";
import test from "node:test";
import { parseOrigins, siteOrigins } from "../site-config.js";

test("parseOrigins keeps only well-formed http(s) origins, trimmed", () => {
  assert.deepEqual(
    parseOrigins(
      " https://a.example/ , http://localhost:8080,ftp://x.example,not a url,https://b.example/path",
    ),
    ["https://a.example", "http://localhost:8080"],
  );
  assert.deepEqual(parseOrigins(undefined), []);
  assert.deepEqual(parseOrigins(""), []);
});

test("siteOrigins reads the build's meta tag and defaults to none", () => {
  assert.deepEqual(siteOrigins(null), []);
  const documentRef = {
    querySelector: (selector) =>
      selector === 'meta[name="chiphippo-site-origins"]'
        ? { getAttribute: () => "https://a.example,https://b.example" }
        : null,
  };
  assert.deepEqual(siteOrigins(documentRef), [
    "https://a.example",
    "https://b.example",
  ]);
  assert.deepEqual(siteOrigins({ querySelector: () => null }), []);
});
