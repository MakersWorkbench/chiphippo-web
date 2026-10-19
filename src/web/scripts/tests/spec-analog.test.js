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
import { PALETTE_DEFS, partDef } from "../catalog/index.js";
import { buildFromReply } from "../ai/generate.js";
import { compileNetlist } from "../model/autobuild.js";
import { coerceParams, paramHints } from "../model/spec-params.js";

const build = (spec) => buildFromReply(JSON.stringify(spec));
const codes = (result) => (result.faults ?? []).map((f) => f.code);

const divider = (extra = {}) => ({
  mode: "analog",
  supply: { volts: 9 },
  parts: [
    { id: "R1", ref: "resistor", params: { ohms: "1k" } },
    { id: "R2", ref: "resistor", params: { ohms: 2000 } },
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
});

test("params read the text a person types, or a plain number in base units", () => {
  const resistor = partDef("resistor");
  for (const [given, ohms] of [
    ["4.7k", 4700],
    [330, 330],
    ["2.2 megohm", 2200000],
    ["4k7", 4700],
  ]) {
    const result = coerceParams(resistor, { ohms: given });
    assert.equal(result.ok, true, String(given));
    assert.equal(result.params.ohms, ohms, String(given));
  }
  assert.equal(coerceParams(partDef("cap-electrolytic"), { farads: "100u" }).params.farads, 1e-4); // prettier-ignore
  assert.equal(coerceParams(partDef("led"), { color: "green" }).params.color, "green"); // prettier-ignore
  assert.equal(
    coerceParams(partDef("sw-toggle"), { on: true }).params.on,
    true,
  );
  assert.equal(coerceParams(partDef("psu"), { volts: 12 }).params.volts, 12);
});

test("params that the part would not keep are refused, never quietly changed", () => {
  const resistor = partDef("resistor");
  for (const bad of [0, -5, "abc", "5V", "1e12"]) {
    const result = coerceParams(resistor, { ohms: bad });
    assert.equal(result.ok, false, String(bad));
    assert.equal(result.errors[0].code, "PARAM_REJECTED", String(bad));
  }
  const unknown = coerceParams(resistor, { color: "red" });
  assert.equal(unknown.errors[0].code, "UNKNOWN_PARAM");
  assert.match(unknown.errors[0].message, /takes: ohms/);
  assert.equal(coerceParams(partDef("psu"), { volts: 7 }).ok, false);
  assert.equal(
    coerceParams(partDef("resistor"), { rot: 90 }).ok,
    false,
    "placement is the compiler's",
  );
  assert.equal(coerceParams(resistor, 5).errors[0].code, "BAD_PARAMS");
});

test("a spec with no params compiles exactly as before; one with params carries them", () => {
  const plain = compileNetlist({
    parts: [
      { id: "R1", ref: "resistor" },
      { id: "R2", ref: "resistor" },
    ],
    nets: [{ name: "A", members: ["R1.1", "R2.1"] }],
  });
  assert.equal(plain.ok, true);
  assert.deepEqual(
    plain.document.components
      .filter((c) => c.kind === "discrete")
      .map((c) => c.params),
    [{}, {}],
  );
  const given = compileNetlist(divider());
  assert.equal(given.ok, true);
  const byRef = (id) =>
    given.document.components.find((c) => c.id === given.partMap.get(id));
  assert.equal(byRef("R1").params.ohms, 1000);
  assert.equal(byRef("R2").params.ohms, 2000);
  assert.equal(
    given.document.components.find((c) => c.kind === "psu").params.volts,
    9,
  );
  const refused = compileNetlist({ ...divider(), supply: { volts: 7 } });
  assert.equal(refused.ok, false);
  assert.equal(refused.errors[0].code, "PARAM_REJECTED");
  assert.equal(
    compileNetlist({ ...divider(), mode: "weird" }).errors[0].code,
    "BAD_MODE",
  );
});

test("analog mode adds nothing: an LED keeps no resistor it was not given", () => {
  const spec = {
    mode: "analog",
    parts: [{ id: "L1", ref: "led" }],
    nets: [
      { name: "A", members: ["L1.A", "VCC"] },
      { name: "K", members: ["L1.K", "GND"] },
    ],
  };
  const analog = compileNetlist(spec);
  assert.equal(analog.ok, true);
  assert.deepEqual(
    analog.document.components
      .filter((c) => c.kind === "discrete")
      .map((c) => c.ref),
    ["led"],
  );
  const digital = compileNetlist({ ...spec, mode: undefined });
  assert.ok(digital.document.components.some((c) => c.ref === "resistor" || c.ref === "rnet9"), "digital mode still limits the LED"); // prettier-ignore
});

test("an analog spec is judged by voltages and currents", () => {
  const ok = build(divider());
  assert.equal(ok.ok, true, JSON.stringify(ok.faults));
  assert.equal(ok.results.length, 2);

  const wrong = build(
    divider({
      tests: [
        { name: "wrong", expect: [{ target: "R1.2", volts: 5 }] },
        { name: "right", expect: [{ target: "R1.2", amps: 0.003 }] },
      ],
    }),
  );
  assert.deepEqual(codes(wrong), ["TEST_FAILED"]);
  assert.match(wrong.faults[0].message, /R1\.2 is 6 V, expected 5 V/);

  const across = build(
    divider({
      tests: [
        {
          name: "drops",
          expect: [
            { target: "R1.1", minus: "R1.2", volts: 3 },
            { target: "R2.1", minus: "R2.2", volts: 6 },
          ],
        },
      ],
    }),
  );
  assert.equal(across.ok, true, JSON.stringify(across.faults));

  assert.deepEqual(codes(build(divider({ tests: [{ name: "one", expect: [{ target: "R1.2", volts: 6 }] }] }))), ["TOO_FEW_TESTS"]); // prettier-ignore
  const level = build(
    divider({
      tests: [
        { name: "level", expect: [{ target: "R1.2", value: "H" }] },
        { name: "amps", expect: [{ target: "R1.2", amps: 0.003 }] },
      ],
    }),
  );
  assert.deepEqual(codes(level), ["TEST_INVALID"]);
});

test("an LED with no (or too small) series resistor is a fault, a sized one is fine", () => {
  const led = (ohms) => ({
    mode: "analog",
    supply: { volts: 5 },
    parts: [
      { id: "L1", ref: "led", params: { color: "red" } },
      ...(ohms ? [{ id: "R1", ref: "resistor", params: { ohms } }] : []),
    ],
    nets: ohms
      ? [
          { name: "A", members: ["R1.1", "VCC"] },
          { name: "B", members: ["R1.2", "L1.A"] },
          { name: "K", members: ["L1.K", "GND"] },
        ]
      : [
          { name: "A", members: ["L1.A", "VCC"] },
          { name: "K", members: ["L1.K", "GND"] },
        ],
    tests: [
      {
        name: "anode",
        expect: [
          { target: "L1.A", volts: ohms ? 1.9 : 5, tolerancePercent: 15 },
        ],
      },
      { name: "cathode", expect: [{ target: "L1.K", volts: 0 }] },
    ],
  });
  assert.ok(codes(build(led(0))).includes("LED_BURNS"));
  assert.ok(codes(build(led(10))).includes("LED_BURNS"));
  assert.equal(build(led(300)).ok, true);
});

test("time is real: a capacitor is read after it has charged for that long", () => {
  const rc = (time, volts) => ({
    mode: "analog",
    supply: { volts: 5 },
    parts: [
      { id: "R1", ref: "resistor", params: { ohms: "10k" } },
      { id: "C1", ref: "cap-electrolytic", params: { farads: "100u" } },
    ],
    nets: [
      { name: "T", members: ["R1.1", "VCC"] },
      { name: "M", members: ["R1.2", "C1.1"] },
      { name: "G", members: ["C1.2", "GND"] },
    ],
    tests: [
      {
        name: "charge",
        time,
        expect: [{ target: "C1.1", volts, tolerancePercent: 6 }],
      },
      {
        name: "start",
        time: 0,
        expect: [{ target: "C1.1", volts: 0, tolerancePercent: 0 }],
      },
    ],
  });
  assert.equal(build(rc(1, 3.16)).ok, true, "one time constant: 63 % of 5 V");
  assert.deepEqual(codes(build(rc(0.2, 3.16))), ["TEST_FAILED"], "too early");
});

test("a part of every kind can be placed in an analog spec", () => {
  const skipped = new Set(["osc-full", "osc-half"]); // multi-corner cans
  const unplaceable = [];
  for (const def of PALETTE_DEFS) {
    if (skipped.has(def.id)) continue;
    const pins = (def.pins ?? [])
      .filter((p) => p.role !== "vcc" && p.role !== "gnd")
      .slice(0, 4);
    const parts = [{ id: "X", ref: def.id }];
    const nets = [];
    pins.forEach((pin, i) => {
      parts.push({ id: `R${i}`, ref: "resistor" });
      nets.push({ name: `N${i}`, members: [`X.#${pin.n}`, `R${i}.1`] });
      nets.push({ name: `G${i}`, members: [`R${i}.2`, "GND"] });
    });
    if (def.kind === "clock") {
      parts.push({ id: "R9", ref: "resistor" });
      nets.push(
        { name: "CK", members: ["X.out", "R9.1"] },
        { name: "CG", members: ["R9.2", "GND"] },
      );
    }
    if (!nets.length) continue;
    if (!compileNetlist({ mode: "analog", parts, nets }).ok)
      unplaceable.push(def.id);
  }
  assert.deepEqual(unplaceable, []);
});

test("the catalog listing says what each part's settings take", () => {
  assert.ok(
    paramHints(partDef("resistor"))[0].startsWith(
      "ohms: 0.1 to 100000000 ohms",
    ),
  );
  assert.ok(
    paramHints(partDef("psu")).some((h) =>
      h.startsWith("volts: one of 3, 5, 9, 12, 15"),
    ),
  );
  assert.deepEqual(paramHints(partDef("sw-push")), []);
});
