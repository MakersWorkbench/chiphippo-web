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

// The selection & drag model's edges, each one a bug the 2026-10-14 review
// found: a board's set copied, a brick carried beside its board, Escape
// mid-press, lead sets and undo, a one-part chord, a resistor's value through
// a body drag, a stale highlight after redo, a wire landed on a strip that is
// itself moving, and the labels a reshaped part carries.

import test from "node:test";
import assert from "node:assert/strict";

import { resetDom } from "./jsdom-setup.js";
import { DeskDoc } from "../model/desk-doc.js";
import { worldOfAddress } from "../model/occupancy.js";
import { partPinsWorld } from "../model/part-geometry.js";
import { partDef } from "../catalog/index.js";

const { DeskController } = await import("../components/desk-controller.js");

function desk() {
  resetDom();
  const doc = new DeskDoc(null);
  const world = { x: 0, y: 0 };
  const viewport = document.createElement("section");
  const surface = document.createElement("div");
  viewport.append(surface);
  document.body.append(viewport);
  const pans = []; // the presses handed to DeskView's pan
  const deskView = {
    surface,
    camera: { cx: 0, cy: 0, zoom: 1 },
    worldFromEvent: () => ({ x: world.x, y: world.y }),
    beginPan: (e) => (pans.push(e), true),
  };
  const controller = new DeskController({ viewport, deskView, deskDoc: doc });
  return { doc, world, viewport, surface, controller, pans };
}

const partEl = (surface, id) =>
  surface.querySelector(`[data-component-id="${id}"]`);
const boardEl = (surface, id) => surface.querySelector(`[data-board-id="${id}"]`); // prettier-ignore

function fire(el, type, { client = [0, 0], mods = {} } = {}) {
  el.dispatchEvent(
    new window.PointerEvent(type, {
      bubbles: true,
      button: 0,
      pointerId: 3,
      clientX: client[0],
      clientY: client[1],
      ...mods,
    }),
  );
}

/** Press at world `from`, travel to `to`, release — all on `el`. */
function drag(el, world, from, to, mods = {}) {
  Object.assign(world, from);
  fire(el, "pointerdown", { mods });
  Object.assign(world, to);
  fire(el, "pointermove", { client: [40, 0], mods });
  fire(el, "pointerup", { client: [40, 0], mods });
}

const key = (controller, k, mods = {}) =>
  controller.handleKeyDown(
    new window.KeyboardEvent("keydown", { key: k, ...mods }),
  );
const at = (doc, address) => worldOfAddress(doc.boards, address);
const changed = () =>
  window.dispatchEvent(new window.CustomEvent("chiphippo:doc-changed"));

test("a board picked by a click copies its whole set with ⌘C", () => {
  const { doc, world, surface, controller } = desk();
  controller.addKitAt("full", 0, 0);
  controller.addComponentAt("74LS00", "bb2", "e5");
  controller.deselect();
  Object.assign(world, at(doc, "bb2.a30"));
  fire(boardEl(surface, "bb2"), "pointerdown");
  fire(boardEl(surface, "bb2"), "pointerup");
  assert.equal(key(controller, "c", { metaKey: true, ctrlKey: true }), true);
});

test("a selection dragged by its board carries the PSU beside it, by any travel", () => {
  for (const dx of [1, 3, 10]) {
    const { doc, world, surface, controller } = desk();
    const { width } = partDef("psu").size;
    controller.addBoardAt("pins-half", 0, 0);
    const psu = controller.addBrickAt("psu", -width - 2, 0);
    controller.selectAll();
    const p = at(doc, "bb1.c10");
    drag(boardEl(surface, "bb1"), world, p, { x: p.x + dx, y: p.y });
    assert.equal(doc.getBoard("bb1").x, dx, `the board, by ${dx}`);
    assert.equal(doc.getComponent(psu.id).x, -width - 2 + dx, `the PSU, by ${dx}`); // prettier-ignore
  }
});

test("Escape mid-press cancels the press: no switch flipped, no selection collapsed", () => {
  {
    const { doc, world, surface, controller } = desk();
    controller.addBoardAt("pins-full", 0, 0);
    const sw = controller.addComponentAt("sw-slide", "bb1", "a10");
    const before = JSON.stringify(doc.getComponent(sw.id).params);
    Object.assign(world, partPinsWorld(doc.boards, doc.getComponent(sw.id))[0]); // prettier-ignore
    fire(partEl(surface, sw.id), "pointerdown");
    assert.equal(key(controller, "Escape"), true);
    assert.equal(JSON.stringify(doc.getComponent(sw.id).params), before);
  }
  {
    const { doc, world, surface, controller } = desk();
    controller.addBoardAt("pins-full", 0, 0);
    const a = controller.addComponentAt("74LS00", "bb1", "e5");
    const b = controller.addComponentAt("74LS04", "bb1", "e20");
    controller.selectComponent(a.id);
    controller.toggleComponentSelection(b.id);
    Object.assign(world, partPinsWorld(doc.boards, doc.getComponent(a.id))[0]); // prettier-ignore
    fire(partEl(surface, a.id), "pointerdown");
    assert.equal(key(controller, "Escape"), true);
    assert.deepEqual(controller.multiSelectedIds.sort(), [a.id, b.id].sort());
  }
});

test("a selection of nothing but leads is an undo step like any other", () => {
  const { doc, world, viewport, controller } = desk();
  controller.addBoardAt("pins-full", 0, 0);
  doc.addWire({ from: "bb1.a3", to: "bb1.a10" });
  doc.addWire({ from: "bb1.a20", to: "bb1.a30" });
  changed();
  controller.deselect();
  const chord = { altKey: true, ctrlKey: true, metaKey: true };
  for (const address of ["bb1.a3", "bb1.a20", "bb1.a30"]) {
    Object.assign(world, at(doc, address));
    fire(viewport, "pointerdown", { mods: chord });
    fire(viewport, "pointerup", { mods: chord });
  }
  assert.equal(controller.multiSelectedLeads.length, 3);
  key(controller, "Escape");
  assert.equal(controller.multiSelectedLeads.length, 0);
  controller.undo();
  assert.equal(controller.multiSelectedLeads.length, 3, "the set comes back");
});

test("a lead picked, then its own part ⌘-clicked, collapses to the part", () => {
  const { doc, world, surface, controller } = desk();
  controller.addBoardAt("pins-full", 0, 0);
  const r = controller.addComponentAt("resistor", "bb1", "a10");
  controller.deselect();
  Object.assign(world, at(doc, "bb1.a13"));
  fire(partEl(surface, r.id), "pointerdown", { mods: { altKey: true } });
  fire(partEl(surface, r.id), "pointerup", { mods: { altKey: true } });
  Object.assign(world, at(doc, "bb1.a11"));
  const cmd = { ctrlKey: true, metaKey: true };
  fire(partEl(surface, r.id), "pointerdown", { mods: cmd });
  fire(partEl(surface, r.id), "pointerup", { mods: cmd });
  assert.equal(controller.selectedId, r.id, "the one part is the single pick");
  assert.deepEqual(controller.multiSelectedLeads, []);
});

test("a resistor's body drag keeps its value, wired or not", () => {
  for (const wired of [false, true]) {
    const { doc, world, surface, controller } = desk();
    controller.addBoardAt("pins-full", 0, 0);
    const r = controller.addComponentAt("resistor", "bb1", "a10", {
      ohms: 220,
    });
    if (wired) {
      doc.addWire({ from: "bb1.b10", to: "bb1.b40" });
      changed();
    }
    const p = at(doc, "bb1.a10");
    drag(partEl(surface, r.id), world, p, { x: p.x + 2, y: p.y });
    const c = doc.getComponent(r.id);
    assert.equal(c.anchor, "a12", `wired ${wired}`);
    assert.equal(c.params.ohms, 220, `wired ${wired}`);
  }
});

test("redo lights only the part it selects", () => {
  const { surface, controller } = desk();
  controller.addBoardAt("pins-full", 0, 0);
  const a = controller.addComponentAt("74LS00", "bb1", "e5");
  const c = controller.addComponentAt("74LS04", "bb1", "e20");
  controller.undo();
  assert.equal(controller.selectedId, a.id);
  controller.redo();
  assert.equal(controller.selectedId, c.id);
  const lit = [...surface.querySelectorAll(".part--selected")].map(
    (el) => el.dataset.componentId,
  );
  assert.deepEqual(lit, [c.id]);
});

test("a selected wire may not land on a strip that is moving with it", () => {
  const { doc, world, viewport, controller } = desk();
  controller.addBoardAt("pins-full", 0, 0); // bb1
  controller.addBoardAt("pins-half", 80, 0); // bb2
  const w = doc.addWire({ from: "bb1.a3", to: "bb1.a6" });
  changed();
  controller.deselect();
  controller.toggleBoardSelection("bb2");
  controller.toggleWireSelection(w.id);
  // The wire would land in bb2's holes as bb2 itself leaves them: refused,
  // and the whole drop with it.
  drag(viewport, world, at(doc, "bb1.a3"), at(doc, "bb2.a3"));
  assert.equal(doc.getBoard("bb2").x, 80);
  assert.deepEqual([doc.getWire(w.id).from, doc.getWire(w.id).to], ["bb1.a3", "bb1.a6"]); // prettier-ignore
});

test("an anchored label rides its part's middle: body drags, a chip held at pin 1, a lead, a turn", () => {
  // A resistor dragged by its body: the label moves as far as it does.
  {
    const { doc, world, surface, controller } = desk();
    controller.addBoardAt("pins-full", 0, 0);
    const r = controller.addComponentAt("resistor", "bb1", "a10");
    const p = at(doc, "bb1.a10");
    const ann = controller.addAnnotationAt("label", p.x, p.y - 1, r.id);
    drag(partEl(surface, r.id), world, p, { x: p.x + 5, y: p.y });
    assert.equal(doc.getComponent(r.id).anchor, "a15");
    assert.equal(doc.getAnnotation(ann.id).x, p.x + 5);
  }
  // A chip held at its pin 1's column: it and its label move by the travel.
  {
    const { doc, world, surface, controller } = desk();
    controller.addBoardAt("pins-full", 0, 0);
    const chip = controller.addComponentAt("74LS00", "bb1", "e10");
    const p = at(doc, "bb1.e10");
    const ann = controller.addAnnotationAt("label", p.x, p.y - 1, chip.id);
    drag(partEl(surface, chip.id), world, p, { x: p.x + 5, y: p.y });
    assert.equal(doc.getComponent(chip.id).anchor, "e15");
    assert.equal(doc.getAnnotation(ann.id).x, p.x + 5);
  }
  // One lead dragged two holes: the body's middle moves one.
  {
    const { doc, world, viewport, controller } = desk();
    controller.addBoardAt("pins-full", 0, 0);
    const r = controller.addComponentAt("resistor", "bb1", "a10");
    const ann = controller.addAnnotationAt("label", 11, 10, r.id);
    controller.setPinMode(true);
    const end = partPinsWorld(doc.boards, doc.getComponent(r.id))[1];
    drag(viewport, world, end, { x: end.x + 2, y: end.y }, { altKey: true });
    const pins = partPinsWorld(doc.boards, doc.getComponent(r.id));
    assert.equal(pins[1].x, end.x + 2, "the lead moved");
    assert.equal(doc.getAnnotation(ann.id).x, 12);
  }
  // A can spun about its middle: the label stays where it was.
  {
    const { doc, controller } = desk();
    controller.addBoardAt("pins-full", 0, 0);
    const can = controller.addComponentAt("osc-half", "bb1", "e10");
    const ann = controller.addAnnotationAt("label", 5, 5, can.id);
    controller.selectComponent(can.id);
    key(controller, "r");
    assert.notEqual(doc.getComponent(can.id).params.rot ?? 0, 0, "it turned");
    assert.deepEqual([doc.getAnnotation(ann.id).x, doc.getAnnotation(ann.id).y], [5, 5]); // prettier-ignore
  }
});

test("an Option/Alt drag that picks no lead pans the desk — editing or running; one on a lead drags the lead", () => {
  const { doc, world, viewport, surface, controller, pans } = desk();
  controller.addBoardAt("pins-full", 0, 0);
  const chip = controller.addComponentAt("74LS00", "bb1", "e10");
  const w = doc.addWire({ from: "bb1.a40", to: "bb1.a50" });
  changed();
  controller.deselect();
  const alt = { altKey: true };
  const press = (el, address) => {
    if (address) Object.assign(world, at(doc, address));
    fire(el, "pointerdown", { mods: alt });
    fire(el, "pointerup", { mods: alt });
  };
  // Bare desk, a board's holes, a chip's body: nothing to pick, so a pan.
  Object.assign(world, { x: -20, y: -20 });
  press(viewport);
  press(boardEl(surface, "bb1"), "bb1.a20");
  press(partEl(surface, chip.id), "bb1.e12");
  assert.equal(pans.length, 3);
  assert.equal(controller.selectedId, null, "and it selects nothing");
  // A wire end is a lead: that press picks it and is its drag, no pan.
  press(viewport, "bb1.a40");
  assert.equal(pans.length, 3);
  assert.equal(controller.selectedId, w.id, "its wire end is the pick");
  // Option/Alt+⌘/Ctrl on nothing is still the lead chord's miss — no pan.
  Object.assign(world, { x: -20, y: -20 });
  fire(viewport, "pointerdown", { mods: { altKey: true, metaKey: true, ctrlKey: true } }); // prettier-ignore
  assert.equal(pans.length, 3);
  // Running, the selection is refused but the pan is not.
  controller.setEditingLocked(true);
  press(viewport);
  press(partEl(surface, chip.id), "bb1.e12");
  assert.equal(pans.length, 5);
  assert.ok(doc.getWire(w.id), "nothing edited");
});
