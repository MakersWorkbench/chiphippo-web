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

// build-project.mjs — a text netlist spec in, a verified .chiphippo project out.
//
//   node scripts/build-project.mjs <spec.json> [--out <file.chiphippo>] [--name "Project name"]
//   ... add --library [--category "Logic gates"] [--examples-dir <dir>] to also file the built project in the
//       Example Library (src/web/examples: <name>.chiphippo + an entry in index.json)
//   node scripts/build-project.mjs --catalog        (print every part a spec may use, with its pins)
//
// The spec is the same coordinate-free `{title, notes, parts, nets, tests}`
// document the AI circuit builder uses (src/web/scripts/ai/catalog-brief.js
// states its rules; model/autobuild.js compiles it). This is the headless path:
// compile the spec, run the verification ladder and the spec's own tests, and
// only if everything passes write a project file the lab can open, embed or
// save to a site. With no --out the project goes next to the spec.
//
// Exit status: 0 built and verified, 1 the spec failed (faults are printed),
// 2 usage or I/O error. Nothing is written on a failure.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const web = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "web",
  "scripts",
);
const load = (relative) => import(pathToFileURL(join(web, relative)).href);

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? null : (args[at + 1] ?? null);
};
if (args.includes("--catalog")) {
  const { buildCatalogCard } = await load("ai/catalog-brief.js");
  console.log(buildCatalogCard());
  process.exit(0);
}
const VALUE_FLAGS = new Set([
  "--out",
  "--name",
  "--category",
  "--examples-dir",
]);
const specPath = args.find(
  (arg, i) => !arg.startsWith("--") && !VALUE_FLAGS.has(args[i - 1]),
);
if (!specPath) {
  console.error('usage: node scripts/build-project.mjs <spec.json> [--out file.chiphippo] [--name "Name"]'); // prettier-ignore
  process.exit(2);
}

let text;
try {
  text = readFileSync(resolve(specPath), "utf8");
} catch (error) {
  console.error(`cannot read ${specPath}: ${error.message}`);
  process.exit(2);
}

const { buildFromReply } = await load("ai/generate.js");
const { PROJECT_VERSION, normalizeProject } = await load(
  "model/project-doc.js",
);
const { upsertIndexEntry } = await load("model/example-library.js");

const built = buildFromReply(text);
if (!built.ok) {
  if (built.declined) {
    console.error(`DECLINED: ${built.title ?? "the spec has no parts"}`);
  }
  for (const fault of built.faults ?? []) {
    console.error(
      `FAULT ${fault.gate ?? "?"} ${fault.code ?? ""}: ${fault.message ?? JSON.stringify(fault)}`,
    );
  }
  console.error("not written: fix the faults and run again");
  process.exit(1);
}

const name = flag("--name") ?? (built.title || basename(specPath, ".json"));
const project = normalizeProject({
  version: PROJECT_VERSION,
  name,
  description: built.notes ?? "",
  activeTab: "t1",
  nextIndex: 2,
  tabs: [{ id: "t1", name: name.slice(0, 64), doc: built.document }],
});

const out = resolve(
  flag("--out") ?? specPath.replace(/\.json$/i, "") + ".chiphippo",
);
writeFileSync(out, JSON.stringify(project, null, 2) + "\n");

const parts = built.document.components?.length ?? 0;
const wires = built.document.wires?.length ?? 0;
if (args.includes("--library")) {
  const dir = resolve(flag("--examples-dir") ?? join(web, "..", "examples"));
  mkdirSync(dir, { recursive: true });
  const indexPath = join(dir, "index.json");
  let index = { examples: [] };
  try {
    index = JSON.parse(readFileSync(indexPath, "utf8"));
  } catch {
    // no index yet: this is the first example
  }
  const entry = {
    id: name,
    title: built.title || name,
    description: built.notes ?? "",
    category: flag("--category") ?? undefined,
    parts: built.document.components?.length ?? 0,
  };
  let next;
  try {
    next = upsertIndexEntry(index, entry);
  } catch (error) {
    console.error(
      `not filed in the library: ${error.message} (the project name must be letters, digits, dots and hyphens)`,
    );
    process.exit(1);
  }
  const body = `${JSON.stringify(project, null, 2)}\n`;
  writeFileSync(join(dir, `${name}.chiphippo`), body);
  writeFileSync(indexPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `library: ${join(dir, name + ".chiphippo")} (index now lists ${next.examples.length})`,
  );
}
console.log(`built ${out}`);
console.log(`  ${parts} parts, ${wires} wires; project "${name}"`);
for (const warning of built.warnings ?? []) {
  console.log(`  note: ${warning.message ?? JSON.stringify(warning)}`);
}
const passed = (built.results ?? []).filter((r) => r?.ok !== false).length;
console.log(`  tests run: ${(built.results ?? []).length}, passed: ${passed}`);
