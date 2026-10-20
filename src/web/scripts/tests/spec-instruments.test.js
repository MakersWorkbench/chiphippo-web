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

import assert from "node:assert/strict";
import test from "node:test";
import { buildFromReply } from "../ai/generate.js";
import {
  normalizeInstruments,
  normalizeProject,
} from "../model/project-doc.js";

const build = (extra = {}) =>
  buildFromReply(
    JSON.stringify({
      title: "Two resistors",
      mode: "analog",
      supply: { volts: 9 },
      parts: [
        { id: "R1", ref: "resistor", params: { ohms: "1k" } },
        { id: "R2", ref: "resistor", params: { ohms: "2k" } },
      ],
      nets: [
        { name: "TOP", members: ["R1.1", "VCC"] },
        { name: "MID", members: ["R1.2", "R2.1"] },
        { name: "LOW", members: ["R2.2", "GND"] },
      ],
      tests: [
        { name: "middle", expect: [{ target: "R1.2", volts: 6 }] },
        { name: "current", expect: [{ target: "R1.2", amps: 0.003 }] },
      ],
      ...extra,
    }),
  );

test("a spec without instruments builds exactly as before", () => {
  const built = build();
  assert.equal(built.ok, true);
  assert.equal("instruments" in built, false);
});

test("the multimeter's pins resolve to desk addresses on the built circuit", () => {
  const built = build({
    instruments: { multimeter: { mode: "voltage", red: "R1.1", black: "R2.2" } },
  });
  assert.equal(built.ok, true, JSON.stringify(built.faults));
  const m = built.instruments.multimeter;
  assert.equal(m.mode, "voltage");
  assert.match(m.red, /^bb\d+\.[a-j]\d+$/);
  assert.match(m.black, /^bb\d+\.[a-j]\d+$/);
  assert.notEqual(m.red, m.black);
});

test("a probe on a resistor pin lands on a board hole", () => {
  const built = build({
    instruments: { multimeter: { red: "R1.1" } },
  });
  assert.equal(built.ok, true);
  assert.equal(built.instruments.multimeter.red.startsWith("bb"), true);
});

test("a probe at a part that is not in the spec is a named fault", () => {
  const built = build({ instruments: { multimeter: { red: "R9.1" } } });
  assert.equal(built.ok, false);
  assert.equal(built.faults[0].code, "BAD_PROBE");
  assert.match(built.faults[0].message, /no part "R9"/);
});

test("a pin the part does not have is refused, not guessed", () => {
  const built = build({ instruments: { multimeter: { red: "R1.9" } } });
  assert.equal(built.ok, false);
  assert.equal(built.faults[0].code, "BAD_PROBE");
});

test("an unknown instrument is refused", () => {
  const built = build({ instruments: { voltmeter: { red: "R1.1" } } });
  assert.equal(built.ok, false);
  assert.equal(built.faults[0].code, "UNKNOWN_INSTRUMENT");
});

test("normalizeInstruments keeps good keys and drops the rest", () => {
  assert.equal(normalizeInstruments(null), null);
  assert.equal(normalizeInstruments({ multimeter: { mode: "bogus" } }), null);
  assert.deepEqual(
    normalizeInstruments({
      junk: 1,
      multimeter: { mode: "current", red: "bb1.a1", black: "x y", visible: true },
      oscilloscope: {
        timePerDiv: 0.25,
        triggerChannel: "ch2",
        probes: { ch1: "clk1.out", ground: "psu1.-", extra: "no" },
      },
    }),
    {
      multimeter: { mode: "current", red: "bb1.a1", visible: true },
      oscilloscope: {
        timePerDiv: 0.25,
        triggerChannel: "ch2",
        probes: { ch1: "clk1.out", ground: "psu1.-" },
      },
    },
  );
});

test("a desktop's instruments survive normalizeProject, and are omitted when absent", () => {
  const doc = { boards: [], components: [], wires: [] };
  const raw = {
    version: 5,
    name: "x",
    activeTab: "t1",
    nextIndex: 2,
    tabs: [
      {
        id: "t1",
        name: "One",
        doc,
        instruments: { multimeter: { mode: "voltage", red: "bb1.a1" } },
      },
      { id: "t2", name: "Two", doc },
    ],
  };
  const project = normalizeProject(raw);
  assert.deepEqual(project.tabs[0].instruments, {
    multimeter: { mode: "voltage", red: "bb1.a1" },
  });
  assert.equal("instruments" in project.tabs[1], false);
  assert.equal(project.version, 5);
});
