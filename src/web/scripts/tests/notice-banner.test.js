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

// jsdom tests for the what's-new bar (components/notice-banner.js): it shows the
// owed notices one at a time, its ✕ reports the id and moves on, and it
// relabels in place when the language changes.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resetDom } from "./jsdom-setup.js";
import { applyCatalog } from "../i18n.js";

const { NoticeBanner } = await import("../components/notice-banner.js");

const DRAG = { id: "drag-model-2026-10", key: "dragModel" };

function mount(notices = [DRAG]) {
  resetDom();
  const main = document.createElement("div");
  document.body.append(main);
  const closed = [];
  const banner = new NoticeBanner(document.body, {
    notices,
    before: main,
    onDismiss: (id) => closed.push(id),
  });
  return { banner, main, closed };
}

const click = (node) =>
  node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

test("the bar goes in ahead of the main row, with every line of its notice", () => {
  const { banner, main } = mount();
  assert.equal(banner.element.nextSibling, main);
  assert.equal(
    banner.element.querySelector(".notice-banner-title").textContent,
    "Dragging has changed",
  );
  assert.equal(banner.element.getAttribute("aria-label"), "Dragging has changed"); // prettier-ignore
  const lines = [...banner.element.querySelectorAll("li")].map((li) => li.textContent); // prettier-ignore
  assert.equal(lines.length, 6);
  for (const line of lines) {
    assert.doesNotMatch(
      line,
      /notice\.|\{/,
      "every line resolved, keys filled",
    );
  }
  // The modifiers are the platform's (not a Mac under jsdom).
  assert.ok(lines.some((l) => l.startsWith("Alt+")));
  assert.ok(lines.some((l) => l.startsWith("Ctrl+")));
  assert.ok(lines.some((l) => l.startsWith("Shift+")));
});

test("✕ reports the notice closed and takes the bar away", () => {
  const { banner, closed } = mount();
  click(banner.element.querySelector(".notice-banner-close"));
  assert.deepEqual(closed, ["drag-model-2026-10"]);
  assert.equal(banner.showing, false);
  assert.equal(document.querySelector(".notice-banner"), null);
});

test("with two owed, closing the first shows the second", () => {
  const { banner, closed } = mount([DRAG, { id: "two", key: "dragModel" }]);
  click(banner.element.querySelector(".notice-banner-close"));
  assert.deepEqual(closed, ["drag-model-2026-10"]);
  assert.equal(banner.showing, true);
  assert.ok(document.querySelector(".notice-banner"));
  click(banner.element.querySelector(".notice-banner-close"));
  assert.deepEqual(closed, ["drag-model-2026-10", "two"]);
  assert.equal(document.querySelector(".notice-banner"), null);
});

test("a language change relabels the bar in place", () => {
  const { banner } = mount();
  const de = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "locales", "de.json"), // prettier-ignore
      "utf8",
    ),
  );
  applyCatalog({ active: "de", lang: "de", messages: de, fallback: de, locales: [] }); // prettier-ignore
  banner.relocalize();
  assert.equal(
    banner.element.querySelector(".notice-banner-title").textContent,
    de.notice.dragModel.title,
  );
  assert.equal(
    banner.element.querySelector(".notice-banner-close").getAttribute("aria-label"), // prettier-ignore
    de.common.close,
  );
});
