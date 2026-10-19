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

// capture-circuit.mjs — a PNG screenshot of a circuit, for an article.
//
//   node scripts/capture-circuit.mjs <project.chiphippo | http(s) URL> --out shot.png
//        [--width 1280] [--height 720] [--scale 2]
//        [--run 3]              press Run and let it run that many seconds
//        [--click "<css>"]...   click an element first (repeatable), e.g. a switch
//        [--eval "<js>"]        run JavaScript in the page before the capture
//        [--wait 1500]          extra milliseconds after the page is ready
//        [--no-crop] [--margin 24]   keep the whole picture / change the margin around the circuit
//        [--no-fit]             keep the lab's own framing instead of fitting the circuit
//        [--chrome none|full]   none (default): the desk only; full: the whole app
//        [--browser <path>]     a Chromium-based browser (Edge, Chrome, Brave)
//
// A project file is served to the lab by a small local server built from the
// source tree (no build needed); a URL is opened as given. The page is driven
// through the browser's DevTools protocol over Node's own WebSocket, so there
// is nothing to install: it needs Node 22+ and any installed Chromium browser.
// With --scale 2 the PNG has twice the pixels of the page, which is what a
// crisp article image wants.

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Arguments ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(["--out", "--width", "--height", "--scale", "--run", "--click", "--eval", "--wait", "--chrome", "--browser"]); // prettier-ignore
const flagAll = (name) =>
  argv.flatMap((a, i) => (a === name ? [argv[i + 1]] : []));
const flag = (name, fallback = null) => flagAll(name)[0] ?? fallback;
const input = argv.find(
  (a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1]),
);
if (!input || !flag("--out")) {
  console.error('usage: node scripts/capture-circuit.mjs <project.chiphippo | URL> --out shot.png [--width 1280] [--height 720] [--scale 2] [--run 3] [--click "css"] [--eval "js"] [--chrome none|full]'); // prettier-ignore
  process.exit(2);
}
const width = Number(flag("--width", 1280));
const height = Number(flag("--height", 720));
const scale = Number(flag("--scale", 2));
const runSeconds = flag("--run") == null ? null : Number(flag("--run"));
const settle = Number(flag("--wait", 1500));
const chrome = flag("--chrome", "none");
const out = resolve(flag("--out"));

// ── A browser to drive ──────────────────────────────────────────────────────

function findBrowser() {
  const given = flag("--browser") ?? process.env.CHROME_PATH;
  if (given) return given;
  const candidates = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}
const browserPath = findBrowser();
if (!browserPath) {
  console.error(
    "no Chromium-based browser found: pass --browser <path> or set CHROME_PATH",
  );
  process.exit(2);
}

// ── The page to open ────────────────────────────────────────────────────────

let server = null;
let url = input;
if (!/^https?:\/\//i.test(input)) {
  const file = resolve(input);
  if (!existsSync(file)) {
    console.error(`no such file: ${file}`);
    process.exit(2);
  }
  const { createChipHippoServer } = await import(pathToFileURL(join(root, "server", "chiphippo-server.mjs")).href); // prettier-ignore
  const lab = createChipHippoServer({ webRoot: join(root, "src", "web") });
  const body = readFileSync(file);
  server = createServer((req, res) => {
    if (req.url?.startsWith("/files/capture.chiphippo")) {
      res.writeHead(200, {
        "content-type": "application/json",
        "content-length": body.length,
      });
      res.end(body);
    } else {
      lab.emit("request", req, res);
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  url = `${origin}/embed/project/capture?source=${encodeURIComponent(`${origin}/files/capture.chiphippo`)}`;
}

// ── DevTools protocol, minimal ──────────────────────────────────────────────

const profile = mkdtempSync(join(tmpdir(), "chiphippo-capture-"));
const child = spawn(
  browserPath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    `--window-size=${width},${height}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function devtoolsPort() {
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100; i++) {
    if (existsSync(portFile))
      return Number(readFileSync(portFile, "utf8").split("\n")[0]);
    await sleep(100);
  }
  throw new Error("the browser did not start");
}

async function connect(port) {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    const list = await fetch(`http://127.0.0.1:${port}/json`).then((r) =>
      r.json(),
    );
    target = list.find((t) => t.type === "page");
    if (!target) await sleep(100);
  }
  if (!target) throw new Error("no page to drive");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener("open", resolveOpen, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve: done, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else done(message.result);
    }
  });
  return {
    send: (method, params = {}) =>
      new Promise((done, reject) => {
        const n = ++id;
        pending.set(n, { resolve: done, reject });
        ws.send(JSON.stringify({ id: n, method, params }));
      }),
    close: () => ws.close(),
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); // prettier-ignore
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ?? "script failed",
    );
  }
  return result.result.value;
}

let exitCode = 0;
try {
  const cdp = await connect(await devtoolsPort());
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false }); // prettier-ignore
  await cdp.send("Page.navigate", { url });

  // Ready: the desk exists and a board is drawn (or 20 s have passed).
  const ready = `!!document.querySelector(".desk-viewport") && document.querySelectorAll(".board").length > 0`;
  let up = false;
  for (let i = 0; i < 200 && !up; i++) {
    up = await evaluate(cdp, ready).catch(() => false);
    if (!up) await sleep(100);
  }
  if (!up) throw new Error("the lab did not show a circuit in 20 seconds");
  await sleep(settle);

  if (chrome === "none") {
    await evaluate(
      cdp,
      `
      const css = document.createElement("style");
      css.textContent = ".app-header, .palette-panel, .palette-rail, .project-tabs, .desk-zoom, .desk-lock { display: none !important; }";
      document.head.append(css);
      document.documentElement.classList.add("embed-hide-palette", "embed-hide-tabs");
    `,
    );
    await sleep(300);
  }
  // Frame the circuit to fill the picture, as the Fit button does.
  if (!argv.includes("--no-fit")) {
    await evaluate(
      cdp,
      `document.querySelector('button[aria-label*="Fit" i]')?.click()`,
    );
    await sleep(600);
  }
  for (const selector of flagAll("--click")) {
    await evaluate(
      cdp,
      `document.querySelector(${JSON.stringify(selector)})?.click()`,
    );
    await sleep(300);
  }
  if (flag("--eval")) {
    await evaluate(cdp, flag("--eval"));
    await sleep(300);
  }
  if (runSeconds != null) {
    const pressed = await evaluate(
      cdp,
      `
      const run = [...document.querySelectorAll("button")].find((b) => /run/i.test(b.textContent) && !/stop|reset/i.test(b.textContent));
      run?.click(); !!run;
    `,
    );
    if (!pressed) throw new Error("could not find the Run button");
    await sleep(runSeconds * 1000);
  }

  // Crop to the circuit (boards, parts, wires and its caption) with a margin,
  // unless the whole picture was asked for.
  let clip = { x: 0, y: 0, width, height };
  if (!argv.includes("--no-crop")) {
    const box = await evaluate(
      cdp,
      `(() => {
        const nodes = document.querySelectorAll(
          ".board, .annotation, .annotation-text, [class^='part-'], [class*=' part-'], .wire, .wire-path, .wire-hit"
        );
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const node of nodes) {
          const r = node.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
          x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
        }
        return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
      })()`,
    );
    if (box) {
      const margin = Number(flag("--margin", 24));
      const x = Math.max(0, Math.floor(box.x0 - margin));
      const y = Math.max(0, Math.floor(box.y0 - margin));
      clip = {
        x,
        y,
        width: Math.min(width - x, Math.ceil(box.x1 + margin - x)),
        height: Math.min(height - y, Math.ceil(box.y1 + margin - y)),
      };
    }
  }
  const shot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    clip: { ...clip, scale: 1 },
  });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log(
    `captured ${out} (${Math.round(clip.width * scale)} x ${Math.round(clip.height * scale)} px)`,
  );
  cdp.close();
} catch (error) {
  console.error(`capture failed: ${error.message}`);
  exitCode = 1;
} finally {
  child.kill();
  server?.close();
  // The browser holds its profile open for a moment after it is killed.
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // a temp folder left behind is harmless
  }
}
process.exit(exitCode);
