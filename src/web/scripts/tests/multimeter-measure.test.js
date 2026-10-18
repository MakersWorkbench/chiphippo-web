/*
 * Copyright 2026 Jason Figge
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";

import { equivalentValue } from "../sim/multimeter-measure.js";

const closeTo = (actual, expected, tolerance = 1e-12) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("multimeter combines series resistance", () => {
  const edges = [
    { a: "red", b: "middle", value: 100 },
    { a: "middle", b: "black", value: 200 },
  ];
  closeTo(equivalentValue(edges, "red", "black"), 300);
});

test("multimeter combines parallel resistance", () => {
  const edges = [
    { a: "red", b: "black", value: 100 },
    { a: "red", b: "black", value: 100 },
  ];
  closeTo(equivalentValue(edges, "red", "black"), 50);
});

test("multimeter combines parallel capacitance", () => {
  const edges = [
    { a: "red", b: "black", value: 1e-6 },
    { a: "red", b: "black", value: 2e-6 },
  ];
  closeTo(equivalentValue(edges, "red", "black", "parallel"), 3e-6);
});

test("multimeter combines series capacitance", () => {
  const edges = [
    { a: "red", b: "middle", value: 1e-6 },
    { a: "middle", b: "black", value: 1e-6 },
  ];
  closeTo(equivalentValue(edges, "red", "black", "parallel"), 0.5e-6);
});

test("multimeter reports an open circuit when no path joins the probes", () => {
  const edges = [{ a: "red", b: "elsewhere", value: 100 }];
  assert.equal(equivalentValue(edges, "red", "black"), null);
});
