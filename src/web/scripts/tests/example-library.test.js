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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  exampleDesktopsOf,
  exampleFile,
  filterExamples,
  groupExamples,
  insertDocOf,
  parseLibraryIndex,
  upsertIndexEntry,
} from "../model/example-library.js";
import { designClipOf } from "../model/autobuild.js";
import { normalizeProject } from "../model/project-doc.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, "..", "..", "examples");

test("the index is cleaned: bad ids, untitled and duplicate entries are dropped", () => {
  const list = parseLibraryIndex({
    examples: [
      {
        id: "ok-1",
        title: " One ",
        description: "d",
        category: "Logic",
        parts: 4,
      },
      { id: "ok-1", title: "Duplicate" },
      { id: "../escape", title: "Traversal" },
      { id: "no title" },
      { id: "ok-2", title: "Two", parts: -3 },
      null,
    ],
  });
  assert.deepEqual(
    list.map((e) => [e.id, e.title, e.category, e.parts]),
    [
      ["ok-1", "One", "Logic", 4],
      ["ok-2", "Two", "Examples", null],
    ],
  );
  assert.deepEqual(parseLibraryIndex(null), []);
  assert.deepEqual(parseLibraryIndex({ examples: "nope" }), []);
  assert.equal(exampleFile("ok-1"), "examples/ok-1.chiphippo");
});

test("filtering matches every word anywhere; grouping sorts categories and titles", () => {
  const list = parseLibraryIndex({
    examples: [
      {
        id: "b",
        title: "Counter",
        description: "counts clock pulses",
        category: "Sequential",
      },
      {
        id: "a",
        title: "NAND gate",
        description: "two switches",
        category: "Logic",
      },
      { id: "c", title: "Adder", category: "Logic" },
    ],
  });
  assert.equal(filterExamples(list, "").length, 3);
  assert.deepEqual(
    filterExamples(list, "clock counter").map((e) => e.id),
    ["b"],
  );
  assert.deepEqual(
    filterExamples(list, "LOGIC").map((e) => e.id),
    ["a", "c"],
  );
  assert.equal(filterExamples(list, "nothing here").length, 0);
  assert.deepEqual(
    groupExamples(list).map((g) => [
      g.category,
      g.examples.map((e) => e.title),
    ]),
    [
      ["Logic", ["Adder", "NAND gate"]],
      ["Sequential", ["Counter"]],
    ],
  );
});

test("a project becomes desktops to add or one document to insert", () => {
  const project = {
    activeTab: "t2",
    tabs: [
      { id: "t1", name: "First", doc: { boards: [{ id: "bb1" }] } },
      {
        id: "t2",
        name: "Second",
        doc: { boards: [{ id: "bb2" }] },
        description: "own",
      },
    ],
  };
  const entry = { title: "Demo", description: "about" };
  assert.deepEqual(
    exampleDesktopsOf(entry, project).map((d) => [d.name, d.description]),
    [
      ["Demo — First", "about"],
      ["Demo — Second", "own"],
    ],
  );
  const single = exampleDesktopsOf(entry, { tabs: [project.tabs[0]] });
  assert.equal(single[0].name, "Demo");
  assert.equal(insertDocOf(project).boards[0].id, "bb2");
  assert.equal(
    insertDocOf({ tabs: [{ id: "t1", doc: { boards: [] } }] }),
    null,
  );
  assert.equal(insertDocOf(null), null);
});

test("upserting keeps the index sorted and replaces an entry with the same id", () => {
  let index = upsertIndexEntry({ examples: [] }, { id: "b", title: "B" });
  index = upsertIndexEntry(index, { id: "a", title: "A" });
  index = upsertIndexEntry(index, { id: "b", title: "B2", category: "X" });
  assert.deepEqual(
    index.examples.map((e) => [e.id, e.title, e.category]),
    [
      ["a", "A", "Examples"],
      ["b", "B2", "X"],
    ],
  );
  assert.throws(() => upsertIndexEntry(index, { id: "bad id", title: "x" }));
});

test("every shipped example is listed, loads as a project, and can be inserted", () => {
  const index = JSON.parse(
    readFileSync(join(examplesDir, "index.json"), "utf8"),
  );
  const list = parseLibraryIndex(index);
  assert.equal(list.length, index.examples.length, "no entry is rejected");
  assert.ok(list.length >= 1, "the library is not empty");
  for (const entry of list) {
    const file = join(examplesDir, `${entry.id}.chiphippo`);
    const project = normalizeProject(JSON.parse(readFileSync(file, "utf8")));
    assert.ok(project?.tabs?.length >= 1, `${entry.id} has a desktop`);
    assert.ok(exampleDesktopsOf(entry, project).length >= 1, entry.id);
    const doc = insertDocOf(project);
    assert.ok(doc, `${entry.id} has a desktop with boards`);
    assert.ok(designClipOf(doc), `${entry.id} makes a design clip`);
  }
});
