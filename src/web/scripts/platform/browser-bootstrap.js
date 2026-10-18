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

import { createBrowserPlatform } from "./browser-platform.js";
import { BrowserStorage } from "./browser-storage.js";

// Electron installs this object from preload.js before page scripts run. A
// normal browser has no preload, so install the browser implementation at the
// same boundary and let the existing renderer continue to use one contract.
if (!window.chiphippo) {
  window.chiphippo = createBrowserPlatform({ storage: new BrowserStorage() });
}

if (window.chiphippo.web?.mode === "embed") {
  document.documentElement.dataset.chiphippoMode = "embed";
}
