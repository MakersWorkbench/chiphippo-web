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
 * Save to site (web edition only): POSTs the open project to the Drupal
 * chiphippo_embed module's /api/chiphippo/save-project endpoint, filing it as
 * a "Chip Hippo Project" media item ready to embed in an article.
 *
 * The site URL and API token (generated once at /admin/config/content/chiphippo
 * on the Drupal side) live in this browser's localStorage and go nowhere else.
 * This is a single-editor tool: a prompt-once flow is all the UI it needs.
 */

import { siteOrigins } from "./site-config.js";

const LS_URL_KEY = "chiphippo_drupal_save_url";
const LS_TOKEN_KEY = "chiphippo_drupal_save_token";

/** Tidy a typed site address. It must be the host the site finally serves from:
 * a cross-origin request cannot follow a redirect (bare domain to www). */
function canonicalSite(url) {
  return url.trim().replace(/\/+$/, "");
}

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getSaveConfig() {
  const url = read(LS_URL_KEY);
  const token = read(LS_TOKEN_KEY);
  return url && token ? { url: canonicalSite(url), token } : null;
}

export function setSaveConfig(url, token) {
  localStorage.setItem(LS_URL_KEY, canonicalSite(url));
  localStorage.setItem(LS_TOKEN_KEY, token.trim());
}

export function clearSaveConfig() {
  localStorage.removeItem(LS_URL_KEY);
  localStorage.removeItem(LS_TOKEN_KEY);
}

/** Ask for the site URL and token on first use; null when cancelled. */
export function ensureSaveConfig() {
  const existing = getSaveConfig();
  if (existing) return existing;
  const url = window.prompt(
    "Drupal site URL for Save to site (the address the site finally serves from, for example https://www.example.com):",
    siteOrigins()[0] ?? "",
  );
  if (!url) return null;
  const token = window.prompt(
    "API token (generate one at /admin/config/content/chiphippo on that site; it is shown only once):",
  );
  if (!token) return null;
  setSaveConfig(url, token);
  return getSaveConfig();
}

/**
 * @param {{url: string, token: string}} config
 * @param {{name: string, project: object}} payload
 * @returns {Promise<{mediaId: number, name: string, editUrl: string, projectFileUrl: string}>}
 */
export async function saveProjectToSite(config, payload) {
  let res;
  try {
    res = await fetch(`${config.url}/api/chiphippo/save-project`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      `Could not reach ${config.url}. Check the URL, and that the site's allowed origins include ${window.location.origin}.`,
    );
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Save failed (HTTP ${res.status}).`,
    );
  }
  return {
    mediaId: body.media_id,
    name: body.name,
    editUrl: body.edit_url,
    projectFileUrl: body.project_file_url,
  };
}

/**
 * The File-toolbar action: export, upload, report. A bad token clears itself
 * so the next click asks again.
 *
 * @param {{exportForUpload: () => Promise<object|null>}} workspace
 */
export async function saveToSite(workspace) {
  const config = ensureSaveConfig();
  if (!config) return;
  try {
    const payload = await workspace.exportForUpload();
    if (!payload) {
      window.alert("This project cannot be exported for upload.");
      return;
    }
    // The name is what an editor picks from in the article's embed dialog.
    const name = window.prompt(
      "Name for this circuit in the Media Library:",
      payload.name || "Untitled Circuit",
    );
    if (name === null) return; // cancelled
    const trimmed = name.trim() || "Untitled Circuit";
    payload.name = trimmed;
    payload.project = { ...payload.project, name: trimmed };
    const saved = await saveProjectToSite(config, payload);
    window.alert(
      `Saved to the Media Library as "${saved.name}".\n\nEdit it here:\n${saved.editUrl}`,
    );
  } catch (error) {
    // A wrong token or an unreachable URL is a bad saved setting: forget it so
    // the next click asks again instead of failing the same way forever.
    if (/token|^Could not reach/i.test(error.message)) clearSaveConfig();
    window.alert(`Save to site failed: ${error.message}`);
  }
}
