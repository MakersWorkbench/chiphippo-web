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

// notice-banner.js — the what's-new bar across the top of the window, between
// the toolbar and the desk: a title, a few lines, and an ✕. It stays until the
// ✕ is clicked, and a closed notice is closed for good. WHICH notices are owed
// is decided elsewhere (model/notices.js, from main's first-run stamp); this
// only shows them, one at a time, oldest first, and reports each close to the
// one parent that made it (app.js persists it).
//
// Persistent chrome, so it relabels in place on a language change
// (`relocalize`, from app.js's relabeller): the words come from the catalog
// under `notice.<key>`, the modifier glyphs from the platform.

import { el, clear } from "../dom.js";
import { t } from "../i18n.js";

/** The keyboard's own glyphs, by platform rather than by locale — the same
    split keyboard-shortcuts.js makes. */
function keyGlyphs() {
  const isMac = window.chiphippo?.platform === "darwin";
  return {
    mod: isMac ? "⌘" : "Ctrl",
    alt: isMac ? "⌥" : "Alt",
    shift: isMac ? "⇧" : "Shift",
  };
}

/** The lines each notice shows, in order: `notice.<key>.<line>`. */
const LINES = Object.freeze({
  dragModel: ["band", "pickLead", "toggle", "carry", "bare", "pan"],
});

export class NoticeBanner {
  #el;
  #queue;
  #onDismiss;

  /**
   * @param {HTMLElement} container - where the bar goes (app.js inserts it
   *   between the header and the main row).
   * @param {{notices: {id: string, key: string}[],
   *          onDismiss: (id: string) => void,
   *          before?: Node|null}} opts - `notices`: those owed, oldest first;
   *   `onDismiss`: called with a notice's id as its ✕ is clicked; `before`:
   *   the node to insert ahead of (appended when absent).
   */
  constructor(container, { notices, onDismiss, before = null }) {
    this.#queue = [...notices];
    this.#onDismiss = onDismiss;
    this.#el = el("section", { class: "notice-banner", role: "region" });
    container.insertBefore(this.#el, before);
    this.#render();
  }

  /** The bar's element (for tests). */
  get element() {
    return this.#el;
  }

  /** Whether a notice is still showing. */
  get showing() {
    return this.#queue.length > 0;
  }

  /** Re-read every word in the current language. */
  relocalize() {
    this.#render();
  }

  #dismiss() {
    const [notice] = this.#queue.splice(0, 1);
    if (notice) this.#onDismiss?.(notice.id);
    this.#render();
  }

  #render() {
    const notice = this.#queue[0];
    if (!notice) {
      this.#el.remove();
      return;
    }
    const k = `notice.${notice.key}`;
    const keys = keyGlyphs();
    const title = t(`${k}.title`);
    this.#el.setAttribute("aria-label", title);
    clear(this.#el).append(
      el("div", { class: "notice-banner-body" }, [
        el("h2", { class: "notice-banner-title", text: title }),
        el(
          "ul",
          { class: "notice-banner-list" },
          (LINES[notice.key] ?? []).map((line) =>
            el("li", { text: t(`${k}.${line}`, keys) }),
          ),
        ),
      ]),
      el("button", {
        class: "notice-banner-close",
        type: "button",
        title: t("common.close"),
        "aria-label": t("common.close"),
        text: "✕",
        onClick: () => this.#dismiss(),
      }),
    );
  }
}
