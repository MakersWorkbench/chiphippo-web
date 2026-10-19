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
import { readFileSync } from "node:fs";
import { resetDom } from "./jsdom-setup.js";
import { readNet } from "../model/scope-recorder.js";
import {
  appendScopeSample,
  autoTimeScale,
  autoVoltageScale,
  extendScopeSamples,
  resampleScopeWindow,
  scopeWindow,
  scopeMeasurements,
  triggerAt,
} from "../model/oscilloscope-trace.js";

const { SimController } = await import("../components/sim-controller.js");
const { Oscilloscope } = await import("../components/oscilloscope.js");

function fakeDoc(raw) {
  const doc = JSON.parse(JSON.stringify(raw));
  return {
    toJSON: () => doc,
    getComponent: (id) => doc.components.find((c) => c.id === id) ?? null,
    setComponentParams(id, patch) {
      const component = doc.components.find((c) => c.id === id);
      component.params = { ...component.params, ...patch };
      return component;
    },
  };
}

function fakeClock() {
  let now = 0;
  let seq = 0;
  const pending = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      pending.set(++seq, { at: now + Math.max(0, ms), fn });
      return seq;
    },
    clearTimeout: (id) => pending.delete(id),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let due = null;
        for (const entry of pending) {
          if (entry[1].at <= end && (!due || entry[1].at < due[1].at)) {
            due = entry;
          }
        }
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

test("sparse simulator events become a full sample-and-hold DSO record", () => {
  const record = resampleScopeWindow(
    [
      { at: 0, ch1: 0, ch2: 5 },
      { at: 0.5, ch1: 5, ch2: 5 },
      { at: 1, ch1: 0, ch2: 0 },
    ],
    0,
    1,
    5,
  );
  assert.deepEqual(
    record.map(({ ch1, ch2 }) => [ch1, ch2]),
    [
      [0, 5],
      [0, 5],
      [5, 5],
      [5, 5],
      [0, 0],
    ],
  );
});

test("triggered scope windows keep the edge at a fixed screen position", () => {
  const samples = [
    { at: 0, ch1: 0 },
    { at: 1, ch1: 5 },
    { at: 1.5, ch1: 0 },
    { at: 2, ch1: 5 },
    { at: 3, ch1: 5 },
  ];
  assert.deepEqual(scopeWindow(samples, { span: 2, triggerPosition: 0.25 }), {
    start: 0.5,
    end: 2.5,
    trigger: 1,
  });
});

test("roll mode continuously follows the newest sample", () => {
  const samples = [
    { at: 1, ch1: 0 },
    { at: 4, ch1: 5 },
  ];
  assert.deepEqual(scopeWindow(samples, { mode: "roll", span: 2 }), {
    start: 2,
    end: 4,
    trigger: null,
  });
});

test("normal waits for a trigger while auto keeps drawing", () => {
  const samples = [
    { at: 1, ch1: 0 },
    { at: 1.5, ch1: 0 },
  ];
  assert.equal(scopeWindow(samples, { mode: "normal", span: 1 }), null);
  assert.deepEqual(scopeWindow(samples, { mode: "auto", span: 1 }), {
    start: 0.5,
    end: 1.5,
    trigger: null,
    acquiring: true,
  });
});

test("auto publishes a stationary full record when no trigger qualifies", () => {
  const samples = [
    { at: 1, ch1: 0 },
    { at: 1.5, ch1: 5 },
    { at: 2, ch1: 0 },
  ];
  assert.deepEqual(scopeWindow(samples, { mode: "auto", span: 1 }), {
    start: 1,
    end: 2,
    trigger: null,
    freeRun: true,
  });
});

test("auto free-run holds a completed record until the next record finishes", () => {
  const early = [
    { at: 0, ch1: 0 },
    { at: 1, ch1: 0 },
    { at: 2.1, ch1: 0 },
  ];
  const later = [...early, { at: 2.9, ch1: 0 }];
  const expected = {
    start: 1,
    end: 2,
    trigger: null,
    freeRun: true,
  };
  assert.deepEqual(scopeWindow(early, { mode: "auto", span: 1 }), expected);
  assert.deepEqual(scopeWindow(later, { mode: "auto", span: 1 }), expected);
});

test("oscilloscope finds rising and falling trigger edges", () => {
  const samples = [
    { at: 0, ch1: 0 },
    { at: 1, ch1: 5 },
    { at: 2, ch1: 0 },
    { at: 3, ch1: 5 },
  ];
  assert.equal(triggerAt(samples, "ch1", "rising", 2.5), 3);
  assert.equal(triggerAt(samples, "ch1", "falling", 2.5), 2);
  assert.equal(triggerAt(samples, "ch1", "rising", 2.5, 2.5), 1);
});

test("oscilloscope history remains bounded", () => {
  const samples = [];
  for (let at = 0; at < 5; at += 1) appendScopeSample(samples, { at }, 3);
  assert.deepEqual(
    samples.map((sample) => sample.at),
    [2, 3, 4],
  );
});

test("roll display advances smoothly without inventing signal edges", () => {
  const samples = [{ at: 1, ch1: 5, ch2: 0 }];
  const display = extendScopeSamples(samples, 1.25);
  assert.deepEqual(display, [
    { at: 1, ch1: 5, ch2: 0 },
    { at: 1.25, ch1: 5, ch2: 0 },
  ]);
  assert.equal(samples.length, 1, "synthetic display tail is not recorded");
});

test("oscilloscope measures voltage and repeating timing", () => {
  const samples = [];
  for (let i = 0; i <= 12; i += 1) {
    samples.push({ at: i * 0.001, ch1: i % 4 < 2 ? 0 : 5 });
  }
  const measured = scopeMeasurements(samples, "ch1", { threshold: 2.5 });
  assert.equal(measured.min, 0);
  assert.equal(measured.max, 5);
  assert.equal(measured.peakToPeak, 5);
  assert.ok(Math.abs(measured.frequency - 250) < 1e-9);
  assert.ok(measured.dutyCycle > 40 && measured.dutyCycle < 60);
});

test("duty cycle ignores partial cycles at the record edges", () => {
  const measured = scopeMeasurements(
    [
      { at: 0, ch1: 5 },
      { at: 0.2, ch1: 0 },
      { at: 0.7, ch1: 5 },
      { at: 1.2, ch1: 0 },
      { at: 1.7, ch1: 5 },
      { at: 2.2, ch1: 0 },
      { at: 2.3, ch1: 0 },
    ],
    "ch1",
    { threshold: 2.5 },
  );
  assert.equal(measured.dutyCycle, 50);
});

test("oscilloscope autoscale chooses a fitting standard division", () => {
  assert.equal(autoVoltageScale(5, [0.5, 1, 2, 5]), 2);
  assert.equal(autoTimeScale(0.004, [0.0001, 0.001, 0.01]), 0.001);
});

test("oscilloscope lesson exposes the clock and divide-by-two waveforms", () => {
  resetDom();
  const payload = JSON.parse(
    readFileSync(new URL("../../demos/74LS74.json", import.meta.url), "utf8"),
  );
  const clock = fakeClock();
  const sim = new SimController({
    deskDoc: fakeDoc(payload.doc),
    notifications: { notify() {}, dismiss() {} },
    clock,
  });
  sim.setSpiceLite({ enabled: true });
  const ch1 = [];
  const ch2 = [];
  const samples = [];
  const onTick = (event) => {
    const a = readNet("clk1.out", event.detail);
    const b = readNet("bb2.g31", event.detail);
    ch1.push(a);
    ch2.push(b);
    samples.push({
      at: event.detail.at,
      ch1: a === "H" ? 5 : 0,
      ch2: b === "H" ? 5 : 0,
    });
  };
  window.addEventListener("chiphippo:sim-tick", onTick);
  sim.start();
  clock.advance(5000);
  sim.stop();
  window.removeEventListener("chiphippo:sim-tick", onTick);

  assert.deepEqual(new Set(ch1), new Set(["L", "H"]));
  assert.deepEqual(new Set(ch2), new Set(["L", "H"]));
  const frame = scopeWindow(samples, {
    channel: "ch2",
    mode: "auto",
    span: 2.5,
    triggerPosition: 0.3,
  });
  assert.ok(frame?.trigger != null, "CH2 produces a completed triggered frame");
});

test("oscilloscope lesson renders both signals as square waves", async () => {
  resetDom();
  const payload = JSON.parse(
    readFileSync(new URL("../../demos/74LS74.json", import.meta.url), "utf8"),
  );
  const viewport = document.createElement("div");
  const overlay = document.createElement("div");
  viewport.append(overlay);
  document.body.append(viewport);
  const scope = new Oscilloscope({
    viewport,
    overlay,
    hitTest: () => null,
    addressWorld: () => null,
  });
  assert.match(viewport.textContent, /Trigger position/);
  scope.loadSetup({
    visible: true,
    timePerDiv: 0.25,
    voltsPerDiv: 1,
    triggerChannel: "ch2",
    triggerMode: "auto",
    probes: { ch1: "clk1.out", ch2: "bb2.g31", ground: "psu1.-" },
  });
  const clock = fakeClock();
  const sim = new SimController({
    deskDoc: fakeDoc(payload.doc),
    notifications: { notify() {}, dismiss() {} },
    clock,
  });
  sim.setSpiceLite({ enabled: true });
  sim.start();
  clock.advance(5000);
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  sim.stop();

  for (const channel of ["ch1", "ch2"]) {
    const path = viewport.querySelector(`.oscilloscope-trace--${channel}`);
    assert.ok(path, `${channel} has a rendered trace`);
    const yValues = [...path.getAttribute("d").matchAll(/V ([\d.]+)/g)].map(
      (match) => Number(match[1]),
    );
    const levels = new Set(yValues);
    assert.ok(
      levels.size >= 2,
      `${channel} renders more than one voltage level`,
    );
    const transitions = yValues
      .slice(1)
      .filter((value, index) => value !== yValues[index]);
    assert.ok(transitions.length >= 2, `${channel} renders a repeating wave`);
  }
  assert.equal(
    viewport.querySelectorAll(".oscilloscope-axis-label--time").length,
    11,
  );
  assert.equal(
    viewport.querySelectorAll(".oscilloscope-axis-label--ch1").length,
    7,
  );
  assert.equal(
    viewport.querySelectorAll(".oscilloscope-axis-label--ch2").length,
    7,
  );
  assert.equal(
    viewport.querySelectorAll(".oscilloscope-zero-marker").length,
    2,
  );

  const measurements = viewport.querySelector(".oscilloscope-measurements");
  assert.match(measurements.textContent, /CH1 Vpp 5 V/);
  assert.match(measurements.textContent, /CH2 Vpp/);
  const completedMeasurements = measurements.textContent;
  const triggerMode = viewport.querySelector(
    'select[aria-label="Trigger mode"]',
  );
  const triggerLevel = viewport.querySelector(
    'input[aria-label="Trigger voltage"]',
  );
  triggerMode.value = "normal";
  triggerMode.dispatchEvent(new Event("change", { bubbles: true }));
  triggerLevel.value = "50";
  triggerLevel.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  assert.equal(
    measurements.textContent,
    completedMeasurements,
    "completed measurements stay visible while Normal waits for a trigger",
  );
  triggerLevel.value = "2.5";
  triggerLevel.dispatchEvent(new Event("change", { bubbles: true }));
  triggerMode.value = "auto";
  triggerMode.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((resolve) => window.requestAnimationFrame(resolve));

  const trace = (channel) =>
    viewport.querySelector(`.oscilloscope-trace--${channel}`).getAttribute("d");
  const marker = (channel) =>
    viewport
      .querySelector(`.oscilloscope-zero-marker--${channel}`)
      .getAttribute("points");
  const ch1Before = trace("ch1");
  const ch2Before = trace("ch2");
  const ch1MarkerBefore = marker("ch1");
  const ch1Offset = viewport.querySelector(
    'input[aria-label="CH1 vertical offset"]',
  );
  ch1Offset.value = "-1";
  ch1Offset.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  assert.notEqual(trace("ch1"), ch1Before, "CH1 position moves CH1");
  assert.equal(trace("ch2"), ch2Before, "CH1 position leaves CH2 unchanged");
  assert.notEqual(
    marker("ch1"),
    ch1MarkerBefore,
    "CH1 position moves its zero marker",
  );

  const ch1After = trace("ch1");
  const ch2Offset = viewport.querySelector(
    'input[aria-label="CH2 vertical offset"]',
  );
  ch2Offset.value = "1";
  ch2Offset.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  assert.equal(trace("ch1"), ch1After, "CH2 position leaves CH1 unchanged");
  assert.notEqual(trace("ch2"), ch2Before, "CH2 position moves CH2");
});
