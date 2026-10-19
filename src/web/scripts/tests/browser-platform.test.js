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

import assert from "node:assert/strict";
import test from "node:test";
import {
  browserRoute,
  createBrowserPlatform,
} from "../platform/browser-platform.js";

class MemoryStorage {
  values = new Map();
  async get(key) {
    return structuredClone(this.values.get(key));
  }
  async set(key, value) {
    this.values.set(key, structuredClone(value));
  }
  async delete(key) {
    this.values.delete(key);
  }
}

const catalog = { common: { ok: "OK" } };
const fetchRef = async (path) => ({
  ok: true,
  status: 200,
  json: async () => ({ ...catalog, path }),
  text: async () => `# ${path}`,
});

function platform(storage = new MemoryStorage(), options = {}) {
  return createBrowserPlatform({
    storage,
    fetchRef,
    documentRef: null,
    navigatorRef: { language: "en-US", userAgent: "test" },
    locationRef: { hostname: "localhost" },
    ...options,
  });
}

test("browser platform creates and persists a usable blank project", async () => {
  const storage = new MemoryStorage();
  const bridge = platform(storage);
  const created = await bridge.project.create();
  assert.equal(created.version, 5);
  assert.equal(created.tabs.length, 1);
  assert.equal(created.tabs[0].doc.version, 15);
  assert.deepEqual((await bridge.project.boot()).tabs, created.tabs);
});

test("browser settings merge patches over web defaults", async () => {
  const bridge = platform();
  assert.equal((await bridge.settings.get()).paletteOpen, true);
  await bridge.settings.set({
    paletteOpen: false,
    defaultWireLayout: "routed",
  });
  const settings = await bridge.settings.get();
  assert.equal(settings.paletteOpen, false);
  assert.equal(settings.defaultWireLayout, "routed");
  assert.deepEqual(settings.viewport, { cx: 0, cy: 0, zoom: 1 });
});

test("browser recovery is preferred at boot and can be cleared", async () => {
  const bridge = platform();
  const created = await bridge.project.create();
  const changed = { ...created, name: "Recovered lesson" };
  await bridge.project.recovery.write(changed, "lesson.chiphippo");
  const recovered = await bridge.project.boot();
  assert.equal(recovered.name, "Recovered lesson");
  assert.equal(recovered.restored.path, "lesson.chiphippo");
  await bridge.project.recovery.clear();
  assert.equal((await bridge.project.boot()).name, "");
});

test("browser i18n loads same-origin catalogs", async () => {
  const requested = [];
  const bridge = platform(new MemoryStorage(), {
    fetchRef: async (path) => {
      requested.push(path);
      return fetchRef(path);
    },
  });
  const loaded = await bridge.i18n.load();
  assert.equal(loaded.lang, "en");
  assert.deepEqual(requested, ["/app/locales/en.json"]);
  assert.equal(
    loaded.locales.some((locale) => locale.code === "ja"),
    true,
  );
});

test("browser project save keeps a local working copy", async () => {
  const bridge = platform();
  const created = await bridge.project.create();
  const saved = { ...created, name: "Logic gate" };
  const result = await bridge.project.save(saved, null);
  assert.deepEqual(result, { ok: true, path: null });
  assert.equal((await bridge.project.boot()).name, "Logic gate");
});

test("browser memory programming preserves a short image tail", async () => {
  const bridge = platform();
  await bridge.mem.write("rom-1", new Uint8Array([1, 2, 3, 4]));
  const programmed = await bridge.mem.program(
    "rom-1",
    new Uint8Array([9, 8]),
    4,
  );
  assert.equal(programmed.short, true);
  assert.deepEqual(
    [...(await bridge.mem.load("rom-1", 4)).bytes],
    [9, 8, 3, 4],
  );
});

test("browser routes accept only safe lesson identifiers", () => {
  assert.deepEqual(browserRoute({ pathname: "/embed/74ls00-intro" }), {
    mode: "embed",
    lessonId: "74ls00-intro",
    projectId: null,
    projectSource: null,
  });
  assert.deepEqual(
    browserRoute({ pathname: "/app/", search: "?lesson=74ls00-intro" }),
    {
      mode: "app",
      lessonId: "74ls00-intro",
      projectId: null,
      projectSource: null,
    },
  );
  assert.deepEqual(
    browserRoute({ pathname: "/app/", search: "?lesson=../private" }),
    { mode: "app", lessonId: null, projectId: null, projectSource: null },
  );
  assert.deepEqual(browserRoute({ pathname: "/p/Abcdefgh1234" }), {
    mode: "app",
    lessonId: null,
    projectId: "Abcdefgh1234",
    projectSource: null,
  });
  assert.deepEqual(browserRoute({ pathname: "/embed/project/Abcdefgh1234" }), {
    mode: "embed",
    lessonId: null,
    projectId: "Abcdefgh1234",
    projectSource: null,
  });
  assert.deepEqual(
    browserRoute(
      {
        pathname: "/embed/project/nand-intro",
        search:
          "?source=https%3A%2F%2Fsite.example%2Fsites%2Fdefault%2Ffiles%2Fnand.chiphippo",
      },
      ["https://site.example"],
    ),
    {
      mode: "embed",
      lessonId: null,
      projectId: "nand-intro",
      projectSource: "https://site.example/sites/default/files/nand.chiphippo",
    },
  );
  assert.equal(
    browserRoute(
      {
        pathname: "/embed/project/nand-intro",
        search: "?source=https%3A%2F%2Fevil.example%2Fnand.chiphippo",
      },
      ["https://site.example"],
    ).projectSource,
    null,
  );
  // With no host site configured (a stock build), no outside source is trusted.
  assert.equal(
    browserRoute(
      {
        pathname: "/embed/project/nand-intro",
        search: "?source=https%3A%2F%2Fsite.example%2Ffiles%2Fnand.chiphippo",
      },
      [],
    ).projectSource,
    null,
  );
  // The Drupal chiphippo_embed media route is accepted without a file extension.
  assert.equal(
    browserRoute(
      {
        pathname: "/embed/project/7",
        search:
          "?source=https%3A%2F%2Fsite.example%2Fchiphippo-project%2F7%2Ffile",
      },
      ["https://site.example"],
    ).projectSource,
    "https://site.example/chiphippo-project/7/file",
  );
});

test("embed lessons boot from a versioned manifest and keep isolated saves", async () => {
  const storage = new MemoryStorage();
  const requested = [];
  const lessonOptions = {
    locationRef: { pathname: "/embed/74ls00-intro", search: "" },
    fetchRef: async (path) => {
      requested.push(path);
      if (path.endsWith("/lessons/74ls00-intro.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            schema: 1,
            id: "74ls00-intro",
            title: "NAND Lab",
            desktopTitle: "Lesson",
            demo: "74LS00",
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ doc: { version: 15 } }),
      };
    },
  };
  const bridge = platform(storage, lessonOptions);

  const seeded = await bridge.project.boot();
  assert.equal((await bridge.settings.get()).spiceLite.enabled, true);
  assert.equal(seeded.name, "NAND Lab");
  assert.equal(seeded.tabs[0].name, "Lesson");
  assert.equal(bridge.web.manifest.schema, 1);
  assert.deepEqual(requested, [
    "/app/lessons/74ls00-intro.json",
    "/app/demos/74LS00.json",
  ]);

  await bridge.project.save({ ...seeded, name: "My NAND Lab" }, null);
  assert.equal((await bridge.project.boot()).name, "My NAND Lab");
  assert.equal(await storage.get("project.current"), undefined);

  // A page reload creates a new bridge. Its locally saved circuit must not
  // prevent the current lesson's instrument/UI manifest from loading.
  const reloaded = platform(storage, lessonOptions);
  assert.equal((await reloaded.project.boot()).name, "My NAND Lab");
  assert.equal(reloaded.web.manifest.title, "NAND Lab");

  assert.equal(await bridge.web.resetLesson(), true);
  assert.equal((await bridge.project.boot()).name, "NAND Lab");
});

test("curated project routes load a Drupal media file and keep edits isolated", async () => {
  const storage = new MemoryStorage();
  const remote = {
    version: 5,
    name: "Shared counter",
    activeTab: "t1",
    nextIndex: 2,
    tabs: [{ id: "t1", name: "Counter", doc: { version: 15 } }],
  };
  const requested = [];
  const bridge = platform(storage, {
    locationRef: {
      hostname: "127.0.0.1",
      origin: "http://127.0.0.1:4173",
      pathname: "/p/counter",
      search:
        "?source=http%3A%2F%2F127.0.0.1%3A4173%2Ffiles%2Fcounter.chiphippo",
    },
    fetchRef: async (path) => {
      requested.push(path);
      return { ok: true, status: 200, json: async () => remote };
    },
  });

  assert.equal((await bridge.project.boot()).name, "Shared counter");
  assert.deepEqual(requested, [
    "http://127.0.0.1:4173/files/counter.chiphippo",
  ]);
  await bridge.project.save({ ...remote, name: "My variation" }, null);
  assert.equal((await bridge.project.boot()).name, "My variation");
  assert.equal(await bridge.web.resetContent(), true);
  assert.equal((await bridge.project.boot()).name, "Shared counter");
});

test("native browser file handles support Save As, Save, and Open round trips", async () => {
  const guid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  let contents = "";
  const handle = {
    name: "counter.chiphippo",
    queryPermission: async () => "granted",
    requestPermission: async () => "granted",
    async createWritable() {
      return {
        write: async (value) => {
          contents = value;
        },
        close: async () => {},
      };
    },
    async getFile() {
      return {
        name: this.name,
        size: contents.length,
        text: async () => contents,
      };
    },
  };
  const bridge = platform(new MemoryStorage(), {
    showSaveFilePickerRef: async () => handle,
    showOpenFilePickerRef: async () => [handle],
  });

  const location = await bridge.project.choosePath("project", "Counter");
  assert.match(location, /^browser-file:\/\/.+\/counter\.chiphippo$/);
  const project = { ...(await bridge.project.create()), name: "Counter" };
  project.tabs[0].doc.components = [
    {
      id: "c1",
      kind: "chip",
      ref: "28C16",
      params: { programmed: true, storage: { guid } },
    },
  ];
  await bridge.mem.write(guid, new Uint8Array([1, 2, 3, 4]));
  assert.deepEqual(await bridge.project.save(project, location), {
    ok: true,
    path: location,
  });
  const written = JSON.parse(contents);
  assert.equal(written.version, 5);
  assert.equal(written.name, "Counter");
  assert.equal(typeof written.images[guid].blob, "string");
  assert.equal(written.blobs[written.images[guid].blob], "AQIDBA==");

  await bridge.mem.delete(guid);
  contents = JSON.stringify({ ...written, name: "Reopened" });
  const opened = await bridge.project.open();
  assert.equal(opened.name, "Reopened");
  assert.match(opened.location, /^browser-file:\/\/.+\/counter\.chiphippo$/);
  assert.deepEqual([...(await bridge.mem.load(guid, 4)).bytes], [1, 2, 3, 4]);
});

test("oversized browser project files are rejected before parsing", async () => {
  const bridge = platform(new MemoryStorage(), {
    showOpenFilePickerRef: async () => [
      {
        name: "too-large.chiphippo",
        getFile: async () => ({
          name: "too-large.chiphippo",
          size: 64 * 1024 * 1024 + 1,
          text: async () => "{}",
        }),
      },
    ],
  });
  await assert.rejects(() => bridge.project.open(), /may not exceed 64 MB/);
});

test("duplicated browser desktops receive independent ROM storage", async () => {
  const guid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const bridge = platform();
  await bridge.mem.write(guid, new Uint8Array([9, 8, 7]));
  const result = await bridge.desktop.duplicate({
    version: 15,
    components: [
      {
        id: "c1",
        kind: "chip",
        ref: "28C16",
        params: { programmed: true, storage: { guid } },
      },
    ],
  });
  const copiedGuid = result.doc.components[0].params.storage.guid;
  assert.notEqual(copiedGuid, guid);
  assert.deepEqual(
    [...(await bridge.mem.load(copiedGuid, 3)).bytes],
    [9, 8, 7],
  );
  await bridge.mem.write(copiedGuid, new Uint8Array([6, 5, 4]));
  assert.deepEqual([...(await bridge.mem.load(guid, 3)).bytes], [9, 8, 7]);
});

test("the example library lists the bundled index and reads one project by id", async () => {
  const requested = [];
  const bridge = platform(new MemoryStorage(), {
    fetchRef: async (path) => {
      requested.push(path);
      const body = path.endsWith("/index.json")
        ? {
            version: 1,
            examples: [
              { id: "ok-1", title: "One", category: "Logic" },
              { id: "../escape", title: "Bad" },
            ],
          }
        : { version: 5, tabs: [{ id: "t1", doc: {} }] };
      return { ok: true, status: 200, json: async () => body };
    },
  });
  assert.deepEqual(
    (await bridge.examples.list()).map((e) => e.id),
    ["ok-1"],
    "a bad id in the index is dropped",
  );
  assert.equal((await bridge.examples.read("ok-1")).version, 5);
  assert.equal(await bridge.examples.read("../secret"), null);
  assert.deepEqual(requested, [
    "/app/examples/index.json",
    "/app/examples/ok-1.chiphippo",
  ]);
});
