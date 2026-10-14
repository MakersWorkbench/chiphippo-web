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

// The 0.56-in 7-segment display (seg7cc / seg7ca): ten legs, five above and
// five below, 0.6 in apart, straddling the channel as a wide DIP-10 — and the
// retired single-row digits it replaced, which still load and run.

import test from "node:test";
import assert from "node:assert/strict";

import { resetDom } from "./jsdom-setup.js";
import { partDef } from "../catalog/index.js";
import { DeskDoc, normalizeDocument } from "../model/desk-doc.js";
import { partPinAddresses } from "../model/occupancy.js";
import { buildNetlist } from "../sim/netlist.js";
import { H, L } from "../sim/levels.js";
import { buildScene } from "../scene3d/scene.js";
import { readPalette } from "../scene3d/palette.js";
import { BUILDABLE_DEFS } from "../ai/catalog-brief.js";

const { DeskController } = await import("../components/desk-controller.js");

function desk() {
  resetDom();
  const doc = new DeskDoc(null);
  doc.addBoard("pins-full", 0, 0);
  const viewport = document.createElement("section");
  const surface = document.createElement("div");
  viewport.append(surface);
  document.body.append(viewport);
  const deskView = {
    surface,
    camera: { cx: 0, cy: 0, zoom: 1 },
    worldFromEvent: () => ({ x: 0, y: 0 }),
  };
  const controller = new DeskController({ viewport, deskView, deskDoc: doc });
  return { doc, surface, controller };
}

/** Pin number → address. */
const pinMap = (doc, comp) =>
  new Map(partPinAddresses(doc, comp).map((p) => [p.pin, p.address]));

test("the datasheet pinout: 1 e, 2 d, 3 COM, 4 c, 5 dp, 6 b, 7 a, 8 COM, 9 f, 10 g", () => {
  for (const [ref, segRole, comRole] of [
    ["seg7cc", "anode", "cathode"],
    ["seg7ca", "cathode", "anode"],
  ]) {
    const def = partDef(ref);
    assert.equal(def.package, "DIP-10-600");
    assert.deepEqual(
      def.pins.map((p) => p.name),
      ["e", "d", "COM", "c", "dp", "b", "a", "COM", "f", "g"],
    );
    assert.ok(
      def.pins.every((p) => p.role === (p.name === "COM" ? comRole : segRole)),
    );
    assert.deepEqual(def.internalBridges(), [[3, 8]], "the commons are one");
    const seg = new Map(def.segments.map((s) => [s.id, s]));
    assert.equal(seg.size, 8);
    const a = seg.get("a");
    assert.deepEqual(
      ref === "seg7cc"
        ? [a.anodePin, a.cathodePin]
        : [a.cathodePin, a.anodePin],
      [7, 3],
    );
  }
});

test("it straddles the channel WIDE: five legs in row d, five in row h, its body over e–g", () => {
  const { doc, controller } = desk();
  const comp = controller.addComponentAt("seg7cc", "bb1", "d10");
  assert.equal(doc.getComponent(comp.id).params.wide, true);
  const at = pinMap(doc, doc.getComponent(comp.id));
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((n) => at.get(n)),
    ["bb1.d10", "bb1.d11", "bb1.d12", "bb1.d13", "bb1.d14"],
  );
  assert.deepEqual(
    [6, 7, 8, 9, 10].map((n) => at.get(n)),
    ["bb1.h14", "bb1.h13", "bb1.h12", "bb1.h11", "bb1.h10"],
  );
  // The body covers the rows between: no wire may go into f12.
  assert.equal(doc.canPlaceWire("bb1.f12", "bb1.f30"), false);
  assert.equal(doc.canPlaceWire("bb1.c12", "bb1.f30"), true, "row c is free");
  // Even anchored in row e it seats wide (e/i) — there is no narrow seat.
  const low = controller.addComponentAt("seg7ca", "bb1", "e30");
  const lowAt = pinMap(doc, doc.getComponent(low.id));
  assert.equal(lowAt.get(10), "bb1.i30");
});

test("its two commons are one net, so either may be wired", () => {
  const { doc, controller } = desk();
  controller.addComponentAt("seg7cc", "bb1", "d10");
  const net = buildNetlist(doc.toJSON()).netOfPoint;
  assert.equal(net.get("bb1.d12"), net.get("bb1.h12"));
  assert.notEqual(net.get("bb1.d11"), net.get("bb1.h11"));
});

test("a segment lights over its common, as the single LED's rule says", () => {
  const { surface, controller } = desk();
  controller.addComponentAt("seg7cc", "bb1", "d10", { color: "green" });
  const el = surface.querySelector(".part-discrete--seg7cc");
  window.dispatchEvent(
    new window.CustomEvent("chiphippo:sim-state", {
      detail: {
        running: true,
        netLevels: new Map([
          ["netH", H],
          ["netGND", L],
        ]),
        strongLevels: new Map(),
        chipStatus: new Map(),
        warnings: [],
        netlist: {
          netOfPoint: new Map([
            ["bb1.h13", "netH"], // pin 7 → segment a
            ["bb1.d13", "netH"], // pin 4 → segment c
            ["bb1.d12", "netGND"], // pin 3 → the common
          ]),
        },
      },
    }),
  );
  const lit = (seg) =>
    el.querySelector(`[data-seg="${seg}"]`).classList.contains("part-seg--lit");
  assert.ok(lit("a") && lit("c"));
  assert.ok(!lit("b") && !lit("dp"));
});

test("R turns it end for end: the same holes, the numbering half a lap round", () => {
  const { doc, controller } = desk();
  const comp = controller.addComponentAt("seg7cc", "bb1", "d10");
  controller.selectComponent(comp.id);
  controller.handleKeyDown(new window.KeyboardEvent("keydown", { key: "r" }));
  const turned = doc.getComponent(comp.id);
  assert.equal(turned.params.rot, 180);
  assert.equal(pinMap(doc, turned).get(1), "bb1.h14");
  // …and it is DRAWN turned: the digit stands on its head.
  const drawn = () =>
    document
      .querySelector(`[data-component-id="${comp.id}"] svg > g`)
      .getAttribute("transform");
  assert.equal(drawn(), "rotate(180 2 -3)");
  controller.handleKeyDown(new window.KeyboardEvent("keydown", { key: "r" }));
  assert.equal(doc.getComponent(comp.id).params.rot, undefined, "and back");
  assert.equal(drawn(), null);
});

test("R turns the placement ghost a half lap too, and it lands turned", () => {
  const { doc, controller } = desk();
  controller.armPartPlacement("seg7cc");
  assert.equal(
    controller.handleKeyDown(new window.KeyboardEvent("keydown", { key: "r" })),
    true,
  );
  const ghost = document.querySelector(".part-ghost svg > g");
  assert.equal(ghost.getAttribute("transform"), "rotate(180 2 -3)");
  assert.ok(controller.placementArmed, "still placing");
  assert.equal(doc.components.length, 0);
});

test("the RETIRED single-row digits still load and run; the AI builder keeps them for now", () => {
  const raw = {
    boards: [{ id: "bb1", type: "pins-full", x: 0, y: 0 }],
    components: [
      { id: "c1", kind: "discrete", ref: "seg8cc", board: "bb1", anchor: "a1", params: { color: "red" } }, // prettier-ignore
    ],
    wires: [],
  };
  const doc = normalizeDocument(raw);
  assert.equal(doc.components.length, 1);
  assert.equal(partDef("seg8cc").retired, true);
  assert.equal(partDef("seg7cc").retired, undefined);
  const buildable = new Set(BUILDABLE_DEFS.map((d) => d.id));
  assert.ok(buildable.has("seg8cc"));
  assert.ok(!buildable.has("seg7cc"), "not until the compiler seats it wide");
});

test("the 3D view models it, turned or not", () => {
  const palette = readPalette();
  for (const rot of [0, 180]) {
    const scene = buildScene(
      {
        boards: [{ id: "bb1", type: "pins-full", x: 0, y: 0, rot: 0 }],
        components: [
          { id: "c1", kind: "discrete", ref: "seg7ca", board: "bb1", anchor: "d10", params: partDef("seg7ca").normalizeParams({ rot }) }, // prettier-ignore
        ],
        wires: [],
      },
      palette,
    );
    assert.deepEqual(scene.errors, []);
    assert.ok(scene.modelled.has("c1"));
  }
});
