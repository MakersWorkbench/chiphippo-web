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

// example-library.js — the Example Library's pure half. The library is a folder
// of ordinary .chiphippo projects (src/web/examples/<id>.chiphippo) beside an
// index.json that says what each one is. This module reads the index, filters
// and groups it for the browser dialog, and turns a loaded project into what
// the desk can take: desktops to ADD as tabs, or one desktop's document to
// INSERT into the desk that is open.
//
//   { "version": 1, "examples": [
//       { "id": "How-Voltage-Works-5V-Signal", "title": "A 5 V signal",
//         "description": "…", "category": "Logic gates", "parts": 11 } ] }
//
// There is no `file` field on purpose: a project's path is DERIVED from its id,
// so an index can never point a fetch anywhere but the examples folder.

/** What an example id may be — also its file name, so it must be path-safe. */
export const EXAMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9.-]{0,90}$/;

export const INDEX_VERSION = 1;
export const DEFAULT_CATEGORY = "Examples";

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 600;
const MAX_CATEGORY = 60;

const text = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** The path of an example's project, from its id alone. */
export function exampleFile(id) {
  return `examples/${id}.chiphippo`;
}

/**
 * The index's entries, cleaned: an entry with a bad id or no title is dropped,
 * duplicates keep the first, and everything is length-capped. Never throws — a
 * damaged index is an empty library, not a broken app.
 * @param {unknown} raw - the parsed index.json
 * @returns {{id:string, title:string, description:string, category:string, parts:number|null}[]}
 */
export function parseLibraryIndex(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.examples)) {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const entry of raw.examples) {
    const id = typeof entry?.id === "string" ? entry.id : "";
    const title = text(entry?.title, MAX_TITLE);
    if (!EXAMPLE_ID.test(id) || !title || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title,
      description: text(entry?.description, MAX_DESCRIPTION),
      category: text(entry?.category, MAX_CATEGORY) || DEFAULT_CATEGORY,
      parts: Number.isInteger(entry?.parts) && entry.parts >= 0 ? entry.parts : null, // prettier-ignore
    });
  }
  return out;
}

/** Entries whose title, description or category holds every word of `query`. */
export function filterExamples(examples, query) {
  const words = String(query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return examples;
  return examples.filter((example) => {
    const haystack =
      `${example.title} ${example.description} ${example.category}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Entries grouped by category, categories and titles in alphabetical order. */
export function groupExamples(examples) {
  const groups = new Map();
  for (const example of examples) {
    if (!groups.has(example.category)) groups.set(example.category, []);
    groups.get(example.category).push(example);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, list]) => ({
      category,
      examples: [...list].sort((a, b) => a.title.localeCompare(b.title)),
    }));
}

/**
 * The desktops an example adds when it is opened. A one-desktop project is
 * named for the example; a several-desktop one names each `<title> — <tab>`.
 * The tab name is its identity on the strip (asking again switches to it), so
 * it is built here and never translated.
 * @param {{title:string, description:string}} entry
 * @param {object|null} project - the loaded .chiphippo
 * @returns {{name:string, description:string, doc:object}[]}
 */
export function exampleDesktopsOf(entry, project) {
  const tabs = Array.isArray(project?.tabs)
    ? project.tabs.filter((tab) => tab?.doc)
    : [];
  return tabs.map((tab, index) => ({
    name:
      tabs.length === 1
        ? entry.title
        : `${entry.title} — ${text(tab.name, 40) || index + 1}`,
    description: text(tab.description, MAX_DESCRIPTION) || entry.description,
    doc: tab.doc,
  }));
}

/**
 * The document to INSERT into the open desk: the project's active desktop (or
 * its first). Null when the project has no desktop with boards in it.
 */
export function insertDocOf(project) {
  const tabs = Array.isArray(project?.tabs) ? project.tabs : [];
  const tab = tabs.find((t) => t?.id === project?.activeTab) ?? tabs[0];
  return tab?.doc?.boards?.length ? tab.doc : null;
}

/**
 * Put an entry into an index (replacing the one with its id), keeping the list
 * sorted by id so the file diffs cleanly. Used by the build tool.
 * @returns {object} a new index object
 */
export function upsertIndexEntry(index, entry) {
  const existing = parseLibraryIndex(index).filter((e) => e.id !== entry.id);
  const cleaned = parseLibraryIndex({ examples: [entry] });
  if (!cleaned.length)
    throw new Error(`not a valid example entry: ${entry?.id}`);
  const examples = [...existing, cleaned[0]].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  return { version: INDEX_VERSION, examples };
}
