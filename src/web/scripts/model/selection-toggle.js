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

// selection-toggle.js — the pure half of the ADDITIVE selection gesture: the
// modifier-click that adds ONE item to the selection, or takes one back out,
// beside the rubber band (a drag from the background) that REPLACES the whole
// thing. See CLAUDE.md → "Selection".
//
// It lives out here for the reason part-move.js does — the two halves that are
// easy to get wrong are pure, and one of them is a PLATFORM branch, i.e. a
// piece of logic that by construction is only ever exercised on one side.

/**
 * Is this pointer event the add-to-selection chord?
 *
 * **⌘ on macOS, Ctrl everywhere else** — each platform's own additive-select
 * modifier, and the same split the app's shortcut glyphs already make.
 *
 * CTRL CANNOT BE IT ON A MAC, and the reason is worth keeping written down
 * because the key is the obvious one to reach for: there Ctrl-click IS the
 * system's secondary click. Admitting it would mean the press arriving as
 * button 2, and raising a `contextmenu` the desk would then have to SWALLOW —
 * one press cannot both toggle the selection and open a menu over the top of
 * it — so Ctrl-click would stop opening any context menu on the desk. ⌘ costs
 * none of that and is what every other list on the platform answers to.
 *
 * Option/Alt is excluded rather than merely ignored: a press with Option down
 * belongs to pin-targeting mode, so this chord must never quietly claim it
 * first — Option/Alt WITH this modifier is the lead chord
 * (`isLeadToggleEvent`). Shift only makes a drag bare, so it neither makes nor
 * unmakes the chord.
 *
 * @param {{metaKey?:boolean, ctrlKey?:boolean, shiftKey?:boolean,
 *          altKey?:boolean, button?:number}|null} e
 * @param {boolean} isMac
 * @returns {boolean}
 */
export function isToggleSelectEvent(e, isMac) {
  if (!e || e.altKey) return false;
  if (!(isMac ? e.metaKey : e.ctrlKey)) return false;
  // The PRIMARY button, so Ctrl+right-click off a Mac stays a right-click. An
  // event carrying no button at all is judged on its modifiers alone.
  return e.button == null || e.button === 0;
}

/**
 * Is this pointer event the add-a-LEAD chord — Option/Alt plus the platform's
 * additive modifier (⌥⌘ on macOS, Alt+Ctrl elsewhere)?
 *
 * Option/Alt alone picks one lead and REPLACES the selection, never adding to
 * it (pin-targeting mode); this chord is the one way a lead joins a set, so a
 * handful of wire ends and legs can be picked and dragged together. Same
 * platform split and primary-button rule as `isToggleSelectEvent`, and for
 * the same reasons; Shift neither makes nor unmakes it.
 *
 * @param {{metaKey?:boolean, ctrlKey?:boolean, altKey?:boolean,
 *          button?:number}|null} e
 * @param {boolean} isMac
 * @returns {boolean}
 */
export function isLeadToggleEvent(e, isMac) {
  if (!e?.altKey) return false;
  if (!(isMac ? e.metaKey : e.ctrlKey)) return false;
  return e.button == null || e.button === 0;
}

/**
 * A picked lead — `{kind: "lead", id, end}` (a two-terminal part's leg) or
 * `{kind: "wire-end", id, end}` — as the one string the `leads` set holds,
 * and back. Ids and ends never contain a colon.
 *
 * @param {{kind:string, id:string, end:string}} pick
 */
export function leadKey(pick) {
  return `${pick.kind}:${pick.id}:${pick.end}`;
}

/** The pick a `leadKey` names, or null for anything else. */
export function parseLeadKey(key) {
  const [kind, id, end, ...rest] = String(key ?? "").split(":");
  if (rest.length || !id || !end) return null;
  return kind === "lead" || kind === "wire-end" ? { kind, id, end } : null;
}

const KINDS = ["parts", "wires", "boards", "leads"];

/**
 * Toggle `ids` of one kind in a selection, returning the whole new selection.
 *
 * A call is **all-or-nothing**: a set already fully selected comes out, and
 * anything else goes in. That is what makes a BOARD work — a modifier-click on
 * one strip of a snapped kit toggles the whole group, and a group only PARTLY
 * selected (a marquee that caught two strips of three) completes rather than
 * half-clearing, which is an answer the next click can undo.
 *
 * The sets are kept apart because that is how the desk's selection is held:
 * parts, wires and boards each drive their own highlight, and a design clip
 * reads boards and parts separately. `leads` holds `leadKey` strings — the
 * wire ends and legs an Option/Alt+⌘/Ctrl-click picked.
 *
 * @param {{parts?:Iterable<string>, wires?:Iterable<string>,
 *          boards?:Iterable<string>, leads?:Iterable<string>}|null} current
 * @param {"parts"|"wires"|"boards"|"leads"} kind
 * @param {Iterable<string>} ids
 * @returns {{parts:string[], wires:string[], boards:string[], leads:string[]}}
 */
export function toggleSelection(current, kind, ids) {
  const next = {
    parts: new Set(current?.parts ?? []),
    wires: new Set(current?.wires ?? []),
    boards: new Set(current?.boards ?? []),
    leads: new Set(current?.leads ?? []),
  };
  const targets = [...(ids ?? [])];
  if (KINDS.includes(kind) && targets.length > 0) {
    const set = next[kind];
    const selected = targets.every((id) => set.has(id));
    for (const id of targets) {
      if (selected) set.delete(id);
      else set.add(id);
    }
  }
  return {
    parts: [...next.parts],
    wires: [...next.wires],
    boards: [...next.boards],
    leads: [...next.leads],
  };
}

/**
 * The one item a selection holds, as a `{kind, id}` single pick — or null when
 * it holds none or several.
 *
 * A modifier-click that lands on exactly one item COLLAPSES to the desk's
 * ordinary single pick, so an item selected this way behaves exactly as one
 * selected by a plain click: R rotates it, its Properties dialog opens. A
 * one-item multi-selection would look identical and quietly do none of that.
 *
 * One lead left is the ordinary single lead pick, for the same reason.
 *
 * @param {{parts:string[], wires:string[], boards:string[],
 *          leads?:string[]}} sel
 * @returns {{kind:string, id:string, end?:string}|null}
 */
export function singlePick(sel) {
  const leads = sel.leads ?? [];
  const total =
    sel.parts.length + sel.wires.length + sel.boards.length + leads.length;
  if (total !== 1) return null;
  if (sel.parts.length) return { kind: "part", id: sel.parts[0] };
  if (sel.wires.length) return { kind: "wire", id: sel.wires[0] };
  if (leads.length) return parseLeadKey(leads[0]);
  return { kind: "board", id: sel.boards[0] };
}
