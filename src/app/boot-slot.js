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

// boot-slot.js — what startup does with a working slot it could not READ
// (main.js `openBootProject`). Its own module so it tests without Electron.
"use strict";

/**
 * The working slot is THERE and could not be read — an I/O failure, not a
 * damaged file (that reads as null, set aside by io.readJSON). NOT READ is not
 * unreadable: it says nothing about the work in it, which may be the only
 * copy, and the boot that follows would take the slot over (a new project
 * deletes it; a recent project's autosave writes over it). So it is moved
 * aside, never deleted — and if even that fails, HELD where it is (nothing
 * this session writes or removes it; the next launch reads it again). Either
 * way the user is told where it is — as FACTS, `{key, path}`, which the
 * renderer words in the user's language (ProjectWorkspace `#warn`).
 */
function keepUnreadSlot(store, notes, err) {
  console.error("[main] project:boot: the working slot could not be read:", err && err.message); // prettier-ignore
  let aside = null;
  try {
    aside = store.setAsideDefaultProject();
  } catch (moveErr) {
    console.error("[main] project:boot: could not set it aside:", moveErr && moveErr.message); // prettier-ignore
    store.holdDefaultProject();
    notes.push({ key: "workspace.slotLeft", path: store.defaultProjectPath });
    return;
  }
  // (Null: the file went between the failed read and the move — nothing to keep.)
  if (aside) {
    notes.push({ key: "workspace.slotAside", path: aside });
  }
}

/**
 * Run the boot, and if it THROWS part-way, answer with a new project rather
 * than an error — never at the cost of the slot. The renderer meets a failed
 * boot with `project:new`, which takes the slot over, and the slot may hold
 * work the boot never got as far as showing (a recovery it had just read, when
 * a bookmark write after it failed). So the slot is kept exactly as an unread
 * one is (`keepUnreadSlot`: moved aside, or held, and said); the new project
 * is then written to the slot set free, or — held — nowhere.
 *
 * @param {object} store - the ProjectStore.
 * @param {() => object} boot - the boot proper (main.js `bootProject`).
 * @returns {object} the project to open.
 */
function bootKeepingSlot(store, boot) {
  try {
    return boot();
  } catch (err) {
    const notes = [];
    let there = false;
    try {
      there = store.hasDefaultProject();
    } catch {
      there = true; // could not even ask: treat it as there, and keep it
    }
    if (there) keepUnreadSlot(store, notes, err);
    else console.error("[main] project:boot failed:", err && err.message);
    const meta = store.newProject();
    if (notes.length) meta.warnings = notes;
    return meta;
  }
}

module.exports = { keepUnreadSlot, bootKeepingSlot };
