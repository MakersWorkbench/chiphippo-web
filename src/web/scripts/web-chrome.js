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

import { booted } from "./app.js";

const bridge = window.chiphippo;

if (bridge?.platform === "web" && bridge.web?.mode === "app") {
  await booted;

  const [newProject, openProject, saveProject, saveProjectAs] =
    document.querySelectorAll(".toolbar-pill--file > button");
  if (newProject && openProject && saveProject && saveProjectAs) {
    openProject.setAttribute("aria-label", "Import project");
    openProject.title = "Import a .chiphippo project from this device";
    saveProject.setAttribute("aria-label", "Export project");
    saveProject.title = "Export this project to its local .chiphippo file";
    saveProjectAs.setAttribute("aria-label", "Export project as");
    saveProjectAs.title = "Export this project to a new local .chiphippo file";
  }

  const actions = document.querySelector(".header-icon-panel");
  if (actions) {
    const guide = document.createElement("button");
    guide.type = "button";
    guide.className = "web-action";
    guide.textContent = "Guide";
    guide.title = "Open the Chip Hippo user guide";
    guide.addEventListener("click", () => bridge.docs.open());

    const source = document.createElement("a");
    source.className = "web-action";
    source.href = "https://github.com/MakersWorkbench/chiphippo-web";
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = "Source";
    source.title = "Chip Hippo source code (GPL-3.0-or-later)";

    actions.prepend(guide, source);
  }
}
