/*
 * Copyright 2026 Charles Gantt
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

import test from "node:test";
import assert from "node:assert/strict";
import { partDef } from "../catalog/index.js";

test("direct-use sensor catalog is registered", () => {
  const ids = [
    "sensor-ldr",
    "sensor-ntc",
    "sensor-joystick",
    "sensor-encoder",
    "sensor-keypad",
    "sensor-sound",
    "sensor-flame",
    "sensor-gas",
    "sensor-heartbeat",
    "sensor-pir",
    "sensor-hall",
    "sensor-tilt",
    "sensor-reed",
    "sensor-vibration",
  ];
  for (const id of ids) {
    const def = partDef(id);
    assert.ok(def, id);
    assert.equal(def.group, "Sensors", id);
    assert.ok(def.sensor, id);
  }
});

test("photoresistor gets less resistive as illumination rises", () => {
  const ldr = partDef("sensor-ldr");
  assert.equal(ldr.resistance({ level: 0 }), 1e6);
  assert.ok(Math.abs(ldr.resistance({ level: 100 }) - 1e3) < 1e-9);
  assert.ok(ldr.resistance({ level: 25 }) > ldr.resistance({ level: 75 }));
});

test("10k NTC follows temperature in the correct direction", () => {
  const ntc = partDef("sensor-ntc");
  assert.ok(Math.abs(ntc.resistance({ celsius: 25 }) - 10000) < 1e-9);
  assert.ok(ntc.resistance({ celsius: -10 }) > 10000);
  assert.ok(ntc.resistance({ celsius: 80 }) < 10000);
});

test("analog modules expose a divider and threshold output", () => {
  const sound = partDef("sensor-sound");
  assert.deepEqual(sound.weakBridges({ level: 25, threshold: 60 }), [
    [4, 1, 75000],
    [4, 2, 25000],
  ]);
  assert.deepEqual(sound.internalBridges({ level: 25, threshold: 60 }), [
    [3, 2],
  ]);
  assert.deepEqual(sound.internalBridges({ level: 75, threshold: 60 }), [
    [3, 1],
  ]);
});

test("digital and contact sensors toggle their electrical contacts", () => {
  const pir = partDef("sensor-pir");
  assert.deepEqual(pir.internalBridges({}), [[2, 3]]);
  assert.deepEqual(pir.internalBridges({ active: true }), [[2, 1]]);
  assert.deepEqual(pir.clickToggle({}), { active: true });

  const reed = partDef("sensor-reed");
  assert.deepEqual(reed.internalBridges({}), []);
  assert.deepEqual(reed.internalBridges({ active: true }), [[1, 2]]);
});

test("joystick produces two independent 10k dividers and a switch", () => {
  const joystick = partDef("sensor-joystick");
  assert.deepEqual(joystick.weakBridges({ x: 25, y: 75 }), [
    [3, 2, 7500],
    [3, 1, 2500],
    [4, 2, 2500],
    [4, 1, 7500],
  ]);
  assert.deepEqual(joystick.internalBridges({ x: 50, y: 50, pressed: true }), [
    [5, 1],
  ]);
});

test("rotary encoder emits quadrature phases with pull-ups", () => {
  const def = partDef("sensor-encoder");
  assert.deepEqual(def.internalBridges({ phase: 0 }), []);
  assert.deepEqual(def.internalBridges({ phase: 1 }), [[5, 1]]);
  assert.deepEqual(def.internalBridges({ phase: 2, pressed: true }), [
    [3, 1],
    [4, 1],
    [5, 1],
  ]);
  assert.deepEqual(def.internalBridges({ phase: 3 }), [[4, 1]]);
  assert.deepEqual(def.weakBridges({}), [
    [3, 2, 10000],
    [4, 2, 10000],
    [5, 2, 10000],
  ]);
});

test("4x4 keypad closes exactly the selected matrix contact", () => {
  const def = partDef("sensor-keypad");
  assert.deepEqual(def.internalBridges({ key: "none" }), []);
  assert.deepEqual(def.internalBridges({ key: "1" }), [[1, 5]]);
  assert.deepEqual(def.internalBridges({ key: "6" }), [[2, 7]]);
  assert.deepEqual(def.internalBridges({ key: "D" }), [[4, 8]]);
});
