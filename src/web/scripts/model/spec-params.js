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

// spec-params.js — what a netlist spec may say ABOUT a part, beyond which part
// it is and which pins it joins: its VALUES ("ohms": 330, "farads": "100u",
// "volts": 9) and its starting state ("on": true).
//
// A spec part carries an optional `params` object:
//
//   { "id": "R1", "ref": "resistor", "params": { "ohms": "4.7k" } }
//   { "id": "C1", "ref": "cap-electrolytic", "params": { "farads": 100e-6 } }
//   { "id": "SW1", "ref": "sw-toggle", "params": { "on": true } }
//
// The part's own catalog definition decides what is allowed, so this module
// holds no list of parts or units:
//
//   * a key must be one the part's Properties dialog edits (or one its own
//     `normalizeParams` knows), else UNKNOWN_PARAM names the keys it does take;
//   * a value-field key (`ohms`, `farads`, `henries`, …) takes the same text a
//     person types into that field — "4.7k", "100uF", "2.2 megohm" — or a plain
//     number in base units (SI: ohms, farads, volts, henries), and is held to
//     the field's own range;
//   * every other key goes through the part's `normalizeParams`, and a value it
//     would not keep (out of range, not one of the choices) is PARAM_REJECTED
//     with what it kept instead — never silently changed.
//
// Pure and DOM-free, so the spec compiler, the checks and the tests share it.

/** Keys that describe how a part is turned or bent, not what it is: a spec
    never sets them (the compiler decides every placement). */
// `ref` is a part SWAP on the Properties card (a capacitor's type, a transistor's
// polarity); in a spec the part's `ref` already says it.
const PLACEMENT_KEYS = new Set(["rot", "end", "legs", "wide", "flip", "ref"]);

const sameNumber = (a, b) =>
  typeof a === "number" &&
  typeof b === "number" &&
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** The param keys a def accepts from a spec, with the field that edits each. */
export function paramKeysOf(def) {
  const keys = new Map();
  for (const field of def?.properties ?? []) {
    if (field?.key && !PLACEMENT_KEYS.has(field.key))
      keys.set(field.key, field);
  }
  const defaults = def?.normalizeParams?.({}) ?? {};
  for (const key of Object.keys(defaults)) {
    if (!PLACEMENT_KEYS.has(key) && !keys.has(key)) keys.set(key, null);
  }
  return keys;
}

const describeRead = (error, field) => {
  const kind = error?.error;
  const range = field?.range;
  const span =
    range && Number.isFinite(range.min) && Number.isFinite(range.max)
      ? ` (allowed ${range.min} to ${range.max} in base units)`
      : "";
  if (kind === "range") return `out of range${span}`;
  if (kind === "wrongUnit") return "that is a different kind of quantity";
  if (kind === "empty") return "it is empty";
  return `not a value this part reads${span}`;
};

/**
 * Validate and normalize one part's spec params.
 *
 * @param {object} def  the catalog definition
 * @param {unknown} raw  the spec's `params`
 * @returns {{ok:true, params:object} | {ok:false, errors:{code:string, message:string}[]}}
 *   `params` is the def's FULL normalized params (what the desk stores).
 */
export function coerceParams(def, raw) {
  if (raw == null)
    return { ok: true, params: def?.normalizeParams?.({}) ?? {} };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      errors: [{ code: "BAD_PARAMS", message: "params must be an object." }],
    };
  }
  const allowed = paramKeysOf(def);
  const errors = [];
  let merged = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key)) {
      errors.push({
        code: "UNKNOWN_PARAM",
        message:
          `"${key}" is not a setting of "${def.id}". ` +
          (allowed.size
            ? `It takes: ${[...allowed.keys()].join(", ")}.`
            : `It takes no settings.`),
      });
      continue;
    }
    const field = allowed.get(key);
    // A value field reads what a person types into it, so a spec says "4.7k"
    // exactly as the Properties card would, and a bare number is base units.
    if (field?.type === "combo" && typeof field.read === "function") {
      // The part's own settings are the context a field reads in (a transistor's
      // part-number list depends on its type).
      const read = field.read(String(value), {
        ...(def.normalizeParams?.({}) ?? {}),
        ref: def.id,
        ...merged,
      });
      if (read.error) {
        errors.push({
          code: "PARAM_REJECTED",
          message: `${key}: "${value}" is ${describeRead(read.error, field)}.`,
        });
        continue;
      }
      merged = { ...merged, ...read.patch };
    } else {
      merged = { ...merged, [key]: value };
    }
  }
  if (errors.length) return { ok: false, errors };

  const normalized = def.normalizeParams ? def.normalizeParams(merged) : merged;
  const defaults = def.normalizeParams?.({}) ?? {};
  for (const [key, wanted] of Object.entries(merged)) {
    const got = normalized[key];
    const kept =
      got === wanted ||
      sameNumber(got, wanted) ||
      // A value equal to the default is omitted by some normalizers.
      (got === undefined && (defaults[key] === wanted || sameNumber(defaults[key], wanted))); // prettier-ignore
    if (!kept) {
      errors.push({
        code: "PARAM_REJECTED",
        message:
          `${key}: ${JSON.stringify(wanted)} is not valid for "${def.id}"` +
          (got === undefined
            ? "."
            : ` (it would be changed to ${JSON.stringify(got)}).`),
      });
    }
  }
  return errors.length
    ? { ok: false, errors }
    : { ok: true, params: normalized };
}

/** A field's allowed values as a short phrase, for the catalog listing. */
function describeField(field) {
  const unit = field.unit ? ` ${field.unit}s` : "";
  if (field.type === "combo" && field.unit) {
    const range = field.range;
    const span = range ? `${range.min} to ${range.max}${unit}` : unit.trim();
    // An example of the text a person types, in the field's own unit.
    const example =
      { ohm: "4.7k", farad: "100u", henry: "10m", volt: "3.3" }[field.unit] ??
      "4.7k";
    return `${field.key}: ${span}; a number in base units or text like "${example}"`;
  }
  if (field.type === "combo") {
    return `${field.key}: text (a part number)`;
  }
  if (field.type === "range") {
    return `${field.key}: ${field.min ?? field.range?.min ?? 0} to ${field.max ?? field.range?.max ?? 100}`;
  }
  if (field.type === "text") return `${field.key}: text`;
  if (field.type === "color")
    return `${field.key}: a color name (red, green, blue, ...)`;
  let options = [];
  try {
    options =
      typeof field.options === "function"
        ? field.options({})
        : (field.options ?? []);
  } catch {
    options = [];
  }
  const values = options
    .map((o) =>
      o && typeof o === "object" ? (o.value ?? o.text ?? o.label) : o,
    )
    .filter((v) => v != null)
    .slice(0, 10);
  return values.length
    ? `${field.key}: one of ${values.join(", ")}`
    : field.key;
}

/** The settings a spec may give a part, one phrase each (empty when none). */
export function paramHints(def) {
  return [...paramKeysOf(def)].map(([key, field]) =>
    field ? describeField(field) : key,
  );
}
