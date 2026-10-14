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

// R on a placed part, for the parts it once left alone: a diode a pitch or
// two from the trench or the board's edge turns a quarter all the same, and
// the two LED bars turn end for end — drawn turned, not just renumbered.

import test from "node:test";
import assert from "node:assert/strict";

import { resetDom } from "./jsdom-setup.js";
import { DeskDoc } from "../model/desk-doc.js";
import { partPinAddresses } from "../model/occupancy.js";
import { buildScene } from "../scene3d/scene.js";
import { readPalette } from "../scene3d/palette.js";

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

const pins = (doc, id) =>
  partPinAddresses(doc, doc.getComponent(id))
    .sort((a, b) => a.pin - b.pin)
    .map((p) => p.address);
const R = (controller, id) => {
  controller.selectComponent(id);
  return controller.handleKeyDown(
    new window.KeyboardEvent("keydown", { key: "r" }),
  );
};

test("a diode turns a quarter from EVERY row — its lead shortened to fit where it must", () => {
  for (const row of "abcdefghij") {
    const { doc, controller } = desk();
    const d = controller.addComponentAt("diode", "bb1", `${row}10`);
    const before = pins(doc, d.id);
    R(controller, d.id);
    const after = pins(doc, d.id);
    assert.equal(after[0], `bb1.${row}10`, `${row}: pin 1 stays`);
    assert.notDeepEqual(after, before, `${row}: it turned`);
    assert.equal(doc.getComponent(d.id).params.rot, 90);
  }
  // Row c: three down runs off the board and three up into the channel, so
  // it stands on its three-hole minimum.
  const { doc, controller } = desk();
  const d = controller.addComponentAt("diode", "bb1", "c10");
  R(controller, d.id);
  assert.deepEqual(pins(doc, d.id), ["bb1.c10", "bb1.a10"]);
  // …and the next turn takes it back to its own length.
  R(controller, d.id);
  assert.deepEqual(pins(doc, d.id), ["bb1.c10", "bb1.c7"]);
});

test("a resistor never shrinks below its body: from row c it reaches across the channel", () => {
  const { doc, controller } = desk();
  const r = controller.addComponentAt("resistor", "bb1", "c10");
  R(controller, r.id);
  assert.deepEqual(pins(doc, r.id), ["bb1.c10", "bb1.f10"]);
});

test("R turns the bar graph end for end: same holes, numbering backwards, block below the row", () => {
  const { doc, surface, controller } = desk();
  const bar = controller.addComponentAt("bar8", "bb1", "a10");
  assert.equal(pins(doc, bar.id)[0], "bb1.a10");
  assert.equal(R(controller, bar.id), true);
  const turned = doc.getComponent(bar.id);
  assert.equal(turned.params.rot, 180);
  assert.deepEqual(pins(doc, bar.id).slice(0, 2), ["bb1.a18", "bb1.a17"]);
  assert.equal(pins(doc, bar.id)[8], "bb1.a10", "the cathode at the left");
  const g = surface.querySelector(`[data-component-id="${bar.id}"] svg > g`);
  assert.equal(g.getAttribute("transform"), "rotate(180 4 0)");
  R(controller, bar.id);
  assert.equal(doc.getComponent(bar.id).params.rot, undefined, "and back");
});

test("R turns the isolated bar array a half lap, and it is drawn turned", () => {
  const { doc, surface, controller } = desk();
  const bar = controller.addComponentAt("bar8iso", "bb1", "e10");
  R(controller, bar.id);
  assert.equal(doc.getComponent(bar.id).params.rot, 180);
  assert.equal(pins(doc, bar.id)[0], "bb1.f17", "pin 1 top right");
  const el = surface.querySelector(`[data-component-id="${bar.id}"]`);
  assert.equal(
    el.querySelector("svg > g").getAttribute("transform"),
    "rotate(180 3.5 -1.5)",
  );
  assert.ok(el.querySelector(".part-display-pin1"), "its pin-1 mark turns too");
});

test("the 3D view turns both bars", () => {
  const palette = readPalette();
  for (const [ref, anchor] of [
    ["bar8", "a10"],
    ["bar8iso", "e10"],
  ]) {
    const scene = buildScene(
      {
        boards: [{ id: "bb1", type: "pins-full", x: 0, y: 0, rot: 0 }],
        components: [
          { id: "c1", kind: "discrete", ref, board: "bb1", anchor, params: { color: "red", rot: 180 } }, // prettier-ignore
        ],
        wires: [],
      },
      palette,
    );
    assert.deepEqual(scene.errors, [], ref);
    assert.ok(scene.modelled.has("c1"), ref);
  }
});
