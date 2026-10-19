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

/**
 * The host websites this copy of Chip Hippo Web works with: the sites that may
 * embed it in an iframe, supply project files to an embed, and receive saved
 * circuits. There is NO default. A stock build serves the standalone workbench
 * and trusts no outside site.
 *
 * The list is set when the app is built (`CHIPHIPPO_SITE_ORIGINS`, a
 * comma-separated list of origins, see scripts/build-web.mjs) and arrives in the
 * page as `<meta name="chiphippo-site-origins" content="…">`. The server reads
 * the SAME variable for its framing and connection headers, so set it
 * identically in both places. The first origin is the one "Save to site"
 * proposes.
 */

/** Parse a comma-separated origin list, keeping only well-formed http(s) origins. */
export function parseOrigins(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter((item) => /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(item));
}

/** The origins baked into this build; empty outside a browser or when unset. */
export function siteOrigins(documentRef = globalThis.document) {
  const meta = documentRef?.querySelector?.(
    'meta[name="chiphippo-site-origins"]',
  );
  return parseOrigins(meta?.getAttribute("content"));
}
