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

// example-library.js — the Example Library dialog (web edition). A searchable
// list of the bundled example circuits (src/web/examples), grouped by category.
// Each entry offers two things:
//
//   Open as new desktop       adds it to the project as its own tab;
//   Insert into this desktop  arms it as a placement ghost on the desk that is
//                             open, so it can be dropped beside work already
//                             there (the same path a generated design takes).
//
// The dialog knows nothing about the desk: it reads the library through the
// platform bridge (`bridge.examples.list/read`) and hands the loaded project
// to the caller's two callbacks. Pure data work lives in model/example-library.js.

import { el, clear } from "../dom.js";
import { t } from "../i18n.js";
import { filterExamples, groupExamples } from "../model/example-library.js";
import { PopupManager } from "../popup-manager.js";

export class ExampleLibraryDialog {
  static #open = false;

  /**
   * Show the library (a no-op when it is already open).
   * @param {object} opts
   * @param {{examples?: {list: Function, read: Function}}} opts.bridge
   * @param {(entry: object, project: object) => (void|Promise<void>)} opts.onOpen
   * @param {(entry: object, project: object) => (void|Promise<void>)} opts.onInsert
   */
  static open({ bridge, onOpen, onInsert }) {
    if (ExampleLibraryDialog.#open || !bridge?.examples) return;
    ExampleLibraryDialog.#open = true;

    let all = [];
    let busy = false;
    const status = el("p", { class: "example-library-status", text: t("examples.loading") }); // prettier-ignore
    const list = el("div", { class: "example-library-list" });
    const search = el("input", {
      class: "example-library-search",
      type: "search",
      placeholder: t("examples.search"),
      "aria-label": t("examples.search"),
      autocomplete: "off",
      onInput: () => render(),
    });

    /** Load the project, run the action, and close on success. */
    const act = async (entry, run, button) => {
      if (busy) return;
      busy = true;
      list.querySelectorAll("button").forEach((b) => (b.disabled = true));
      try {
        const project = await bridge.examples.read(entry.id);
        if (!project) throw new Error("the example file is missing");
        PopupManager.close();
        await run(entry, project);
      } catch (error) {
        console.error("[renderer] example library failed:", error);
        busy = false;
        list.querySelectorAll("button").forEach((b) => (b.disabled = false));
        status.hidden = false;
        status.textContent = t("examples.failedOpen", { title: entry.title });
        button?.focus();
      }
    };

    const row = (entry) =>
      el("article", { class: "example-library-item" }, [
        el("h3", { class: "example-library-name", text: entry.title }),
        entry.description
          ? el("p", { class: "example-library-desc", text: entry.description })
          : null,
        el("div", { class: "example-library-actions" }, [
          entry.parts != null
            ? el("span", {
                class: "example-library-meta",
                text: t("examples.parts", { parts: entry.parts }),
              })
            : null,
          el("button", {
            class: "btn",
            type: "button",
            text: t("examples.open"),
            title: t("examples.openTitle"),
            onClick: (event) => act(entry, onOpen, event.currentTarget),
          }),
          el("button", {
            class: "btn btn--primary",
            type: "button",
            text: t("examples.insert"),
            title: t("examples.insertTitle"),
            onClick: (event) => act(entry, onInsert, event.currentTarget),
          }),
        ]),
      ]);

    function render() {
      clear(list);
      const shown = filterExamples(all, search.value);
      status.hidden = shown.length > 0;
      if (!shown.length) {
        status.textContent = all.length
          ? t("examples.empty")
          : t("examples.none");
        return;
      }
      for (const { category, examples } of groupExamples(shown)) {
        list.append(
          el("section", { class: "example-library-group" }, [
            el("h2", { class: "example-library-category", text: category }),
            ...examples.map(row),
          ]),
        );
      }
    }

    PopupManager.dialog({
      title: t("examples.title"),
      className: "example-library-popup",
      bodyClass: "example-library-body",
      body: [search, status, list],
      onClose: () => {
        ExampleLibraryDialog.#open = false;
      },
    });
    search.focus();

    Promise.resolve(bridge.examples.list())
      .then((entries) => {
        all = entries ?? [];
        render();
      })
      .catch((error) => {
        console.error("[renderer] example library list failed:", error);
        status.hidden = false;
        status.textContent = t("examples.failedLoad");
      });
  }
}
