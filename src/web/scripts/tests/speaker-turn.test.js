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

// The speaker turns a quarter lap about its + leg (`def.turns`): its legs are
// 0.3 in apart, the channel's own width, so stood on end it straddles the
// trench — one leg in row e, the other in row f.

import test from "node:test";
import assert from "node:assert/strict";

import { resetDom } from "./jsdom-setup.js";
import { partDef } from "../catalog/index.js";
import { spec } from "../model/breadboard.js";
import { DeskDoc } from "../model/desk-doc.js";
import { partPinAddresses } from "../model/occupancy.js";
import { buildScene } from "../scene3d/scene.js";
import { readPalette } from "../scene3d/palette.js";

const { DeskController } = await import("../components/desk-controller.js");

const ROW = spec("pins-full").rowY;

function desk(world = { x: 0, y: 0 }) {
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
    worldFromEvent: () => ({ x: world.x, y: world.y }),
  };
  const controller = new DeskController({ viewport, deskView, deskDoc: doc });
  return { doc, viewport, surface, controller, world };
}

const pins = (doc, id) =>
  partPinAddresses(doc, doc.getComponent(id))
    .sort((a, b) => a.pin - b.pin)
    .map((p) => p.address);
const R = (controller) =>
  controller.handleKeyDown(new window.KeyboardEvent("keydown", { key: "r" }));

test("a quarter turn is stored only when it is one", () => {
  const def = partDef("speaker");
  assert.equal(def.turns, true);
  assert.equal(def.normalizeParams({}).rot, undefined);
  assert.equal(def.normalizeParams({ rot: 0 }).rot, undefined);
  assert.equal(def.normalizeParams({ rot: 270 }).rot, 270);
  assert.equal(def.normalizeParams({ rot: 45 }).rot, undefined);
});

test("R turns a placed speaker 90° at a time about its + leg — on end, across the trench", () => {
  const { doc, controller } = desk();
  const s = controller.addComponentAt("speaker", "bb1", "e10");
  assert.deepEqual(pins(doc, s.id), ["bb1.e10", "bb1.e13"]);
  controller.selectComponent(s.id);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    assert.equal(R(controller), true);
    seen.push(pins(doc, s.id));
  }
  assert.deepEqual(seen, [
    ["bb1.e10", "bb1.b10"], // 90: down the column
    ["bb1.e10", "bb1.e7"], // 180: the row the other way
    ["bb1.e10", "bb1.f10"], // 270: up, straight across the channel
    ["bb1.e10", "bb1.e13"], // and round again
  ]);
});

test("R steps past a quarter it cannot take", () => {
  const { doc, controller } = desk();
  const s = controller.addComponentAt("speaker", "bb1", "e10");
  doc.addWire({ from: "bb1.b10", to: "bb1.b30" }); // where the 90° leg would go
  controller.selectComponent(s.id);
  R(controller);
  assert.equal(doc.getComponent(s.id).params.rot, 180);
});

test("drawn turned: the body swings round its + leg, every word upright", () => {
  const { surface, controller } = desk();
  const s = controller.addComponentAt("speaker", "bb1", "e10", { rot: 270 });
  const el = surface.querySelector(`[data-component-id="${s.id}"]`);
  const body = el.querySelector(".part-speaker-body");
  // (1.5, -1.75) turned three quarters: beside the legs, over the channel.
  assert.deepEqual(
    [Number(body.getAttribute("cx")), Number(body.getAttribute("cy"))],
    [-1.75, -1.5],
  );
  assert.equal(
    el.querySelector("[transform]"),
    null,
    "nothing drawn on its side",
  );
});

test("R turns the placement ghost, and it drops across the channel", () => {
  const { doc, viewport, controller, world } = desk();
  controller.armPartPlacement("speaker");
  for (let i = 0; i < 3; i++) assert.equal(R(controller), true); // 270
  // The cursor on the channel, between rows e and f: the shape centres on it.
  Object.assign(world, { x: 20, y: (ROW.e + ROW.f) / 2 });
  viewport.dispatchEvent(
    new window.PointerEvent("pointermove", { bubbles: true, pointerId: 1 }),
  );
  viewport.dispatchEvent(
    new window.PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 11,
      clientX: 5,
      clientY: 5,
    }),
  );
  viewport.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }),
  );
  const [s] = doc.components;
  assert.ok(s, "it landed");
  assert.equal(s.params.rot, 270);
  assert.deepEqual(pins(doc, s.id), ["bb1.e20", "bb1.f20"]);
});

test("the 3D view stands it on end too", () => {
  const scene = buildScene(
    {
      boards: [{ id: "bb1", type: "pins-full", x: 0, y: 0, rot: 0 }],
      components: [
        { id: "c1", kind: "discrete", ref: "speaker", board: "bb1", anchor: "e10", params: { impedance: 8, volume: 50, rot: 270 } }, // prettier-ignore
      ],
      wires: [],
    },
    readPalette(),
  );
  assert.deepEqual(scene.errors, []);
  assert.ok(scene.modelled.has("c1"));
});
