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

// notices.js — which what's-new notices the desk's banner owes this user
// (components/notice-banner.js shows them). Pure, so the one decision in it —
// who counts as having used an earlier version — is held by a test rather than
// by remembering to install an old build.
//
// The evidence is main's `firstRunVersion` stamp (app/store/settings-store.js
// `firstRunPatch`): the version this machine first ran, or "legacy" for an
// install from before the stamp existed. A notice is owed to anyone whose
// first run is OLDER than the version that brought the change, and only until
// they close it — `dismissedNotices` holds the ids closed, for good. To say
// something again in a later version, add a notice with a NEW id.

/**
 * Every notice the app has to say, oldest first. `since` is the first version
 * that shipped the change, so anyone whose first run predates it knew the old
 * way. The text lives in the catalog under `notice.<key>`.
 *
 * - **drag-model-2026-10** — the selection & drag model (2026-10-14): a
 *   background drag bands rather than pans, a part drag carries its wiring,
 *   and ⇧ / ⌘ / ⌥ took new jobs. `since` is 1.4.3, the first version after
 *   the 1.4.2 that still had the old model — so it answers the same whatever
 *   number the next release goes out as.
 */
export const NOTICES = Object.freeze([
  Object.freeze({ id: "drag-model-2026-10", key: "dragModel", since: "1.4.3" }),
]);

/** The stamp main writes for an install that predates the stamp itself. */
export const LEGACY_VERSION = "legacy";

/** `x.y.z` → [x, y, z], or null for anything else ("legacy" included). */
function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(typeof v === "string" ? v : "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Order two versions: negative when `a` is older. Anything that is not
 * `x.y.z` — "legacy" above all — is older than every version that is.
 * Pre-release tails (`-beta.1`) are ignored: a notice is about a feature,
 * and a beta of a version already has it.
 */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/**
 * The notices owed, oldest first: those whose change came after this
 * machine's first run and that have not been closed. Nothing while the stamp
 * is missing — no evidence either way is no evidence of an upgrade.
 *
 * @param {{firstRunVersion?: string|null, dismissedNotices?: string[]}} settings
 * @param {readonly {id: string, key: string, since: string}[]} [notices]
 */
export function pendingNotices(settings, notices = NOTICES) {
  const first = settings?.firstRunVersion;
  if (typeof first !== "string" || first === "") return [];
  const closed = new Set(
    Array.isArray(settings.dismissedNotices) ? settings.dismissedNotices : [],
  );
  return notices.filter(
    (n) => !closed.has(n.id) && compareVersions(first, n.since) < 0,
  );
}
