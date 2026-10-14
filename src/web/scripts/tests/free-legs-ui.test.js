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

// jsdom tests for a TO-92's free legs on the desk (model/free-legs.js): an
// Option/Alt drag bends one, the drawing follows, a bent part drags whole and
// turns end for end, and its Package card will not offer a TO-220 until its
// legs stand in a row again.

import test from "node:test";
import assert from "node:assert/strict";

import { resetDom } from "./jsdom-setup.js";
import { DeskDoc } from "../model/desk-doc.js";
import { spec } from "../model/breadboard.js";
import { partPinAddresses } from "../model/occupancy.js";
import { buildScene } from "../scene3d/scene.js";
import { readPalette } from "../scene3d/palette.js";

const { DeskController } = await import("../components/desk-controller.js");
const { PopupManager } = await import("../popup-manager.js");

const ROW = spec("pins-full").rowY;

function desk(ref = "npn", params = {}) {
  resetDom();
  const doc = new DeskDoc(null);
  doc.addBoard("pins-full", 0, 0);
  const world = { x: 0, y: 0 };
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
  const q = controller.addComponentAt(ref, "bb1", "a10", params); // a10 a11 a12
  return { doc, world, viewport, surface, controller, q };
}

/** Pin addresses, pin 1's first. */
const pins = (doc, id) =>
  partPinAddresses(doc, doc.getComponent(id))
    .sort((a, b) => a.pin - b.pin)
    .map((p) => p.address);

/** Press at `from`, move to `to`, release — on `el`, with `mods` throughout. */
function drag(el, world, from, to, mods = {}) {
  const send = (type, client) =>
    el.dispatchEvent(
      new window.PointerEvent(type, {
        bubbles: true,
        button: 0,
        pointerId: 9,
        clientX: client,
        clientY: 0,
        ...mods,
      }),
    );
  Object.assign(world, from);
  send("pointerdown", 0);
  Object.assign(world, to);
  send("pointermove", 40);
  send("pointerup", 40);
}

const partEl = (surface, id) =>
  surface.querySelector(`[data-component-id="${id}"]`);

/** Option/Alt-drag pin 3 from a12 to c14. */
const bend = ({ viewport, world }) =>
  drag(viewport, world, { x: 12, y: ROW.a }, { x: 14, y: ROW.c }, { altKey: true }); // prettier-ignore

test("Option/Alt rings a TO-92's legs — a TO-220's never", () => {
  for (const [params, lit] of [
    [{}, 1],
    [{ case: "TO-220" }, 0],
  ]) {
    const { viewport, surface, controller, world } = desk("npn", params);
    controller.setPinMode(true);
    Object.assign(world, { x: 11, y: ROW.a });
    viewport.dispatchEvent(
      new window.PointerEvent("pointermove", { bubbles: true, altKey: true }),
    );
    const rings = surface.querySelectorAll(".hole-ring--pin:not([hidden])");
    assert.equal(rings.length, lit, JSON.stringify(params));
  }
});

test("an Option/Alt drag bends ONE leg; the others stay, and the drawing follows", () => {
  const ctx = desk();
  const { doc, surface, controller, q } = ctx;
  bend(ctx);
  assert.deepEqual(pins(doc, q.id), ["bb1.a10", "bb1.a11", "bb1.c14"]);
  assert.ok(Array.isArray(doc.getComponent(q.id).params.legs));
  assert.ok(partEl(surface, q.id).querySelector(".part-discrete-svg--legs"));
  assert.equal(controller.selectedId, q.id, "the leg stays picked");
  // ⌘Z puts it straight — one step.
  controller.undo();
  assert.deepEqual(pins(doc, q.id), ["bb1.a10", "bb1.a11", "bb1.a12"]);
  assert.equal(doc.getComponent(q.id).params.legs, undefined);
});

test("a leg put back in the row stands the part straight again", () => {
  const ctx = desk();
  const { doc, viewport, world, surface, q } = ctx;
  bend(ctx);
  drag(viewport, world, { x: 14, y: ROW.c }, { x: 12, y: ROW.a }, { altKey: true }); // prettier-ignore
  assert.deepEqual(pins(doc, q.id), ["bb1.a10", "bb1.a11", "bb1.a12"]);
  assert.equal(doc.getComponent(q.id).params.legs, undefined);
  assert.equal(
    partEl(surface, q.id).querySelector(".part-discrete-svg--legs"),
    null,
  );
});

test("a leg drawn bent mid-drag is drawn straight again the moment it is back in the row", () => {
  const { doc, world, viewport, surface, q } = desk();
  const send = (type, client) =>
    viewport.dispatchEvent(
      new window.PointerEvent(type, {
        bubbles: true,
        button: 0,
        pointerId: 9,
        clientX: client,
        clientY: 0,
        altKey: true,
      }),
    );
  const legs = () => partEl(surface, q.id).querySelector(".part-discrete-svg--legs"); // prettier-ignore
  Object.assign(world, { x: 12, y: ROW.a });
  send("pointerdown", 0);
  Object.assign(world, { x: 14, y: ROW.c }); // out of the row: drawn bent
  send("pointermove", 40);
  assert.ok(legs(), "drawn bent");
  Object.assign(world, { x: 12, y: ROW.a }); // back where it stood
  send("pointermove", 41);
  assert.equal(legs(), null, "drawn straight");
  send("pointerup", 41);
  assert.deepEqual(pins(doc, q.id), ["bb1.a10", "bb1.a11", "bb1.a12"]);
});

test("a bent TO-92 drags WHOLE by its body, every leg keeping its bend", () => {
  const ctx = desk();
  const { doc, surface, world, q } = ctx;
  bend(ctx);
  const legs = doc.getComponent(q.id).params.legs;
  drag(partEl(surface, q.id), world, { x: 10, y: ROW.a }, { x: 12, y: ROW.a }); // prettier-ignore
  assert.deepEqual(pins(doc, q.id), ["bb1.a12", "bb1.a13", "bb1.c16"]);
  assert.deepEqual(doc.getComponent(q.id).params.legs, legs);
});

test("R turns a bent TO-92 end for end: pins 1 and 3 trade holes", () => {
  const ctx = desk();
  const { doc, controller, q } = ctx;
  bend(ctx);
  controller.selectComponent(q.id);
  controller.handleKeyDown(new window.KeyboardEvent("keydown", { key: "r" }));
  assert.deepEqual(pins(doc, q.id), ["bb1.c14", "bb1.a11", "bb1.a10"]);
});

test("a picked TO-92 leg rides a selection's drag (Option/Alt+Ctrl)", () => {
  const ctx = desk();
  const { doc, viewport, world, controller, q } = ctx;
  const wire = doc.addWire({ from: "bb1.a30", to: "bb1.a40" });
  controller.deselect();
  for (const x of [12, 40]) {
    Object.assign(world, { x, y: ROW.a });
    for (const type of ["pointerdown", "pointerup"]) {
      viewport.dispatchEvent(
        new window.PointerEvent(type, {
          bubbles: true,
          button: 0,
          pointerId: 4,
          altKey: true,
          ctrlKey: true,
        }),
      );
    }
  }
  assert.deepEqual(controller.multiSelectedLeads, [
    `lead:${q.id}:c`,
    `wire-end:${wire.id}:to`,
  ]);
  drag(viewport, world, { x: 40, y: ROW.a }, { x: 42, y: ROW.a });
  assert.deepEqual(pins(doc, q.id), ["bb1.a10", "bb1.a11", "bb1.a14"]);
  assert.equal(doc.getWire(wire.id).to, "bb1.a42");
});

/** Open the part's Properties card from its context menu. */
function openProperties(surface, id) {
  PopupManager.close();
  partEl(surface, id).dispatchEvent(
    new window.MouseEvent("contextmenu", { bubbles: true, clientX: 9, clientY: 9 }), // prettier-ignore
  );
  [...document.querySelectorAll(".popup-menu-item")]
    .find((b) => b.textContent.trim() === "Properties…")
    .click();
}

const packageButton = (label) =>
  [...document.querySelectorAll(".segmented-option")].find(
    (b) => b.textContent === label,
  );

test("the Package card greys a TO-220 while the legs are bent, and says why", () => {
  const ctx = desk();
  const { surface, q } = ctx;
  openProperties(surface, q.id);
  assert.equal(packageButton("TO-220").disabled, false, "straight: offered");
  PopupManager.close();

  bend(ctx);
  openProperties(surface, q.id);
  const to220 = packageButton("TO-220");
  assert.equal(to220.disabled, true);
  assert.match(to220.title, /bent/);
  assert.equal(packageButton("TO-92").disabled, false);
  PopupManager.close();
});

test("a straight TO-92 still becomes a TO-220, and then its legs are not free", () => {
  const { doc, surface, controller, q } = desk();
  openProperties(surface, q.id);
  packageButton("TO-220").click();
  PopupManager.close();
  assert.equal(doc.getComponent(q.id).params.case, "TO-220");
  controller.setPinMode(true);
  // Nothing to ring, so nothing to drag.
  assert.deepEqual(pins(doc, q.id), ["bb1.a10", "bb1.a11", "bb1.a12"]);
});

test("the 3D view stands a bent TO-92 on its three legs", () => {
  const ctx = desk();
  bend(ctx);
  const palette = readPalette();
  const scene = buildScene(ctx.doc.toJSON(), palette);
  assert.deepEqual(scene.errors, []);
  assert.ok(scene.modelled.has(ctx.q.id));
});
