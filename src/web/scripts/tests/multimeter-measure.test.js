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
