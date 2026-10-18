/*
 * Copyright 2026 Jason Figge
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  appendScopeSample,
  autoTimeScale,
  autoVoltageScale,
  scopeMeasurements,
  triggerAt,
} from "../model/oscilloscope-trace.js";

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

test("oscilloscope autoscale chooses a fitting standard division", () => {
  assert.equal(autoVoltageScale(5, [0.5, 1, 2, 5]), 2);
  assert.equal(autoTimeScale(0.004, [0.0001, 0.001, 0.01]), 0.001);
});
