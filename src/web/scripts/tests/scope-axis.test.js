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

// The logic analyzer's two x axes (model/scope-axis.js): Timing's scale
// ladder and its placement by each column's moment, and Transitions' slices,
// folds and settle-gap threshold.

import test from "node:test";
import assert from "node:assert/strict";

import {
  BREAK_PX,
  MARK_STEPS,
  MAX_TRACK_PX,
  SEC_PER_DIV,
  SLICE_PX,
  columnAtX,
  columnTimes,
  fitSecPerDiv,
  JOIN_S,
  joined,
  minSecPerDiv,
  normalizeAxisMode,
  stepSecPerDiv,
  timingAxis,
  transitionAxis,
} from "../model/scope-axis.js";

/** A column of one channel, "a": a level or bus word, and maybe volts. */
const col = (at, cell, volts = null) => ({
  at,
  cells: new Map([["a", cell]]),
  ...(volts == null ? {} : { volts: new Map([["a", volts]]) }),
});

test("the scale ladder runs 1-2-5 from 100 ns to 5000 s", () => {
  assert.equal(SEC_PER_DIV[0], 1e-7);
  assert.equal(SEC_PER_DIV.at(-1), 5000);
  assert.deepEqual(SEC_PER_DIV.slice(12, 18), [0.001, 0.002, 0.005, 0.01, 0.02, 0.05]); // prettier-ignore
  assert.equal(normalizeAxisMode("transitions"), "transitions");
  assert.equal(normalizeAxisMode(undefined), "timing");
});

test("Fit takes the finest step that shows the span, and a step is one rung", () => {
  // 800 px is eight divisions: 40 ms needs 5 ms each, 41 ms needs 10.
  assert.equal(fitSecPerDiv(0.04, 800), 0.005);
  assert.equal(fitSecPerDiv(0.041, 800), 0.01);
  assert.equal(fitSecPerDiv(0, 800), SEC_PER_DIV[0], "nothing yet: the finest");
  assert.equal(stepSecPerDiv(0.005, -1), 0.002);
  assert.equal(stepSecPerDiv(0.005, 1), 0.01);
  assert.equal(stepSecPerDiv(SEC_PER_DIV[0], -1), SEC_PER_DIV[0]);
  assert.equal(stepSecPerDiv(5000, 1), 5000);
  // Held to the trace's floor: no finer than the track can be wide.
  const floor = minSecPerDiv(10);
  assert.ok((10 / floor) * 100 <= MAX_TRACK_PX);
  assert.equal(stepSecPerDiv(floor, -1, floor), floor);
});

test("each column's moment never goes back, and one with none sits at the last", () => {
  const times = columnTimes([{ at: 1 }, {}, { at: 0.5 }, { at: 3 }]);
  assert.deepEqual([...times], [1, 1, 1, 3]);
});

test("Timing puts each column at its moment, the right edge at the run's end", () => {
  const cols = [col(0.1, "L"), col(0.1025, "H"), col(0.11, "L")];
  const axis = timingAxis(cols, { secPerDiv: 0.001, end: 0.12 });
  // 1 ms a 100 px division: 100 000 px a second, from the first column.
  assert.equal(axis.t0, 0.1);
  assert.deepEqual([...axis.xs].map((x) => Math.round(x)), [0, 250, 1000, 2000]); // prettier-ignore
  assert.equal(Math.round(axis.width), 2000);
  // An end before the last column is no end: the trace stops there.
  assert.equal(Math.round(timingAxis(cols, { secPerDiv: 0.001, end: 0 }).width), 1000); // prettier-ignore
});

test("Transitions: a slice per change; a long steady run is a marked break, a short one folds away", () => {
  const cols = [
    col(0, "L"),
    col(1, "H"),
    col(2, "H"),
    col(3, "H"),
    col(7, "L"),
    col(8, "L"),
  ];
  const axis = transitionAxis(cols, ["a"], { gapPercent: 1, fullScale: 5, end: 9 }); // prettier-ignore
  const S = SLICE_PX;
  const B = BREAK_PX;
  assert.deepEqual([...axis.changed], [1, 1, 0, 0, 1, 0]);
  // The trace steps a second at a time, so a fold is marked past four: the
  // H held from 1 s to 7 s is; the L's last two seconds are not.
  assert.equal(MARK_STEPS, 4);
  assert.deepEqual([...axis.xs], [0, S, 2 * S, 2 * S + B, 2 * S + B, 3 * S + B, 3 * S + B]); // prettier-ignore
  assert.deepEqual(axis.breaks, [{ x: 2 * S, from: 1, to: 7 }]);
});

test("Transitions measures a voltage against what was last SHOWN, so a creep adds up", () => {
  // 0.02 V a sample on a 5 V scale; the 1 % gap is 0.05 V.
  const cols = Array.from({ length: 11 }, (_, k) => col(k, "H", 4 + 0.02 * k));
  const axis = transitionAxis(cols, ["a"], { gapPercent: 1, fullScale: 5 });
  // Shown at 4.00, then 4.06, 4.12, 4.18 — every third sample.
  assert.deepEqual([...axis.changed], [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  // A truly flat voltage folds for good.
  const flat = Array.from({ length: 6 }, (_, k) => col(k, "H", 4));
  assert.deepEqual([...transitionAxis(flat, ["a"], { gapPercent: 1, fullScale: 5 }).changed], [1, 0, 0, 0, 0, 0]); // prettier-ignore
});

test("Transitions: a level, a bus word or a voltage turning into a level is a change by identity", () => {
  const cols = [col(0, 3), col(1, 3), col(2, 4), col(3, "H", 4.4), col(4, "H")];
  const axis = transitionAxis(cols, ["a"], { gapPercent: 10, fullScale: 5 });
  assert.deepEqual([...axis.changed], [1, 0, 1, 1, 1]);
});

test("Transitions: any drawn channel's change is the column's; one not drawn is not", () => {
  const two = (a, b) => ({
    at: 0,
    cells: new Map([
      ["a", a],
      ["b", b],
    ]),
  });
  const cols = [two("L", "L"), two("L", "H"), two("L", "H")];
  assert.deepEqual([...transitionAxis(cols, ["a", "b"], { gapPercent: 1, fullScale: 5 }).changed], [1, 1, 0]); // prettier-ignore
  assert.deepEqual([...transitionAxis(cols, ["a"], { gapPercent: 1, fullScale: 5 }).changed], [1, 0, 0]); // prettier-ignore
});

test("the column under an x is the last whose edge is at or before it", () => {
  const xs = Float64Array.from([0, 10, 10, 20, 30]); // column 1 folded away
  assert.equal(columnAtX(xs, -5), 0);
  assert.equal(columnAtX(xs, 5), 0);
  assert.equal(columnAtX(xs, 10), 2, "a fold reads as the column after it");
  assert.equal(columnAtX(xs, 25), 3);
  assert.equal(columnAtX(xs, 99), 3);
  assert.equal(columnAtX(Float64Array.from([0]), 4), 0);
});

test("two voltage samples are one curve only a display frame apart", () => {
  const times = Float64Array.from([0, 1 / 30, 1, 1.002]);
  assert.equal(joined(times, 0), false, "the first sample starts the trace");
  assert.equal(joined(times, 1), true);
  assert.equal(joined(times, 2), false, "a second's silence: it had arrived");
  assert.equal(joined(times, 3), true);
  assert.ok(JOIN_S > 1 / 30 && JOIN_S < 0.1);
});
