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

// spec-instruments.js — a spec's optional `instruments` block, resolved.
//
// A spec names the instruments a circuit should open with, in the spec's own
// words (a part id and a pin, `R1.1`):
//
//   "instruments": {
//     "multimeter":   { "mode": "voltage", "red": "R1.1", "black": "R4.2" },
//     "oscilloscope": { "probes": { "ch1": "R1.2", "ground": "R4.2" },
//                       "timePerDiv": 0.25 }
//   }
//
// The compiler owns geometry, so the holes are never written by hand: this
// module turns each `<partId>.<pin>` into the desk address the document uses
// (`bb1.e12`, `psu1.+`), through the same pin resolver the nets use, and fails
// closed with a named fault when a probe points at nothing. What comes out is
// the shape `project-doc.js`'s `normalizeInstruments` keeps on a desktop.

import { resolvePin, parseMember } from "./pin-resolve.js";
import { normalizeInstruments } from "./project-doc.js";
import { partPinAddresses } from "./occupancy.js";

const PROBE_KEYS = {
  multimeter: ["red", "black"],
  oscilloscope: ["ch1", "ch2", "ground"],
};

const fault = (code, message) => ({
  gate: "L9",
  kind: "repair",
  code,
  message,
});

/**
 * @param {object|undefined} raw      `spec.instruments`
 * @param {object} spec               the spec (for each part's catalog ref)
 * @param {object} doc                the verified, compiled document
 * @param {Map<string,string>} partMap spec id → document id
 * @returns {{instruments: object|null, faults: Array}}
 */
export function resolveInstruments(raw, spec, doc, partMap) {
  if (raw == null) return { instruments: null, faults: [] };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      instruments: null,
      faults: [fault("BAD_INSTRUMENTS", '"instruments" must be an object.')],
    };
  }
  const faults = [];
  const refOf = new Map((spec?.parts ?? []).map((p) => [p.id, p.ref]));

  const addressOf = (token, where) => {
    const member = parseMember(token);
    if (member?.kind !== "part") {
      faults.push(
        fault(
          "BAD_PROBE",
          `${where}: "${token}" is not a part pin (write it like "R1.1").`,
        ),
      );
      return null;
    }
    const ref = refOf.get(member.partId);
    const compId = partMap?.get(member.partId);
    if (!ref || !compId) {
      faults.push(
        fault("BAD_PROBE", `${where}: there is no part "${member.partId}".`),
      );
      return null;
    }
    const pin = resolvePin(ref, member.pinToken);
    if (!pin.ok) {
      faults.push(fault("BAD_PROBE", `${where}: ${pin.message}`));
      return null;
    }
    if (pin.kind === "terminal") return `${compId}.${pin.terminal}`;
    const comp = doc.components.find((c) => c.id === compId);
    const found = comp
      ? partPinAddresses(doc, comp)?.find((p) => p.pin === pin.pin)
      : null;
    if (!found?.address) {
      faults.push(
        fault(
          "BAD_PROBE",
          `${where}: "${token}" does not touch a hole, so a probe cannot sit on it.`,
        ),
      );
      return null;
    }
    return found.address;
  };

  const out = {};
  for (const [name, setup] of Object.entries(raw)) {
    if (!(name in PROBE_KEYS)) {
      faults.push(
        fault(
          "UNKNOWN_INSTRUMENT",
          `instruments.${name} is not an instrument (use multimeter or oscilloscope).`,
        ),
      );
      continue;
    }
    if (!setup || typeof setup !== "object") {
      faults.push(fault("BAD_INSTRUMENTS", `instruments.${name} must be an object.`));
      continue;
    }
    const copy = { ...setup };
    if (name === "multimeter") {
      for (const key of PROBE_KEYS.multimeter) {
        if (setup[key] != null) {
          copy[key] = addressOf(setup[key], `instruments.multimeter.${key}`);
        }
      }
    } else if (setup.probes && typeof setup.probes === "object") {
      copy.probes = {};
      for (const key of PROBE_KEYS.oscilloscope) {
        if (setup.probes[key] != null) {
          copy.probes[key] = addressOf(
            setup.probes[key],
            `instruments.oscilloscope.probes.${key}`,
          );
        }
      }
    }
    out[name] = copy;
  }
  if (faults.length) return { instruments: null, faults };
  return { instruments: normalizeInstruments(out), faults: [] };
}
