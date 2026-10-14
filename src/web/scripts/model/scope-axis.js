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

// scope-axis.js — where the logic analyzer puts each recorded column across
// its lanes. Pure and DOM-free: the view hands it the recorder's columns and
// draws at the x positions it hands back. Two modes over the same columns:
//
//   timing       x IS simulated time — each column at its own `at` (the
//                moment its tick ran), at a per-division scale the user zooms
//                through a 1-2-5 ladder, or fitted to the panel. A level
//                holds from its sample to the next. A voltage is joined
//                straight to the next sample only when that sample is a
//                display frame away (`joined`): Spice Lite draws a node with
//                frames for as long as it is still moving by more than the
//                settle gap, so frame-spaced samples ARE its curve, and a
//                longer silence means it had arrived — it is held there, and
//                steps where the event that next moved it lands.
//   transitions  x advances by CHANGE: a column where any watched value
//                moved gets a fixed slice; a run of columns where nothing did
//                folds into one narrow break, marked so the eye knows time
//                was cut out there.
//
// The analyzer samples on the engine's own events (every tick, plus Spice
// Lite's display frames while a node is still moving), never on a clock of
// its own — so a value is "unchanged" in transitions mode against the value
// last SHOWN, not the sample before: a capacitor creeping up in steps each
// under the threshold still adds a slice whenever the creep adds up to one,
// while a truly flat stretch never does. The threshold is Spice Lite's settle
// gap, read as a share of the lane's full scale — the same percentage at
// which the engine calls a node arrived and stops drawing it.

import { ANALOG_FRAME_S } from "../sim/spice/sample.js";

/** The two x-axis modes, the first the default. */
export const AXIS_MODES = Object.freeze(["timing", "transitions"]);

/** A stored mode, or the default for anything that is not one. */
export function normalizeAxisMode(mode) {
  return AXIS_MODES.includes(mode) ? mode : AXIS_MODES[0];
}

/** One division's width, CSS px (timing mode's grid). */
export const PX_PER_DIV = 100;

/** A transition's slice, and a folded steady run's break, CSS px. */
export const SLICE_PX = 10;
export const BREAK_PX = 4;

/** The widest the lanes may become, CSS px — under the 2^24 a browser lays
    out and scrolls without losing precision. A zoom that would pass it is
    refused, and a growing trace at a fixed scale steps the scale out. */
export const MAX_TRACK_PX = 16_000_000;

/** Seconds per division, 1-2-5 from 100 ns to 5000 s. */
export const SEC_PER_DIV = Object.freeze(
  (() => {
    const out = [];
    for (let e = -7; e <= 3; e += 1) {
      for (const m of [1, 2, 5]) out.push(Number((m * 10 ** e).toPrecision(1)));
    }
    return out;
  })(),
);

/** The ladder index at or above `secPerDiv` (the last for anything past it). */
function ladderIndex(secPerDiv) {
  const i = SEC_PER_DIV.findIndex((s) => s >= secPerDiv * (1 - 1e-9));
  return i === -1 ? SEC_PER_DIV.length - 1 : i;
}

/**
 * The finest ladder scale that shows `span` seconds within `widthPx` — what
 * Fit uses, and the floor a fixed scale is held to as the trace grows.
 * @param {number} span - seconds
 * @param {number} widthPx
 */
export function fitSecPerDiv(span, widthPx) {
  const divisions = Math.max(1, widthPx / PX_PER_DIV);
  if (!(span > 0)) return SEC_PER_DIV[0];
  return SEC_PER_DIV[ladderIndex(span / divisions)];
}

/** The finest scale a `span` may be drawn at within MAX_TRACK_PX. */
export function minSecPerDiv(span) {
  return fitSecPerDiv(span, MAX_TRACK_PX);
}

/**
 * One ladder step from `secPerDiv`: `+1` coarser (zoom out), `-1` finer (zoom
 * in), held to the ladder's ends and to `floor` (minSecPerDiv of the trace).
 */
export function stepSecPerDiv(secPerDiv, dir, floor = SEC_PER_DIV[0]) {
  const i = ladderIndex(secPerDiv) + Math.sign(dir);
  const next = SEC_PER_DIV[Math.max(0, Math.min(SEC_PER_DIV.length - 1, i))];
  return Math.max(next, floor);
}

/**
 * Each column's simulated moment, seconds, never going back: a column with
 * no `at` (a hand-fed recording; every run's columns carry one) sits at the
 * one before it.
 * @param {Array<{at?: number}>} columns
 * @returns {Float64Array}
 */
export function columnTimes(columns) {
  const times = new Float64Array(columns.length);
  let last = 0;
  columns.forEach((col, k) => {
    const at = Number.isFinite(col.at) ? col.at : last;
    last = k === 0 ? at : Math.max(last, at);
    times[k] = last;
  });
  return times;
}

/**
 * The timing axis: column k's left edge at its own moment, the trace's right
 * edge at `end` (the latest moment the run has reported, never before the
 * last column).
 * @param {Array<{at?: number}>} columns
 * @param {{secPerDiv: number, end?: number}} opts
 * @returns {{xs: Float64Array, width: number, t0: number, pxPerSec: number,
 *   times: Float64Array}} `xs` has one more entry than there are columns:
 *   the last is the right edge.
 */
export function timingAxis(columns, { secPerDiv, end = -Infinity }) {
  const times = columnTimes(columns);
  const n = columns.length;
  const xs = new Float64Array(n + 1);
  const t0 = n ? times[0] : 0;
  const tEnd = n ? Math.max(times[n - 1], Number.isFinite(end) ? end : -Infinity) : 0; // prettier-ignore
  const pxPerSec = PX_PER_DIV / secPerDiv;
  for (let k = 0; k < n; k += 1) xs[k] = (times[k] - t0) * pxPerSec;
  xs[n] = (tEnd - t0) * pxPerSec;
  return { xs, width: xs[n], t0, pxPerSec, times };
}

/**
 * Whether a channel's sample differs meaningfully from the one last shown.
 * Volts against volts by the threshold; anything else (a level, a bus word,
 * a net turning from a voltage into a level) by identity.
 */
function moved(shown, cell, volts, threshold) {
  if (!shown) return true;
  if (volts != null && shown.volts != null) {
    return Math.abs(volts - shown.volts) > threshold;
  }
  if ((volts == null) !== (shown.volts == null)) return true;
  return cell !== shown.cell;
}

/**
 * The transitions axis: a column where any of `channelIds` moved (against
 * what was last shown for it) gets `SLICE_PX`; a run of columns where none
 * did is FOLDED to nothing. A fold that stands for real time — more than
 * `MARK_STEPS` of the trace's typical step between samples — keeps a
 * `BREAK_PX` break and is listed in `breaks` with the stretch it stands for,
 * from the transition before it to the one after (or the trace's end). A
 * short one is a value sampled finer than it changed (a node creeping in
 * steps under the threshold, a fast clock under a slow signal's edge) and is
 * folded silently: marked, it would comb the lanes with breaks that say
 * nothing.
 * @param {Array<{at?: number, cells: Map, volts?: Map}>} columns
 * @param {string[]} channelIds - the channels drawn
 * @param {{gapPercent: number, fullScale: number, end?: number}} opts
 * @returns {{xs: Float64Array, width: number, times: Float64Array,
 *   breaks: Array<{x: number, from: number, to: number}>,
 *   changed: Uint8Array}}
 */
export function transitionAxis(
  columns,
  channelIds,
  { gapPercent, fullScale, end = -Infinity },
) {
  const times = columnTimes(columns);
  const n = columns.length;
  const changed = new Uint8Array(n);
  const threshold = (Math.max(0, gapPercent) / 100) * Math.max(0, fullScale);
  const shown = new Map(); // channel id → {cell, volts} last shown
  // Which columns moved, and the folds between them: {at, from, to}, `at`
  // the fold's first column.
  const folds = [];
  let lastChange = null;
  let open = null;
  for (let k = 0; k < n; k += 1) {
    const col = columns[k];
    let any = k === 0;
    for (const id of channelIds) {
      const cell = col.cells.get(id) ?? null;
      const volts = col.volts?.get(id) ?? null;
      if (moved(shown.get(id), cell, volts, threshold)) {
        shown.set(id, { cell, volts });
        any = true;
      }
    }
    if (any) {
      if (open) open.to = times[k];
      open = null;
      changed[k] = 1;
      lastChange = times[k];
    } else if (!open) {
      open = { at: k, from: lastChange ?? times[k], to: times[k] };
      folds.push(open);
    }
  }
  if (open) open.to = Math.max(open.to, times[n - 1] ?? 0, Number.isFinite(end) ? end : -Infinity); // prettier-ignore

  const markOver = MARK_STEPS * typicalStep(times);
  const marked = new Set(folds.filter((f) => f.to - f.from > markOver));
  const foldAt = new Map(folds.map((f) => [f.at, f]));
  const xs = new Float64Array(n + 1);
  const breaks = [];
  let x = 0;
  for (let k = 0; k < n; k += 1) {
    xs[k] = x;
    if (changed[k]) x += SLICE_PX;
    const fold = foldAt.get(k);
    if (fold && marked.has(fold)) {
      breaks.push({ x, from: fold.from, to: fold.to });
      x += BREAK_PX;
    }
  }
  xs[n] = x;
  return { xs, width: x, times, breaks, changed };
}

/** How many of the trace's typical steps a fold must stand for to be
    marked. */
export const MARK_STEPS = 4;

/** The median time between two samples that are not at the same moment
    (0 for a trace with none). */
function typicalStep(times) {
  const steps = [];
  for (let k = 1; k < times.length; k += 1) {
    const dt = times[k] - times[k - 1];
    if (dt > 0) steps.push(dt);
  }
  if (!steps.length) return 0;
  steps.sort((a, b) => a - b);
  return steps[steps.length >> 1];
}

/** The longest gap between two samples of a voltage that is still one
    curve: a display frame (spice/sample.js), with room for a tick landing
    between two frames. Longer, and nothing was moving in between. */
export const JOIN_S = ANALOG_FRAME_S * 1.5;

/**
 * Whether the sample at column `k` continues the curve from the one before
 * (see JOIN_S) — or, the line held flat to its moment, steps there.
 * @param {Float64Array} times - an axis's column moments
 * @param {number} k
 */
export function joined(times, k) {
  return k > 0 && times[k] - times[k - 1] <= JOIN_S;
}

/**
 * The column under `x`: the last whose left edge is at or before it (a
 * folded column has no width, so a break reads as the transition it holds).
 * @param {Float64Array} xs - an axis's edges (one more than columns)
 * @param {number} x
 * @returns {number} a column index, 0 … n-1 (0 for an empty axis)
 */
export function columnAtX(xs, x) {
  const n = xs.length - 1;
  if (n <= 0) return 0;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
