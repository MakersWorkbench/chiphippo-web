/*
 * Copyright 2026 Jason Figge
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

// Unit tests for model/notices.js — who the what's-new banner is owed to. The
// decision is whether someone used an earlier version, which nothing else can
// exercise without installing an old build first.

import test from "node:test";
import assert from "node:assert/strict";

import {
  LEGACY_VERSION,
  NOTICES,
  compareVersions,
  pendingNotices,
} from "../model/notices.js";

const DRAG = "drag-model-2026-10";
const ids = (notices) => notices.map((n) => n.id);

test("versions order numerically, and anything unparsable is oldest", () => {
  assert.ok(compareVersions("1.4.2", "1.4.3") < 0);
  assert.ok(compareVersions("1.10.0", "1.9.9") > 0, "numbers, not strings");
  assert.equal(compareVersions("1.5.0", "1.5.0"), 0);
  assert.equal(compareVersions("1.5.0-beta.1", "1.5.0"), 0, "a beta has it");
  assert.ok(compareVersions(LEGACY_VERSION, "0.0.1") < 0);
  assert.ok(compareVersions("0.0.1", LEGACY_VERSION) > 0);
  assert.equal(compareVersions(LEGACY_VERSION, "junk"), 0);
});

test("every notice has a unique id, a catalog key and a version", () => {
  assert.equal(new Set(ids(NOTICES)).size, NOTICES.length);
  for (const n of NOTICES) {
    assert.match(n.key, /^[a-z][A-Za-z]*$/);
    assert.match(n.since, /^\d+\.\d+\.\d+$/);
  }
});

test("an install from before the stamp is owed the drag-model notice", () => {
  assert.deepEqual(ids(pendingNotices({ firstRunVersion: LEGACY_VERSION })), [DRAG]); // prettier-ignore
  // 1.4.2 is the last release with the old model.
  assert.deepEqual(ids(pendingNotices({ firstRunVersion: "1.4.2" })), [DRAG]);
});

test("a fresh install of the new model is owed nothing", () => {
  assert.deepEqual(pendingNotices({ firstRunVersion: "1.4.3" }), []);
  assert.deepEqual(pendingNotices({ firstRunVersion: "1.5.0" }), []);
});

test("no stamp is no evidence, so nothing is shown", () => {
  assert.deepEqual(pendingNotices({ firstRunVersion: null }), []);
  assert.deepEqual(pendingNotices({}), []);
  assert.deepEqual(pendingNotices(null), []);
});

test("a closed notice stays closed, and only that one", () => {
  const later = { id: "later", key: "later", since: "2.0.0" };
  const all = [...NOTICES, later];
  const settings = { firstRunVersion: LEGACY_VERSION, dismissedNotices: [DRAG] }; // prettier-ignore
  assert.deepEqual(ids(pendingNotices(settings)), []);
  // A later version brings something back by shipping a NEW id.
  assert.deepEqual(ids(pendingNotices(settings, all)), ["later"]);
  // A junk dismissal list is no list.
  assert.deepEqual(
    ids(pendingNotices({ firstRunVersion: LEGACY_VERSION, dismissedNotices: "x" })), // prettier-ignore
    [DRAG],
  );
});
