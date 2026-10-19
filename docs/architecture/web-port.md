# Chip Hippo web port

This document records the first browser-port seam.
The desktop application remains supported: Electron still supplies
`window.chiphippo` through `src/app/preload.js`. In an ordinary browser,
`src/web/scripts/platform/browser-bootstrap.js` detects that the preload bridge
is absent and installs `BrowserPlatform` at the same boundary before `app.js`
starts.

## Run the browser build locally

From `src/`:

```text
npm ci
npm run web:serve
```

Then open `http://127.0.0.1:4173/app/`.

The server is dependency-free and provides the read-only development preview.
Production runs the same service bound to localhost behind Nginx. It has no
project-write endpoint. `npm run web:build` creates `dist/web` and fingerprints
the document's entry scripts and styles; tagged release directories make each
deployment reproducible and rollback-safe.

## Current browser capabilities

- The existing editor, breadboard renderer, catalog, simulation worker, and
  digital/Spice Lite engines boot without Electron.
- Settings, the current project, recovery data, the custom-chip library, and
  memory images use a versioned IndexedDB database named `chiphippo-web`.
- Locale catalogs, bundled documentation, and demos are loaded from the same
  origin.
- Project and desktop files can be imported with a browser file picker and
  exported through downloads.
- Chromium browsers use the File System Access API for Save As and subsequent
  writes to the same `.chiphippo` file. Other browsers retain the download and
  upload fallback. Imported project files are capped at 64 MB before parsing.
- Programmed ROM/EEPROM bytes now travel in browser-saved project and desktop
  files using the desktop app's v5 content-addressed `images`/`blobs` shape.
  Opening hydrates IndexedDB, while imported and duplicated desktops receive
  new GUIDs so copies cannot overwrite one another's memory.
- Unsupported desktop-only services are present as explicit inert adapter
  methods, so a missing IPC method cannot crash browser boot. AI credentials,
  native updates, native serial, and auxiliary Electron windows remain off.
- Curated `/p/:id` and `/embed/project/:id` routes load a `.chiphippo` file
  uploaded to Drupal Media Library by an authorized editor. The source URL is
  restricted to the host sites configured with `CHIPHIPPO_SITE_ORIGINS` and the `.chiphippo` extension.
- Readers can experiment freely, export a local `.chiphippo` file with **Save
  As**, and import it later with **Open**. They cannot write projects to the lab
  server or Drupal.

This remains a pre-release port. The core browser application, durable project
files, lesson/curated embeds, read-only server, deployment templates, and
Drupal text filter are implemented. The real Drupal editor integration and
server deployment require
their external repositories/hosts.

## Embedded lesson proof of concept

`/embed/:lesson` loads a versioned manifest from `src/web/lessons/`, seeds the
lesson from a bundled desktop, and stores the reader's copy under a
lesson-specific IndexedDB key. The first fixture is available at:

```text
http://127.0.0.1:4173/embed/74ls00-intro
```

The compact shell removes project-file controls, honors the manifest's palette,
tab-strip, and Open full workbench flags, and provides Reset. Reset deletes only
that lesson's local project and recovery records.

The iframe protocol uses envelopes shaped like:

```json
{
  "protocol": "chiphippo",
  "version": 1,
  "type": "chiphippo.ready"
}
```

The embed emits `chiphippo.ready`, `chiphippo.loaded`, `chiphippo.dirty`,
`chiphippo.run-state`, `chiphippo.height`, and `chiphippo.open-full`. It accepts
`chiphippo.reset`, `chiphippo.load-lesson`, and `chiphippo.open-full` only when
the sender is its parent window, the origin is explicitly allowlisted, the
protocol version matches, and the message type is known. Production deployment
must keep the allowlist and the HTTP `frame-ancestors` policy synchronized.

## Platform boundary

```text
Existing renderer and simulator
             |
       window.chiphippo
        /           \
Electron preload   BrowserPlatform
        |           |
Electron IPC       IndexedDB, fetch, file picker, downloads
```

Keeping the boundary compatible avoids a second renderer and leaves the
platform-neutral simulator, component catalog, geometry, editing, undo/redo,
and document models shared with upstream.

## Storage keys

IndexedDB version 1 contains one `key-value` object store. Its initial records
are:

| Key                | Contents                                            |
| ------------------ | --------------------------------------------------- |
| `settings`         | Browser-owned preference patch                      |
| `project.current`  | Current local project and logical browser location  |
| `project.recovery` | Crash-recovery project and the location it protects |
| `chip-library`     | User-designed chip library                          |
| `memory.<guid>`    | Binary ROM/EEPROM image                             |

Schema upgrades must be additive or explicitly migrated. A failed future
migration must not delete the prior database.

## Curated Drupal project flow

1. The site editor exports the project as a `.chiphippo` file.
2. The editor uploads it to Drupal Media Library using their existing access.
3. Drupal renders an embed URL containing the public Media file URL as an
   encoded `source` parameter.
4. The reader's browser fetches the project, runs it locally, and keeps any
   working recovery state in that browser only.
5. Reader changes can leave the browser only through explicit local export.

Drupal must add
`Access-Control-Allow-Origin: https://breadboardlab.example.com` to
`.chiphippo` Media responses. No credentials are needed or permitted.

## Immediate next work

1. Extract a documented platform contract and run it against both adapters.
2. Complete memory programming/import/export and preserve ROM GUID copy rules.
3. Add browser end-to-end coverage for placing, wiring, running, saving, and
   reloading a representative 74LS00 circuit.
4. Exercise lesson and Media Library project embeds, reset, browser-local
   recovery, Open full workbench, and the validated `postMessage` protocol
   inside the real Drupal/CKEditor module.
5. Acceptance-test the production Nginx, CSP, CORS, and `frame-ancestors`
   policies on the chosen lab subdomain.
