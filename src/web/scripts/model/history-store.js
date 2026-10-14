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

// history-store.js — the pure, DOM-free undo/redo core (Feature 200). It holds
// an ordered list of immutable document SNAPSHOTS with a cursor at the
// "present": everything before the cursor is undo history, everything after is
// the redo future. Undo/redo just walk the cursor and hand back the snapshot to
// restore — no per-mutator inverse code, so a new DeskDoc mutator needs no undo
// support of its own.
//
// The document is small and fully serializable (that is how autosave and dirty
// tracking already work), so whole-snapshot history is robust and cheap; if it
// ever grows heavy, structural sharing or diffing can slot in behind this same
// interface.
//
// PURE by contract: it takes no wall-clock of its own (the caller stamps each
// record with a monotonic `time`, matching the engine's determinism rule) and
// never clones — callers pass a fresh snapshot in and treat what comes back as
// read-only. Coalescing is OPT-IN per record (`coalesce: true`): only a run of
// same-label, same-flag records inside the time window collapses into one
// entry, so a burst of rapid param nudges is one undo step while genuinely
// distinct edits (each add / delete / paste / drag) always stand alone.
//
// SELECTION IS PART OF THE TIMELINE. Every entry carries the selection as it
// stood (an opaque, JSON-shaped value the caller owns), and a change of
// selection alone is an entry of its own (`recordSelection`) that shares the
// present's snapshot and its VERSION — so ⌘Z steps back through what was
// picked as well as through what was edited, and "I didn't mean that click"
// is an undo rather than a piece of hidden selection memory. The version is
// how a caller tells the two apart on the way back: an undo that lands on the
// same version changed only the selection and must not touch the document.

/** Default cap on history depth; the oldest entry is dropped past it. */
const DEFAULT_LIMIT = 100;

/** Default coalescing window (ms) for consecutive same-label opt-in records. */
const DEFAULT_COALESCE_MS = 400;

export class HistoryStore {
  #entries = []; // { snapshot, label, time, coalesce, selection, version }
  #index = -1; // cursor at the present entry; -1 when empty
  #limit;
  #coalesceMs;
  #frozen = false;

  /**
   * @param {object} [opts]
   * @param {number} [opts.limit] - max entries retained (oldest dropped past it).
   * @param {number} [opts.coalesceMs] - window for same-label coalescing.
   */
  constructor({
    limit = DEFAULT_LIMIT,
    coalesceMs = DEFAULT_COALESCE_MS,
  } = {}) {
    this.#limit = Math.max(1, Math.floor(limit));
    this.#coalesceMs = Math.max(0, coalesceMs);
  }

  /** Is there a prior snapshot to undo to? */
  get canUndo() {
    return this.#index > 0;
  }

  /** Is there an undone snapshot to redo to? */
  get canRedo() {
    return this.#index >= 0 && this.#index < this.#entries.length - 1;
  }

  /** The number of retained entries (past + present + future). */
  get size() {
    return this.#entries.length;
  }

  /** The present entry's label, or null when empty. */
  get label() {
    return this.#index >= 0 ? this.#entries[this.#index].label : null;
  }

  /** The selection recorded with the present entry (null when none was). */
  get selection() {
    return this.#entries[this.#index]?.selection ?? null;
  }

  /** The present entry's DOCUMENT version: it moves on every document record
      and never on a selection-only one, so two entries with the same version
      hold the same document. -1 while empty. */
  get version() {
    return this.#entries[this.#index]?.version ?? -1;
  }

  /** While frozen, `record` is a no-op (history is paused during a run). */
  get frozen() {
    return this.#frozen;
  }

  freeze() {
    this.#frozen = true;
  }

  unfreeze() {
    this.#frozen = false;
  }

  /**
   * Reset the stack. With a `snapshot`, seed it as the sole (present) entry —
   * the fresh baseline a New/Open lands on; without one, leave it empty.
   */
  clear(snapshot = null, label = "load") {
    this.#entries = [];
    this.#index = -1;
    this.#frozen = false;
    if (snapshot != null) this.record(snapshot, label, 0);
  }

  /**
   * Push `snapshot` as the new present, dropping any redo future. A no-op while
   * frozen. When `coalesce` is set AND the present entry is a coalescing record
   * of the same label within the time window, the present entry is UPDATED in
   * place instead — so a burst collapses to one undo step whose baseline is the
   * state before the burst began.
   *
   * @param {object} snapshot - a plain, already-cloned document (kept as-is).
   * @param {string} [label] - drives coalescing + a future history UI.
   * @param {number} [time] - caller-stamped monotonic time (no Date here).
   * @param {{coalesce?: boolean, selection?: any}} [opts] - `selection` is
   *   the selection to restore along with this snapshot (kept as given).
   * @returns {object[]} snapshots permanently dropped by this call (the
   *   truncated redo future, and/or the oldest entries evicted past the
   *   depth limit) — never returned to the caller by undo/redo again. A
   *   caller that owns resources keyed by something INSIDE a snapshot (e.g. a
   *   ROM chip's backing file, keyed by its GUID) can release one once it no
   *   longer appears in any snapshot `snapshots()` still retains.
   */
  record(
    snapshot,
    label = "edit",
    time = 0,
    { coalesce = false, selection = null } = {},
  ) {
    if (this.#frozen) return [];
    const present = this.#entries[this.#index];
    const canMerge =
      coalesce &&
      present != null &&
      present.coalesce &&
      present.label === label &&
      this.#index === this.#entries.length - 1 && // nothing to redo over
      time - present.time <= this.#coalesceMs;
    if (canMerge) {
      present.snapshot = snapshot;
      present.time = time;
      present.selection = selection;
      return [];
    }
    const version = (present?.version ?? -1) + 1;
    return this.#push({ snapshot, label, time, coalesce, selection, version });
  }

  /**
   * Push a change of SELECTION alone as the new present — the same document
   * (snapshot and version both shared with the present entry), a different
   * pick. A genuine step like any other, so it drops the redo future; a no-op
   * while frozen or empty.
   *
   * @param {any} selection
   * @param {number} [time]
   * @returns {object[]} snapshots permanently dropped (see `record`)
   */
  recordSelection(selection, time = 0) {
    if (this.#frozen) return [];
    const present = this.#entries[this.#index];
    if (!present) return [];
    return this.#push({
      snapshot: present.snapshot,
      label: "select",
      time,
      coalesce: false,
      selection,
      version: present.version,
    });
  }

  /** Append an entry as the present, truncating the redo future and the
      oldest entries past the limit; returns the snapshots dropped. */
  #push(entry) {
    let dropped = [];
    // A genuine new step invalidates the redo future.
    if (this.#index < this.#entries.length - 1) {
      dropped = this.#entries.slice(this.#index + 1).map((e) => e.snapshot);
      this.#entries.length = this.#index + 1;
    }
    this.#entries.push(entry);
    this.#index = this.#entries.length - 1;
    // Enforce the depth bound by dropping the oldest entries.
    if (this.#entries.length > this.#limit) {
      const drop = this.#entries.length - this.#limit;
      dropped = dropped.concat(
        this.#entries.slice(0, drop).map((e) => e.snapshot),
      );
      this.#entries.splice(0, drop);
      this.#index -= drop;
    }
    return dropped;
  }

  /** The present entry's snapshot (read-only), or null while empty. */
  get present() {
    return this.#entries[this.#index]?.snapshot ?? null;
  }

  /**
   * Rewrite the present entry's snapshot and every one in the redo future
   * with `fn(snapshot)` (null keeps one as it is) — no undo step added, none
   * dropped. For a fact about the document's state from now on that arrived
   * while it was off the desk (a ROM's file written: `markRomKept`); the past
   * is left as it was.
   */
  syncForward(fn) {
    if (this.#index < 0) return;
    // From the first entry holding the present's document: a selection step
    // just behind it shares that document, and must not hand back the old one.
    for (let i = this.#sameVersionStart(); i < this.#entries.length; i++) {
      const next = fn(this.#entries[i].snapshot);
      if (next) this.#entries[i].snapshot = next;
    }
  }

  /** Every currently-retained snapshot (past + present + future), read-only. */
  snapshots() {
    return this.#entries.map((e) => e.snapshot);
  }

  /** Step back one entry and return its snapshot, or null when at the start. */
  undo() {
    if (!this.canUndo) return null;
    this.#index -= 1;
    return this.#entries[this.#index].snapshot;
  }

  /** Step forward one entry and return its snapshot, or null when at the end. */
  redo() {
    if (!this.canRedo) return null;
    this.#index += 1;
    return this.#entries[this.#index].snapshot;
  }

  /**
   * Replace the present entry's snapshot without adding an undo step — used to
   * reconcile the history's notion of "present" with run-volatile persisted
   * effects (12 V damage, a switch flipped while running) after Stop, so a
   * later undo/redo stays consistent with the live document.
   */
  sync(snapshot) {
    if (this.#index < 0) return;
    const version = this.#entries[this.#index].version;
    // Every entry holding the present's document — the selection steps
    // around it share it, and a redo onto one must not restore the old copy.
    for (const entry of this.#entries) {
      if (entry.version === version) entry.snapshot = snapshot;
    }
  }

  /** The index of the earliest entry sharing the present's version. */
  #sameVersionStart() {
    const version = this.#entries[this.#index].version;
    let i = this.#index;
    while (i > 0 && this.#entries[i - 1].version === version) i -= 1;
    return i;
  }
}
