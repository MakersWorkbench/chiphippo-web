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

import { DeskDoc } from "../model/desk-doc.js";

const KEYS = Object.freeze({
  settings: "settings",
  project: "project.current",
  recovery: "project.recovery",
  chipLibrary: "chip-library",
});

const LOCALES = Object.freeze([
  { code: "en", nativeName: "English" },
  { code: "de", nativeName: "Deutsch" },
  { code: "es", nativeName: "Español" },
  { code: "fr", nativeName: "Français" },
  { code: "it", nativeName: "Italiano" },
  { code: "ja", nativeName: "日本語" },
  { code: "zh", nativeName: "中文（简体）" },
]);

const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
const MAX_MEMORY_BYTES = 16 * 1024 * 1024;
const FILE_HANDLE_PREFIX = "browser-file://";
const MEM_GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SETTINGS_DEFAULTS = Object.freeze({
  viewport: { cx: 0, cy: 0, zoom: 1 },
  paletteOpen: true,
  paletteWidth: 232,
  paletteAutoClose: false,
  view3dEnabled: false,
  theme: "system",
  locale: "system",
  fontSize: 13,
  selectionColor: "#d0804a",
  defaultLedColor: "red",
  wiresFaded: false,
  defaultWireLayout: "direct",
  autoUpdateCheck: false,
  dismissedNotices: [],
});

const clone = (value) => (value == null ? value : structuredClone(value));

const LESSON_ID = /^[a-z0-9-]+$/i;
const PROJECT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const PROJECT_SOURCE_ORIGINS = Object.freeze([
  "https://themakersworkbench.com",
  "https://www.themakersworkbench.com",
  "https://staging.themakersworkbench.com",
]);

/** Only curated project files on an approved TMWB origin may feed an embed. */
export function projectSource(value, locationRef = {}) {
  if (!value) return null;
  try {
    const source = new URL(String(value));
    const localOrigin =
      ["localhost", "127.0.0.1"].includes(String(locationRef.hostname)) &&
      locationRef.origin;
    const allowed = [
      ...PROJECT_SOURCE_ORIGINS,
      ...(localOrigin ? [localOrigin] : []),
    ];
    if (source.username || source.password || source.hash) return null;
    if (source.protocol !== "https:" && source.origin !== localOrigin)
      return null;
    if (!allowed.includes(source.origin)) return null;
    return source.pathname.toLowerCase().endsWith(".chiphippo")
      ? source.href
      : null;
  } catch {
    return null;
  }
}

/** Resolve a lesson route without accepting path separators or URL syntax. */
export function browserRoute(locationRef = {}) {
  const pathname = String(locationRef.pathname ?? "");
  const embeddedProject = /^\/embed\/project\/([A-Za-z0-9_-]{1,64})\/?$/.exec(
    pathname,
  );
  const publicProject = /^\/p\/([A-Za-z0-9_-]{1,64})\/?$/.exec(pathname);
  const embedded = /^\/embed\/([a-z0-9-]+)\/?$/i.exec(pathname);
  let queried = null;
  let source = null;
  try {
    const params = new URLSearchParams(String(locationRef.search ?? ""));
    queried = params.get("lesson");
    source = projectSource(params.get("source"), locationRef);
  } catch {
    // A malformed query simply means there is no lesson route.
  }
  const lessonId =
    embedded?.[1] ?? (LESSON_ID.test(queried ?? "") ? queried : null);
  return {
    mode: embedded || embeddedProject ? "embed" : "app",
    lessonId: embeddedProject || publicProject ? null : lessonId,
    projectId: embeddedProject?.[1] ?? publicProject?.[1] ?? null,
    projectSource: embeddedProject || publicProject ? source : null,
  };
}

function newProject() {
  return {
    version: 5,
    name: "",
    description: "",
    activeTab: "t1",
    nextIndex: 2,
    tabs: [{ id: "t1", name: "Desktop 1", doc: new DeskDoc().toJSON() }],
    location: null,
  };
}

function safeName(value, fallback = "untitled") {
  const name = String(value || fallback)
    .replace(/[<>:"/\\|?*]/g, "-")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
    .join("")
    .replace(/[. ]+$/g, "")
    .slice(0, 64);
  return name || fallback;
}

function projectFileName(name) {
  return `${safeName(name)}.chiphippo`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const view = new Uint8Array(bytes ?? []);
  for (let offset = 0; offset < view.length; offset += 0x8000) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(encoded) {
  try {
    const binary = atob(encoded);
    if (!binary.length || binary.length > MAX_MEMORY_BYTES) return null;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function flatImages(raw) {
  if (!raw?.images || typeof raw.images !== "object") return {};
  if (!raw.blobs || typeof raw.blobs !== "object") return raw.images;
  const flat = {};
  for (const [guid, entry] of Object.entries(raw.images)) {
    const encoded = raw.blobs[entry?.blob];
    if (typeof encoded === "string") flat[guid] = encoded;
  }
  return flat;
}

function downloads(documentRef, urlRef, BlobRef) {
  return (data, name, type = "application/json") => {
    if (!documentRef || !urlRef?.createObjectURL || !BlobRef) return false;
    const blob = data instanceof BlobRef ? data : new BlobRef([data], { type });
    const href = urlRef.createObjectURL(blob);
    const link = documentRef.createElement("a");
    link.href = href;
    link.download = name;
    link.hidden = true;
    documentRef.body.append(link);
    link.click();
    link.remove();
    urlRef.revokeObjectURL(href);
    return true;
  };
}

function filePicker(documentRef, accept) {
  if (!documentRef) return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = documentRef.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.hidden = true;
    const done = (file) => {
      input.remove();
      resolve(file ?? null);
    };
    input.addEventListener("change", () => done(input.files?.[0]), { once: true }); // prettier-ignore
    input.addEventListener("cancel", () => done(null), { once: true });
    documentRef.body.append(input);
    input.click();
  });
}

async function parsedJsonFile(file) {
  if (!file) return null;
  if (Number(file.size) > MAX_PROJECT_BYTES) {
    throw new Error("Project files may not exceed 64 MB");
  }
  return { name: file.name, value: JSON.parse(await file.text()) };
}

async function readJsonFile(documentRef, accept) {
  const file = await filePicker(documentRef, accept);
  return parsedJsonFile(file);
}

async function fetchedJson(fetchRef, path) {
  const response = await fetchRef(path);
  if (!response.ok)
    throw new Error(`Could not load ${path} (${response.status})`);
  return response.json();
}

async function fetchedText(fetchRef, path) {
  const response = await fetchRef(path);
  if (!response.ok)
    throw new Error(`Could not load ${path} (${response.status})`);
  return response.text();
}

/**
 * Build the browser implementation of the renderer's existing preload API.
 * Dependencies are injectable so the contract is testable without a browser.
 */
export function createBrowserPlatform({
  storage,
  fetchRef = globalThis.fetch?.bind(globalThis),
  documentRef = globalThis.document,
  navigatorRef = globalThis.navigator,
  locationRef = globalThis.location,
  urlRef = globalThis.URL,
  BlobRef = globalThis.Blob,
  cryptoRef = globalThis.crypto,
  showOpenFilePickerRef = globalThis.showOpenFilePicker?.bind(globalThis),
  showSaveFilePickerRef = globalThis.showSaveFilePicker?.bind(globalThis),
} = {}) {
  if (!storage) throw new Error("BrowserPlatform requires storage");
  if (!fetchRef) throw new Error("BrowserPlatform requires fetch");
  const download = downloads(documentRef, urlRef, BlobRef);
  const openAux = (path) => {
    const opened = globalThis.window?.open?.(path, "_blank", "noopener");
    return Boolean(opened);
  };
  const relay = (name, inboundEvent, direction) => {
    if (!globalThis.window || !globalThis.BroadcastChannel) return null;
    const channel = new BroadcastChannel(`chiphippo-${name}`);
    channel.unref?.();
    channel.addEventListener("message", (event) => {
      if (event.data?.direction !== direction) return;
      window.dispatchEvent(
        new CustomEvent(inboundEvent, { detail: event.data.detail }),
      );
    });
    return channel;
  };
  const memoryHost = relay("memory", "chiphippo:memory-host-inbound", "host");
  const memoryWindow = relay("memory", "chiphippo:memory-inbound", "window");
  const designerHost = relay(
    "designer",
    "chiphippo:chipdesign-host-inbound",
    "host",
  );
  const designerWindow = relay(
    "designer",
    "chiphippo:chipdesign-inbound",
    "window",
  );
  const monitorHost = relay(
    "monitor",
    "chiphippo:cpumonitor-host-inbound",
    "host",
  );
  const monitorWindow = relay(
    "monitor",
    "chiphippo:cpumonitor-inbound",
    "window",
  );
  const fileHandles = new Map();
  let fallbackHandleId = 0;
  const route = browserRoute(locationRef);
  const asset = (path) => `/app/${String(path).replace(/^\/+/, "")}`;
  const contentKey = route.lessonId
    ? `lesson.${route.lessonId}`
    : route.projectId
      ? `published.${route.projectId}`
      : "project";
  const projectKey = `${contentKey}.current`;
  const recoveryKey = `${contentKey}.recovery`;
  let activeLessonManifest = null;
  const memKey = (guid) => `memory.${guid}`;

  const collectImages = async (meta) => {
    const images = {};
    const blobs = {};
    for (const tab of meta?.tabs ?? []) {
      for (const component of tab?.doc?.components ?? []) {
        const guid = component?.params?.storage?.guid;
        if (
          component?.params?.programmed !== true ||
          !MEM_GUID.test(String(guid ?? "")) ||
          Object.hasOwn(images, guid)
        ) {
          continue;
        }
        const bytes = new Uint8Array((await storage.get(memKey(guid))) ?? []);
        if (bytes.length > MAX_MEMORY_BYTES) continue;
        const digest = new Uint8Array(
          await cryptoRef.subtle.digest("SHA-256", bytes),
        );
        const blob = `sha256-${[...digest]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")}`;
        images[guid] = { blob };
        if (!Object.hasOwn(blobs, blob)) blobs[blob] = bytesToBase64(bytes);
      }
    }
    return { images, blobs };
  };

  const hydrateImages = async (raw) => {
    for (const [guid, encoded] of Object.entries(flatImages(raw))) {
      if (!MEM_GUID.test(guid) || typeof encoded !== "string") continue;
      const bytes = base64ToBytes(encoded);
      if (bytes) await storage.set(memKey(guid), bytes);
    }
  };

  const reseatDocument = async (source, images = null) => {
    const doc = clone(source);
    const remapped = new Map();
    for (const component of doc?.components ?? []) {
      const oldGuid = component?.params?.storage?.guid;
      if (typeof oldGuid !== "string" || !oldGuid) continue;
      let newGuid = remapped.get(oldGuid);
      if (!newGuid) {
        newGuid = cryptoRef.randomUUID();
        remapped.set(oldGuid, newGuid);
        const embedded = images?.[oldGuid];
        const bytes =
          typeof embedded === "string"
            ? base64ToBytes(embedded)
            : new Uint8Array((await storage.get(memKey(oldGuid))) ?? []);
        if (bytes?.length) await storage.set(memKey(newGuid), bytes);
      }
      component.params.storage = {
        ...component.params.storage,
        guid: newGuid,
      };
    }
    return doc;
  };

  const lessonManifest = async () => {
    if (!route.lessonId) return null;
    const manifest = await fetchedJson(
      fetchRef,
      asset(`lessons/${route.lessonId}.json`),
    );
    if (
      manifest?.schema !== 1 ||
      manifest?.id !== route.lessonId ||
      !LESSON_ID.test(String(manifest?.demo ?? ""))
    ) {
      throw new Error(`Invalid lesson manifest: ${route.lessonId}`);
    }
    activeLessonManifest = clone(manifest);
    return manifest;
  };

  const lessonProject = async (loadedManifest = null) => {
    if (!route.lessonId) return null;
    const manifest = loadedManifest ?? (await lessonManifest());
    const example = await fetchedJson(
      fetchRef,
      asset(`demos/${manifest.demo}.json`),
    );
    if (!example?.doc || typeof example.doc !== "object") {
      throw new Error(`Lesson desktop is unavailable: ${route.lessonId}`);
    }
    await hydrateImages(example);
    return {
      version: 5,
      name: String(manifest.title || example.title || route.lessonId),
      description: String(manifest.description || ""),
      activeTab: "t1",
      nextIndex: 2,
      tabs: [
        {
          id: "t1",
          name: String(manifest.desktopTitle || "Desktop 1"),
          doc: example.doc,
        },
      ],
      location: null,
    };
  };

  const publishedProject = async () => {
    if (!route.projectId || !PROJECT_ID.test(route.projectId)) return null;
    const source =
      route.projectSource ??
      asset(`projects/${encodeURIComponent(route.projectId)}.chiphippo`);
    const remote = await fetchedJson(fetchRef, source);
    await hydrateImages(remote);
    return { ...remote, location: null };
  };

  const rememberHandle = async (handle) => {
    const id =
      globalThis.crypto?.randomUUID?.() ??
      `session-${Date.now()}-${++fallbackHandleId}`;
    fileHandles.set(id, handle);
    try {
      await storage.set(`file-handle.${id}`, handle);
    } catch {
      // Some browsers cannot structured-clone file handles. The handle still
      // remains usable for this page session; downloads remain the fallback.
    }
    return `${FILE_HANDLE_PREFIX}${id}/${safeName(handle.name, "project.chiphippo")}`;
  };

  const handleFor = async (location) => {
    const match = new RegExp(`^${FILE_HANDLE_PREFIX}([^/]+)/`).exec(
      String(location ?? ""),
    );
    if (!match) return null;
    if (fileHandles.has(match[1])) return fileHandles.get(match[1]);
    try {
      const stored = await storage.get(`file-handle.${match[1]}`);
      if (stored) fileHandles.set(match[1], stored);
      return stored ?? null;
    } catch {
      return null;
    }
  };

  const writeHandle = async (handle, contents) => {
    if (handle.queryPermission && handle.requestPermission) {
      let permission = await handle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        permission = await handle.requestPermission({ mode: "readwrite" });
      }
      if (permission !== "granted") throw new Error("File access was denied");
    }
    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();
  };

  const projectPickerTypes = [
    {
      description: "Chip Hippo Project",
      accept: { "application/json": [".chiphippo"] },
    },
  ];

  const settings = {
    async get() {
      const loaded = { ...clone(SETTINGS_DEFAULTS), ...clone((await storage.get(KEYS.settings)) ?? {}) }; // prettier-ignore
      // A curated lesson must behave the same for every reader, including a
      // first-time embed that has no access to the Settings dialog. Use the
      // electrical engine so its meter has real voltage/current data. A user
      // can still change the setting after opening the full workbench.
      return route.lessonId
        ? {
            ...loaded,
            spiceLite: { ...clone(loaded.spiceLite), enabled: true },
          }
        : loaded;
    },
    async set(patch) {
      const current = (await storage.get(KEYS.settings)) ?? {};
      const next = { ...current, ...(patch && typeof patch === "object" ? patch : {}) }; // prettier-ignore
      await storage.set(KEYS.settings, next);
      return { ...clone(SETTINGS_DEFAULTS), ...clone(next) };
    },
    chooseDatasheetDir: async () => null,
  };

  const project = {
    async boot() {
      // Instrument/UI setup belongs to the lesson, not to its locally saved
      // circuit. Always load the current manifest even when a recovery or
      // autosave supplies the project document for this visit.
      const manifest = route.lessonId ? await lessonManifest() : null;
      const recovery = await storage.get(recoveryKey);
      if (recovery?.meta?.tabs?.length) {
        return {
          ...clone(recovery.meta),
          location: recovery.location ?? null,
          restored: {
            name: recovery.meta.name || "Untitled",
            path: recovery.location ?? "",
            homeless: !recovery.location,
          },
        };
      }
      const stored = await storage.get(projectKey);
      return clone(
        stored ??
          (await lessonProject(manifest)) ??
          (await publishedProject()) ??
          newProject(),
      );
    },
    async create() {
      const next = newProject();
      await storage.set(projectKey, next);
      await storage.delete(recoveryKey);
      return clone(next);
    },
    async open() {
      if (showOpenFilePickerRef) {
        try {
          const [handle] = await showOpenFilePickerRef({
            multiple: false,
            types: projectPickerTypes,
          });
          if (!handle) return null;
          const picked = await parsedJsonFile(await handle.getFile());
          await hydrateImages(picked.value);
          const location = await rememberHandle(handle);
          const opened = { ...picked.value, location };
          await storage.set(projectKey, opened);
          await storage.delete(recoveryKey);
          return clone(opened);
        } catch (error) {
          if (error?.name === "AbortError") return null;
          throw error;
        }
      }
      const picked = await readJsonFile(documentRef, ".chiphippo,application/json"); // prettier-ignore
      if (!picked) return null;
      await hydrateImages(picked.value);
      const opened = { ...picked.value, location: picked.name };
      await storage.set(projectKey, opened);
      await storage.delete(recoveryKey);
      return clone(opened);
    },
    openRecent: async () => null,
    regrant: async () => null,
    async save(meta, filePath) {
      const location = filePath || null;
      const saved = { version: 5, ...clone(meta), location };
      await storage.set(projectKey, saved);
      await storage.delete(recoveryKey);
      if (location) {
        const portable = { version: 5, ...clone(meta) };
        const { images, blobs } = await collectImages(portable);
        if (Object.keys(images).length) {
          portable.images = images;
          portable.blobs = blobs;
        }
        const contents = JSON.stringify(portable, null, 2);
        const handle = await handleFor(location);
        if (handle) await writeHandle(handle, contents);
        else {
          const fallbackName = String(location).split("/").pop();
          download(
            contents,
            safeName(fallbackName, projectFileName(meta.name)),
          );
        }
      }
      return { ok: true, path: location };
    },
    recovery: {
      async write(meta, location) {
        await storage.set(recoveryKey, {
          meta: clone(meta),
          location: location || null,
        });
        return { ok: true };
      },
      clear: () => storage.delete(recoveryKey),
    },
    async choosePath(kind, name) {
      const suggestedName =
        kind === "desktop"
          ? `${safeName(name)}.desktop.chiphippo`
          : projectFileName(name);
      if (!showSaveFilePickerRef) return suggestedName;
      try {
        const handle = await showSaveFilePickerRef({
          suggestedName,
          types: projectPickerTypes,
        });
        return handle ? await rememberHandle(handle) : null;
      } catch (error) {
        if (error?.name === "AbortError") return null;
        throw error;
      }
    },
    recent: {
      list: async () => [],
      remove: async () => [],
    },
    closeAuxWindows: async () => true,
  };

  const mem = {
    async create(guid, byteLength) {
      if (await storage.get(memKey(guid))) return { ok: true };
      const bytes = new Uint8Array(Math.max(0, Number(byteLength) || 0));
      globalThis.crypto?.getRandomValues?.(bytes);
      await storage.set(memKey(guid), bytes);
      return { ok: true };
    },
    async load(guid, byteLength) {
      const found = await storage.get(memKey(guid));
      const length = Math.max(0, Number(byteLength) || 0);
      const bytes = new Uint8Array(length);
      bytes.set(new Uint8Array(found ?? []).subarray(0, length));
      return { ok: true, bytes };
    },
    async program(guid, source, byteLength) {
      const length = Math.max(0, Number(byteLength) || 0);
      const image = new Uint8Array(source ?? []);
      const current = (await mem.load(guid, length)).bytes;
      const written = Math.min(image.length, length);
      current.set(image.subarray(0, written));
      await storage.set(memKey(guid), current);
      return {
        ok: true,
        written,
        imageLength: image.length,
        memLength: length,
        truncated: image.length > length,
        short: image.length < length,
      };
    },
    async write(guid, bytes) {
      await storage.set(memKey(guid), new Uint8Array(bytes ?? []));
      return { ok: true };
    },
    async delete(guid) {
      await storage.delete(memKey(guid));
      return { ok: true };
    },
    path: async (guid) => ({ ok: true, path: `browser-storage://${guid}` }),
    pickImage: async () => null,
    export: async (bytes, suggestedName) =>
      download(new Uint8Array(bytes ?? []), safeName(suggestedName, "memory.bin"), "application/octet-stream"), // prettier-ignore
  };

  return {
    platform: "web",
    arch: "browser",
    isDev: locationRef?.hostname === "localhost" || locationRef?.hostname === "127.0.0.1", // prettier-ignore
    getVersion: async () => "1.4.3-web-dev",
    getAppInfo: async () => ({
      version: "1.4.3-web-dev",
      platform: navigatorRef?.userAgent ?? "Web browser",
      web: true,
      donate: false,
    }),
    openDonatePage: async () => false,
    closeReply: async () => true,
    closeReady: async () => true,
    settings,
    i18n: {
      async load() {
        const current = await settings.get();
        const system = navigatorRef?.language || "en";
        const requested = current.locale && current.locale !== "system" ? current.locale : system; // prettier-ignore
        const wanted = String(requested).split("-")[0].toLowerCase();
        const supported = LOCALES.some((locale) => locale.code === wanted);
        const lang = supported ? wanted : "en";
        const fallback = await fetchedJson(fetchRef, asset("locales/en.json"));
        const messages = lang === "en" ? fallback : await fetchedJson(fetchRef, asset(`locales/${lang}.json`)); // prettier-ignore
        return { requested: current.locale, system, active: lang, lang, messages, fallback, locales: clone(LOCALES) }; // prettier-ignore
      },
    },
    project,
    desktop: {
      async export(desktop) {
        const snapshot = clone(desktop);
        const { images, blobs } = await collectImages({
          tabs: [{ doc: snapshot?.doc }],
        });
        if (Object.keys(images).length) {
          snapshot.images = images;
          snapshot.blobs = blobs;
        }
        const location = await project.choosePath(
          "desktop",
          desktop?.name || "desktop",
        );
        if (!location) return null;
        const contents = JSON.stringify(snapshot, null, 2);
        const handle = await handleFor(location);
        if (handle) await writeHandle(handle, contents);
        else download(contents, String(location).split("/").pop());
        return { ok: true, path: location };
      },
      async exportTo(_format, files) {
        for (const file of files ?? []) download(file.text ?? "", safeName(file.name, "export.txt"), "text/plain"); // prettier-ignore
        return { ok: true, path: "browser-downloads" };
      },
      async import() {
        let picked;
        if (showOpenFilePickerRef) {
          try {
            const [handle] = await showOpenFilePickerRef({
              multiple: false,
              types: projectPickerTypes,
            });
            picked = handle
              ? await parsedJsonFile(await handle.getFile())
              : null;
          } catch (error) {
            if (error?.name === "AbortError") return null;
            throw error;
          }
        } else {
          picked = await readJsonFile(
            documentRef,
            ".chiphippo,application/json",
          );
        }
        if (!picked?.value?.doc) return null;
        return {
          ...picked.value,
          doc: await reseatDocument(picked.value.doc, flatImages(picked.value)),
        };
      },
      async duplicate(doc) {
        return { doc: await reseatDocument(doc) };
      },
    },
    chipLibrary: {
      list: async () => clone((await storage.get(KEYS.chipLibrary)) ?? []),
      put: async (chips) => storage.set(KEYS.chipLibrary, clone(chips ?? [])),
      async remove(id) {
        const chips = (await storage.get(KEYS.chipLibrary)) ?? [];
        const next = chips.filter((chip) => chip?.id !== id);
        await storage.set(KEYS.chipLibrary, next);
        return clone(next);
      },
    },
    mem,
    memory: {
      async open(compId, ref) {
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(compId ?? ""))) return false;
        const query = new URLSearchParams({ id: String(compId), ref: String(ref ?? "") }); // prettier-ignore
        return openAux(`/app/memory.html?${query}`);
      },
      async toInspector(compId, msg) {
        memoryWindow?.postMessage({
          direction: "window",
          detail: { compId, msg },
        });
        return true;
      },
      async toHost(compId, msg) {
        memoryHost?.postMessage({
          direction: "host",
          detail: { compId, msg },
        });
        return true;
      },
    },
    chipDesign: {
      open: async () => openAux("/app/chip-designer.html"),
      async toWindow(msg) {
        designerWindow?.postMessage({ direction: "window", detail: msg });
        return true;
      },
      async toHost(msg) {
        designerHost?.postMessage({ direction: "host", detail: msg });
        return true;
      },
    },
    cpuMonitor: {
      open: async () => openAux("/app/cpu-monitor.html"),
      async toWindow(msg) {
        monitorWindow?.postMessage({ direction: "window", detail: msg });
        return true;
      },
      async toHost(msg) {
        monitorHost?.postMessage({ direction: "host", detail: msg });
        return true;
      },
    },
    pinout: { chip: async () => null, updateChips: async () => true, openDesigner: async () => false }, // prettier-ignore
    openPinout: async (ref, options = {}) => {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(ref ?? ""))) return false;
      const params = new URLSearchParams({ ref: String(ref) });
      if (options.kind === "wire") params.set("kind", "wire");
      if (Number.isFinite(options.rot)) params.set("rot", String(options.rot));
      return openAux(`/app/pinout.html?${params}`);
    },
    openDatasheet: async () => false,
    datasheets: { download: async () => false, cancel: async () => true },
    demo: {
      open: async () => false,
      read: (ref) => /^[a-z0-9-]+$/i.test(String(ref)) ? fetchedJson(fetchRef, asset(`demos/${ref}.json`)) : null, // prettier-ignore
    },
    docs: {
      read: (slug) => /^[a-z0-9-]+$/i.test(String(slug)) ? fetchedText(fetchRef, asset(`docs/${slug}.md`)) : null, // prettier-ignore
      open: async (slug = "") =>
        openAux(
          `/app/docs.html${
            /^[a-z0-9-]+$/i.test(String(slug))
              ? `?page=${encodeURIComponent(slug)}`
              : ""
          }`,
        ),
    },
    ai: {
      providers: async () => [],
      key: { set: async () => false, clear: async () => false, status: async () => null }, // prettier-ignore
      test: async () => ({ ok: false }),
      start: async () => ({ ok: false }),
      cancel: async () => true,
    },
    updater: { check: async () => false, install: async () => false },
    menu: { setEditState: async () => true, setDesktopState: async () => true }, // prettier-ignore
    serial: { ports: async () => [], open: async () => ({ ok: false }), close: async () => true, send: async () => false }, // prettier-ignore
    integration: { saveFile: async () => ({ ok: false, code: "unsupported" }) }, // prettier-ignore
    web: {
      ...route,
      get manifest() {
        return clone(activeLessonManifest);
      },
      async resetContent() {
        if (!route.lessonId && !route.projectId) return false;
        await storage.delete(projectKey);
        await storage.delete(recoveryKey);
        return true;
      },
      async resetLesson() {
        if (!route.lessonId) return false;
        return this.resetContent();
      },
    },
  };
}
