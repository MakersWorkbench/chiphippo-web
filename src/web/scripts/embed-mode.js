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

import { booted } from "./app.js";
import {
  DEFAULT_PARENT_ORIGINS,
  protocolMessage,
  validParentMessage,
} from "./embed-protocol.js";

const web = window.chiphippo?.web;

if (web?.mode === "embed" && (web.lessonId || web.projectId)) {
  await booted;

  const fullWorkbenchUrl = () => {
    if (!web.projectId) {
      return `/app/?lesson=${encodeURIComponent(web.lessonId)}`;
    }
    const path = `/p/${encodeURIComponent(web.projectId)}`;
    return web.projectSource
      ? `${path}?source=${encodeURIComponent(web.projectSource)}`
      : path;
  };

  const manifest = web.manifest ?? {};
  document.documentElement.classList.toggle(
    "embed-hide-palette",
    manifest.ui?.showPartsTray === false,
  );
  document.documentElement.classList.toggle(
    "embed-hide-tabs",
    manifest.ui?.showProjectTabs === false,
  );

  let parentOrigin = null;
  try {
    const referrerOrigin = document.referrer
      ? new URL(document.referrer).origin
      : null;
    if (DEFAULT_PARENT_ORIGINS.includes(referrerOrigin)) {
      parentOrigin = referrerOrigin;
    }
  } catch {
    // Direct-open embeds have no parent to notify.
  }

  const notifyParent = (type, detail) => {
    if (!parentOrigin || window.parent === window) return false;
    window.parent.postMessage(protocolMessage(type, detail), parentOrigin);
    return true;
  };

  window.addEventListener("message", async (event) => {
    if (!validParentMessage(event, window.parent, DEFAULT_PARENT_ORIGINS))
      return;
    parentOrigin = event.origin;
    if (event.data.type === "chiphippo.reset") {
      await web.resetContent();
      window.location.reload();
    } else if (
      event.data.type === "chiphippo.load-lesson" &&
      /^[a-z0-9-]+$/i.test(String(event.data.lessonId ?? ""))
    ) {
      window.location.assign(
        `/embed/${encodeURIComponent(event.data.lessonId)}`,
      );
    } else if (event.data.type === "chiphippo.open-full") {
      window.open(fullWorkbenchUrl(), "_blank", "noopener");
    }
  });

  window.addEventListener("chiphippo:doc-changed", () =>
    notifyParent("chiphippo.dirty", { dirty: true }),
  );
  window.addEventListener("chiphippo:sim-state", (event) =>
    notifyParent("chiphippo.run-state", {
      state: event.detail?.mode ?? event.detail?.state ?? "unknown",
    }),
  );

  const actions = document.querySelector(".header-icon-panel");
  if (actions) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "embed-action";
    reset.textContent = "Reset";
    reset.title = "Restore the lesson's starting circuit";
    reset.addEventListener("click", async () => {
      if (
        !window.confirm("Reset this lesson and discard your local changes?")
      ) {
        return;
      }
      await web.resetContent();
      window.location.reload();
    });

    const open = document.createElement("a");
    open.className = "embed-action embed-action--primary";
    open.href = fullWorkbenchUrl();
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "Open full workbench";
    open.hidden = manifest.ui?.showOpenFull === false;
    open.addEventListener("click", () =>
      notifyParent("chiphippo.open-full", {
        lessonId: web.lessonId,
        projectId: web.projectId,
      }),
    );

    actions.prepend(reset, open);
  }

  const reportHeight = () =>
    notifyParent("chiphippo.height", {
      height: Math.ceil(
        document.documentElement.getBoundingClientRect().height,
      ),
    });
  new ResizeObserver(reportHeight).observe(document.documentElement);
  const content = { lessonId: web.lessonId, projectId: web.projectId };
  notifyParent("chiphippo.ready", content);
  notifyParent("chiphippo.loaded", content);
}
