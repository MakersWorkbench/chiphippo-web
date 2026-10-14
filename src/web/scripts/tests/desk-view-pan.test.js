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

// jsdom tests for where the PAN lives (components/desk-view.js), since the
// selection & drag model took it off the plain drag (CLAUDE.md → "Selection"):
// on the breadboard a left-drag on the empty desk is the rubber band, and the
// pan is Space-drag (from anywhere) or the middle button. The schematic keeps
// its plain-drag pan — there that drag means nothing else.

import test from "node:test";
import assert from "node:assert/strict";

import { resetDom } from "./jsdom-setup.js";

const { DeskView } = await import("../components/desk-view.js");

function mount(opts = {}) {
  const viewport = document.createElement("section");
  document.body.append(viewport);
  const deskView = new DeskView(viewport, {
    camera: { cx: 0, cy: 0, zoom: 1 },
    ...opts,
  });
  // Something ON the desk, the way a board or a part sits in the surface.
  const thing = document.createElement("div");
  deskView.surface.append(thing);
  return { viewport, deskView, thing };
}

/** Press on `el`, travel 40 px, release — returns the camera shift. */
function drag(deskView, el, button = 0) {
  const before = deskView.camera;
  const send = (type, x) =>
    el.dispatchEvent(
      new window.PointerEvent(type, {
        bubbles: true,
        button,
        pointerId: 3,
        clientX: x,
        clientY: 0,
      }),
    );
  send("pointerdown", 0);
  send("pointermove", 40);
  send("pointerup", 40);
  return deskView.camera.cx - before.cx;
}

test("breadboard: a plain left-drag on the empty desk does NOT pan", () => {
  resetDom();
  const { viewport, deskView } = mount({ panOnEmptyDrag: false });
  assert.equal(drag(deskView, viewport), 0);
});

test("schematic (the default): a plain left-drag on the empty desk pans", () => {
  resetDom();
  const { viewport, deskView } = mount();
  assert.notEqual(drag(deskView, viewport), 0);
});

test("the middle button pans from anywhere", () => {
  resetDom();
  const { deskView, thing } = mount({ panOnEmptyDrag: false });
  assert.notEqual(drag(deskView, thing, 1), 0);
});

test("Space held: a left-drag ANYWHERE pans, and what is under it never hears the press", () => {
  resetDom();
  const { viewport, deskView, thing } = mount({ panOnEmptyDrag: false });
  let heard = 0;
  thing.addEventListener("pointerdown", () => heard++);

  deskView.setSpaceHeld(true);
  assert.ok(viewport.classList.contains("desk-viewport--pan-ready"));
  assert.notEqual(drag(deskView, thing), 0, "panned off a thing on the desk");
  assert.equal(heard, 0, "the press was the pan's, claimed in capture");

  deskView.setSpaceHeld(false);
  assert.ok(!viewport.classList.contains("desk-viewport--pan-ready"));
  assert.equal(deskView.takeSpacePanned(), true, "the hold was used");
  assert.equal(deskView.takeSpacePanned(), false, "and reading it clears it");
});

test("a Space hold with no drag is a TAP — app.js runs the circuit on it", () => {
  resetDom();
  const { deskView } = mount({ panOnEmptyDrag: false });
  deskView.setSpaceHeld(true);
  deskView.setSpaceHeld(false);
  assert.equal(deskView.takeSpacePanned(), false);
});

test("Space held leaves the viewport's own chrome its clicks", () => {
  resetDom();
  const { viewport, deskView } = mount({ panOnEmptyDrag: false });
  const button = document.createElement("button"); // a zoom-cluster button
  viewport.append(button);
  let heard = 0;
  button.addEventListener("pointerdown", () => heard++);
  deskView.setSpaceHeld(true);
  assert.equal(drag(deskView, button), 0);
  assert.equal(heard, 1);
});
