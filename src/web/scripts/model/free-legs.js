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

// free-legs.js — a THREE-legged part whose legs bend one at a time: a TO-92
// transistor (Jason, 2026-10-14; a TO-220's legs are a rigid row and never
// do). Pure and DOM-free, over a plain document.
//
// TWO FORMS, ONE PART. Straight, it is the footprint every transistor always
// was — three holes in a row, `rot` 180 turning the pin order end for end.
// Bent, it stores `params.legs`: where pins 2 and 3 went, as pitch offsets
// from pin 1's hole, which is the anchor (any hole, a rail's included —
// occupancy.js `partPinHoles`). The two-terminal parts' turned form is the
// model, with one more leg.
//
// THE STRAIGHT FORM IS CANONICAL. Every write of a bent part goes through
// `legSeat`, which hands back the FOOTPRINT form whenever the three legs are in
// three holes in a row, in order — so a part whose legs were bent and then put
// back is the straight part again, and only a straight part can be a TO-220
// (the Package field asks `straightSeatOf`).
//
// Its leads are addressed as the two-terminal parts' are — `{kind: "lead", id,
// end}` — with a third end: "a" is pin 1, "b" pin 2, "c" pin 3.

import { partDef } from "../catalog/index.js";
import { parseAddress, parseHole } from "./breadboard.js";
import { partPinAddresses, worldOfAddress } from "./occupancy.js";
import { partPinsWorld } from "./part-geometry.js";

/** The lead ends a part answers to, pin 1's first. */
export const LEG_ENDS = Object.freeze(["a", "b", "c"]);

/** The pin a lead end names (`"a"` → 1), or null. */
export function pinOfEnd(end) {
  const i = LEG_ENDS.indexOf(end);
  return i < 0 ? null : i + 1;
}

/** The lead end a pin number answers to (1 → `"a"`), or null. */
export function endOfPin(pin) {
  return LEG_ENDS[pin - 1] ?? null;
}

/** Can this part's legs move one at a time — a TO-92 transistor? */
export function hasFreeLegs(comp) {
  return Boolean(comp && partDef(comp.ref)?.freeLegs?.(comp.params));
}

/** Is it stored BENT — its `legs` form? */
export function legsBent(comp) {
  return hasFreeLegs(comp) && Array.isArray(comp.params?.legs);
}

/** A bent part's pins as points relative to pin 1's hole, pin 1's first —
    what its drawing is built from (discrete-view.js `buildLegsSvg`). */
export function legsRel(params) {
  const legs = params?.legs ?? [];
  return [{ x: 0, y: 0 }, ...legs.map((l) => ({ x: l.dx, y: l.dy }))];
}

/**
 * The straight-row seat three pin ADDRESSES make (pin 1's first), or null: all
 * on one strip, in one grid row, in three neighbouring columns, in order —
 * ascending is the part as placed (`rot` 0, anchored at pin 1), descending
 * the part turned end for end (`rot` 180, anchored at pin 3, the footprint's
 * first hole either way).
 *
 * @param {Array} boards
 * @param {Array<string|null>} addresses
 * @returns {{board:string, anchor:string, rot:0|180}|null}
 */
export function straightSeat(boards, addresses) {
  if (addresses?.length !== 3) return null;
  const parsed = addresses.map(parseAddress);
  if (parsed.some((p) => !p)) return null;
  const boardId = parsed[0].boardId;
  if (parsed.some((p) => p.boardId !== boardId)) return null;
  const board = (boards ?? []).find((b) => b.id === boardId);
  if (!board) return null;
  const holes = parsed.map((p) => parseHole(board.type, p.hole));
  if (holes.some((h) => h?.kind !== "grid" || h.row !== holes[0].row)) {
    return null;
  }
  const [c1, c2, c3] = holes.map((h) => h.col);
  if (c2 === c1 + 1 && c3 === c1 + 2) {
    return { board: boardId, anchor: parsed[0].hole, rot: 0 };
  }
  if (c2 === c1 - 1 && c3 === c1 - 2) {
    return { board: boardId, anchor: parsed[2].hole, rot: 180 };
  }
  return null;
}

/**
 * Where a part stands straight — its own seat when it is stored straight, the
 * row its bent legs happen to make, or null when they make none. The Package
 * field offers a TO-220 only when this answers: a TO-220 cannot stand on bent
 * legs.
 *
 * @param {{boards: Array}} doc
 * @param {object} comp
 * @returns {{board:string, anchor:string, rot:0|180}|null}
 */
export function straightSeatOf(doc, comp) {
  if (!legsBent(comp)) {
    return {
      board: comp.board,
      anchor: comp.anchor,
      rot: comp.params?.rot === 180 ? 180 : 0,
    };
  }
  const pins = partPinAddresses(doc, comp);
  if (!pins) return null;
  const byPin = new Map(pins.map((p) => [p.pin, p.address]));
  const order = partDef(comp.ref).pins.map((p) => p.n);
  return straightSeat(
    doc.boards,
    order.map((n) => byPin.get(n) ?? null),
  );
}

/**
 * The seat — `{ id, board, anchor, params }` — a free-legged part takes with
 * its pins at `landed` (pin number → address); a pin not named stays exactly
 * where it is. Straight in three holes in a row it is the FOOTPRINT form (see
 * the module note); otherwise bent, pin 1 the anchor and pins 2 and 3 the
 * exact vectors to theirs.
 *
 * Null when it cannot be stated: pin 1 has no hole to anchor in, a pin will
 * not resolve, or two legs would share a point. Whether the holes are FREE is
 * not asked here — that is `canPlacePart`'s.
 *
 * @param {{boards: Array}} doc
 * @param {object} comp - the part as the document has it
 * @param {Map<number, string>} landed
 */
export function legSeat(doc, comp, landed) {
  const boards = doc?.boards ?? [];
  const def = partDef(comp?.ref);
  const pins = def && partPinsWorld(boards, comp);
  if (!pins || pins.length !== 3) return null;
  const at = new Map();
  for (const p of pins) {
    if (landed.has(p.pin)) {
      const address = landed.get(p.pin);
      const w = address ? worldOfAddress(boards, address) : null;
      if (!w) return null;
      at.set(p.pin, { address, x: w.x, y: w.y });
    } else {
      at.set(p.pin, { address: p.address, x: p.x, y: p.y });
    }
  }
  const order = def.pins.map((p) => p.n);
  const { legs: _legs, rot: _rot, ...rest } = comp.params ?? {};
  const straight = straightSeat(
    boards,
    order.map((n) => at.get(n).address),
  );
  if (straight) {
    return {
      id: comp.id,
      board: straight.board,
      anchor: straight.anchor,
      params: def.normalizeParams({
        ...rest,
        ...(straight.rot === 180 ? { rot: 180 } : {}),
      }),
    };
  }
  const one = at.get(order[0]);
  const seat = parseAddress(one.address);
  if (!seat) return null; // pin 1 is what the part anchors by
  // Both ends of each vector are resolved points, so the bend is exact — no
  // rounding beyond the lead coercion's own 0.01 grid.
  const legs = order.slice(1).map((n) => ({
    dx: at.get(n).x - one.x,
    dy: at.get(n).y - one.y,
  }));
  const params = def.normalizeParams({ ...rest, legs });
  if (!params.legs) return null; // two legs on one point
  return { id: comp.id, board: seat.boardId, anchor: seat.hole, params };
}
