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

// Unit tests for model/selection-toggle.js — the pure half of the additive
// selection gesture. The platform branch is the reason this file exists: the
// app only ever runs one side of it, so nothing else can hold both.

import test from "node:test";
import assert from "node:assert/strict";

import {
  isLeadToggleEvent,
  isToggleSelectEvent,
  leadKey,
  parseLeadKey,
  singlePick,
  toggleSelection,
} from "../model/selection-toggle.js";

test("the chord is ⌘ on macOS and Ctrl everywhere else", () => {
  const cmd = { metaKey: true };
  const ctrl = { ctrlKey: true };

  assert.equal(isToggleSelectEvent(cmd, true), true);
  assert.equal(isToggleSelectEvent(ctrl, false), true);

  // Ctrl on a Mac is the SECONDARY CLICK — answering to it there would cost
  // the desk's context menus, since one press cannot both toggle the
  // selection and open a menu over the top of it.
  assert.equal(isToggleSelectEvent(ctrl, true), false);
  // And the Windows key is not an accelerator off a Mac.
  assert.equal(isToggleSelectEvent(cmd, false), false);
});

test("only the PRIMARY button — Ctrl+right-click stays a right-click", () => {
  assert.equal(isToggleSelectEvent({ ctrlKey: true, button: 0 }, false), true);
  assert.equal(isToggleSelectEvent({ ctrlKey: true, button: 2 }, false), false);
  assert.equal(isToggleSelectEvent({ metaKey: true, button: 2 }, true), false);
  assert.equal(isToggleSelectEvent({ metaKey: true, button: 1 }, true), false);
});

test("Option/Alt is excluded — pin-targeting mode, never additive; Shift changes nothing", () => {
  // The desk's modifiers do not combine: a press with Option down belongs to
  // pin-targeting mode. Shift is no modifier of the desk's at all.
  assert.equal(
    isToggleSelectEvent({ ctrlKey: true, altKey: true }, false),
    false,
  );
  assert.equal(
    isToggleSelectEvent({ metaKey: true, altKey: true }, true),
    false,
  );
  assert.equal(
    isToggleSelectEvent({ ctrlKey: true, shiftKey: true }, false),
    true,
  );
  assert.equal(
    isToggleSelectEvent({ metaKey: true, shiftKey: true }, true),
    true,
  );
});

test("a bare click, and a missing event, are not the chord", () => {
  assert.equal(isToggleSelectEvent({}, true), false);
  assert.equal(isToggleSelectEvent(null, false), false);
});

test("toggleSelection adds what is absent and removes what is present", () => {
  const empty = { parts: [], wires: [], boards: [] };

  const one = toggleSelection(empty, "parts", ["c1"]);
  assert.deepEqual(one, { parts: ["c1"], wires: [], boards: [], leads: [] });

  const two = toggleSelection(one, "parts", ["c2"]);
  assert.deepEqual(two.parts, ["c1", "c2"]);

  assert.deepEqual(toggleSelection(two, "parts", ["c1"]).parts, ["c2"]);
});

test("the other sets are carried through untouched", () => {
  const next = toggleSelection(
    { parts: ["c1"], wires: ["w1"], boards: ["bb1"], leads: ["lead:c2:a"] },
    "wires",
    ["w2"],
  );
  assert.deepEqual(next, {
    parts: ["c1"],
    wires: ["w1", "w2"],
    boards: ["bb1"],
    leads: ["lead:c2:a"],
  });
});

test("a set of ids toggles ALL-OR-NOTHING, so a partial group completes", () => {
  const kit = ["bb1", "bb2", "bb3"];
  // Every member present → the whole group leaves.
  assert.deepEqual(toggleSelection({ boards: kit }, "boards", kit).boards, []);
  // Only some present → the rest join, rather than the click half-clearing it.
  // That is an answer the NEXT click can undo; a half-clear is not.
  assert.deepEqual(toggleSelection({ boards: ["bb2"] }, "boards", kit).boards, [
    "bb2",
    "bb1",
    "bb3",
  ]);
});

test("an empty id list and an unknown kind change nothing", () => {
  const cur = { parts: ["c1"], wires: [], boards: [], leads: [] };
  assert.deepEqual(toggleSelection(cur, "parts", []), cur);
  assert.deepEqual(toggleSelection(cur, "annotations", ["a1"]), cur);
});

test("singlePick names the one item, and only when there is exactly one", () => {
  assert.deepEqual(singlePick({ parts: ["c1"], wires: [], boards: [] }), {
    kind: "part",
    id: "c1",
  });
  assert.deepEqual(singlePick({ parts: [], wires: ["w1"], boards: [] }), {
    kind: "wire",
    id: "w1",
  });
  assert.deepEqual(singlePick({ parts: [], wires: [], boards: ["bb1"] }), {
    kind: "board",
    id: "bb1",
  });
  assert.equal(singlePick({ parts: [], wires: [], boards: [] }), null);
  assert.equal(singlePick({ parts: ["c1"], wires: ["w1"], boards: [] }), null);
  assert.equal(singlePick({ parts: [], wires: [], boards: ["a", "b"] }), null);
});

test("the LEAD chord is Option/Alt plus ⌘ on macOS, plus Ctrl elsewhere", () => {
  assert.equal(isLeadToggleEvent({ altKey: true, metaKey: true }, true), true);
  assert.equal(isLeadToggleEvent({ altKey: true, ctrlKey: true }, false), true);
  // Ctrl on a Mac is the secondary click; ⌘ off one is nobody's chord.
  assert.equal(isLeadToggleEvent({ altKey: true, ctrlKey: true }, true), false);
  assert.equal(isLeadToggleEvent({ altKey: true, metaKey: true }, false), false); // prettier-ignore
  // Option/Alt alone is the REPLACING pick, never this one…
  assert.equal(isLeadToggleEvent({ altKey: true }, true), false);
  // …and ⌘/Ctrl alone is the object chord.
  assert.equal(isLeadToggleEvent({ metaKey: true }, true), false);
  // The primary button only; Shift changes nothing.
  assert.equal(isLeadToggleEvent({ altKey: true, metaKey: true, button: 2 }, true), false); // prettier-ignore
  assert.equal(isLeadToggleEvent({ altKey: true, metaKey: true, shiftKey: true, button: 0 }, true), true); // prettier-ignore
  // The two chords never both claim a press.
  assert.equal(isToggleSelectEvent({ altKey: true, metaKey: true }, true), false); // prettier-ignore
});

test("a lead round-trips through its key; anything else parses to null", () => {
  for (const pick of [
    { kind: "lead", id: "c4", end: "b" },
    { kind: "wire-end", id: "w12", end: "from" },
  ]) {
    assert.deepEqual(parseLeadKey(leadKey(pick)), pick);
  }
  for (const junk of ["", "part:c1:a", "lead:c1", "lead:c1:a:x", null]) {
    assert.equal(parseLeadKey(junk), null);
  }
});

test("leads toggle like any set, and ONE lead is the single lead pick", () => {
  const key = leadKey({ kind: "wire-end", id: "w1", end: "to" });
  const one = toggleSelection({}, "leads", [key]);
  assert.deepEqual(one.leads, [key]);
  assert.deepEqual(singlePick(one), { kind: "wire-end", id: "w1", end: "to" });
  const two = toggleSelection(one, "leads", ["lead:c2:a"]);
  assert.equal(singlePick(two), null);
  assert.deepEqual(toggleSelection(two, "leads", [key]).leads, ["lead:c2:a"]);
  // A lead beside a part is two things, not a single pick.
  assert.equal(singlePick({ ...one, parts: ["c1"] }), null);
});
