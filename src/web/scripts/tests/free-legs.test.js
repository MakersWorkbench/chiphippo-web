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

// Tests for model/free-legs.js — a TO-92's three legs bending one at a time,
// and the straight form every write comes back to when they are in a row.

import test from "node:test";
import assert from "node:assert/strict";

import { partDef } from "../catalog/index.js";
import {
  hasFreeLegs,
  legSeat,
  legsBent,
  pinOfEnd,
  endOfPin,
  straightSeat,
  straightSeatOf,
} from "../model/free-legs.js";
import {
  canPlacePart,
  partPinAddresses,
  partPinHoles,
} from "../model/occupancy.js";
import { leadsRiding, planRidingLead } from "../model/part-move.js";

const FULL = { id: "bb1", type: "pins-full", x: 0, y: 0 };
const AWAY = { id: "bb2", type: "pins-full", x: 80, y: 0 };

const npn = (anchor, params = {}) => ({
  id: "q1",
  kind: "discrete",
  ref: "npn",
  board: "bb1",
  anchor,
  params: partDef("npn").normalizeParams(params),
});
const docWith = (...components) => ({
  boards: [FULL, AWAY],
  components,
  wires: [],
});
const addresses = (doc, comp) =>
  partPinAddresses(doc, comp)
    .sort((a, b) => a.pin - b.pin)
    .map((p) => p.address);

test("a TO-92's legs are free; a TO-220's never are", () => {
  assert.equal(hasFreeLegs(npn("a10")), true);
  assert.equal(hasFreeLegs(npn("a10", { case: "TO-220" })), false);
  const fet = { ...npn("a10"), ref: "nmos", params: { case: "TO-220" } };
  assert.equal(hasFreeLegs(fet), false, "a MOSFET's default package");
  assert.equal(hasFreeLegs({ ...fet, params: { case: "TO-92" } }), true);
  assert.equal(hasFreeLegs({ ...fet, ref: "resistor" }), false);
  assert.deepEqual([1, 2, 3].map(endOfPin), ["a", "b", "c"]);
  assert.deepEqual(["a", "b", "c", "d"].map(pinOfEnd), [1, 2, 3, null]);
});

test("bent legs ARE a TO-92: the params keep them, force the package, drop the turn", () => {
  const def = partDef("nmos");
  const legs = [
    { dx: 1, dy: -2 },
    { dx: 3, dy: 0 },
  ];
  const params = def.normalizeParams({ case: "TO-220", rot: 180, legs });
  assert.equal(params.case, "TO-92");
  assert.equal(params.rot, undefined);
  assert.deepEqual(params.legs, legs);
  // Junk, or two legs on one point, is no bend at all.
  assert.equal(def.normalizeParams({ legs: [{ dx: 1, dy: 0 }] }).legs, undefined); // prettier-ignore
  assert.equal(def.normalizeParams({ legs: [legs[0], legs[0]] }).legs, undefined); // prettier-ignore
});

test("bent, pin 1 anchors and pins 2 and 3 resolve where their offsets land", () => {
  const comp = npn("a10", {
    legs: [
      { dx: 2, dy: -1 },
      { dx: 4, dy: 0 },
    ],
  });
  assert.deepEqual(partPinHoles("npn", "a10", comp.params).length, 3);
  const doc = docWith(comp);
  assert.deepEqual(addresses(doc, comp), ["bb1.a10", "bb1.b12", "bb1.a14"]);
  assert.equal(canPlacePart(doc, { ...comp, ignoreId: "q1" }), true);
});

test("straightSeat: three neighbouring holes of one row, in order, either way", () => {
  const boards = [FULL, AWAY];
  assert.deepEqual(straightSeat(boards, ["bb1.a10", "bb1.a11", "bb1.a12"]), {
    board: "bb1",
    anchor: "a10",
    rot: 0,
  });
  // Turned end for end: anchored at pin 3, the footprint's first hole.
  assert.deepEqual(straightSeat(boards, ["bb1.a12", "bb1.a11", "bb1.a10"]), {
    board: "bb1",
    anchor: "a10",
    rot: 180,
  });
  for (const bad of [
    ["bb1.a10", "bb1.a12", "bb1.a11"], // out of order
    ["bb1.a10", "bb1.b11", "bb1.a12"], // not one row
    ["bb1.a10", "bb1.a11", "bb1.a13"], // a gap
    ["bb1.a10", "bb1.a11", "bb2.a12"], // two strips
    ["bb1.a10", "bb1.a11", null], // a leg in the air
  ]) {
    assert.equal(straightSeat(boards, bad), null, bad.join(" "));
  }
});

test("legSeat: one leg moved bends the part; put back, it is straight again", () => {
  const comp = npn("a10");
  const doc = docWith(comp);
  const bent = legSeat(doc, comp, new Map([[3, "bb1.c14"]]));
  assert.equal(bent.anchor, "a10");
  assert.deepEqual(bent.params.legs, [
    { dx: 1, dy: 0 },
    { dx: 4, dy: -2 },
  ]);
  assert.equal(legsBent({ ...comp, params: bent.params }), true);
  const moved = { ...comp, ...bent };
  const back = legSeat(docWith(moved), moved, new Map([[3, "bb1.a12"]]));
  assert.deepEqual(back, {
    id: "q1",
    board: "bb1",
    anchor: "a10",
    params: partDef("npn").normalizeParams({}),
  });
});

test("legSeat: pin 1 moving re-anchors the part, and a row the wrong way round is turned", () => {
  const comp = npn("a10");
  const doc = docWith(comp);
  const moved = legSeat(doc, comp, new Map([[1, "bb1.d9"]]));
  assert.equal(moved.anchor, "d9");
  assert.deepEqual(moved.params.legs, [
    { dx: 2, dy: 3 },
    { dx: 3, dy: 3 },
  ]);
  // Pins 1 and 3 trading holes is the part turned end for end — straight.
  const turned = legSeat(
    doc,
    comp,
    new Map([
      [1, "bb1.a12"],
      [3, "bb1.a10"],
    ]),
  );
  assert.equal(turned.anchor, "a10");
  assert.equal(turned.params.rot, 180);
  assert.equal(turned.params.legs, undefined);
});

test("straightSeatOf: a straight part's own seat; a bent one only when its legs make a row", () => {
  const comp = npn("a10", { rot: 180 });
  assert.deepEqual(straightSeatOf(docWith(comp), comp), {
    board: "bb1",
    anchor: "a10",
    rot: 180,
  });
  const bent = npn("a10", {
    legs: [
      { dx: 1, dy: -1 },
      { dx: 2, dy: 0 },
    ],
  });
  assert.equal(straightSeatOf(docWith(bent), bent), null);
});

test("canPlacePart: two bent legs in one hole are refused", () => {
  const comp = npn("a10");
  const doc = docWith();
  assert.equal(
    canPlacePart(doc, {
      ref: "npn",
      board: "bb1",
      anchor: "a10",
      params: { legs: [{ dx: 0, dy: -1 }, { dx: 0, dy: -1 }] }, // prettier-ignore
    }),
    false,
  );
  assert.equal(
    canPlacePart(doc, {
      ref: "npn",
      board: "bb1",
      anchor: comp.anchor,
      params: { legs: [{ dx: 0, dy: -1 }, { dx: 5, dy: 0 }] }, // prettier-ignore
    }),
    true,
  );
});

test("a TO-92's leg RIDES a moving part's node, and the part bends round it", () => {
  const chip = {
    id: "c1",
    kind: "chip",
    ref: "74LS00",
    board: "bb1",
    anchor: "e5",
    params: {},
  };
  const q = npn("a11"); // pin 1 in a11 — chip pin 7's column-half (c11L)
  const doc = { boards: [FULL], components: [chip, q], wires: [] };
  const owners = new Map([["bb1|c11L", "c1"]]);
  const riding = leadsRiding(doc, owners, new Set(["c1"]));
  assert.deepEqual(riding, [{ id: "q1", pins: [{ pin: 1, memberId: "c1" }] }]);
  // A TO-220 would not ride: its legs are a rigid row.
  const rigid = { ...q, params: { case: "TO-220" } };
  assert.deepEqual(
    leadsRiding({ ...doc, components: [chip, rigid] }, owners, new Set(["c1"])), // prettier-ignore
    [],
  );
  const seat = planRidingLead(doc, q, [
    { pin: 1, shift: (a) => (a === "bb1.a11" ? "bb1.a9" : null) },
  ]);
  assert.equal(seat.anchor, "a9");
  assert.deepEqual(seat.params.legs, [
    { dx: 3, dy: 0 },
    { dx: 4, dy: 0 },
  ]);
});
