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

// Part designs adapted from Wokwi's wokwi-elements (MIT, Copyright (c) 2020 Uri
// Shaked); the licence text is in the NOTICE file at the repository root.

// Directly usable sensors: no firmware or development board required. These
// definitions intentionally use the simulator's existing electrical
// vocabulary (hard contacts and resistive weak bridges), so they work with
// comparators, 555s, counters and ordinary logic instead of introducing a
// second, microcontroller-centric simulation system.

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
};

const percent = (raw, key = "level", fallback = 50) =>
  Math.round(clamp(raw?.[key], 0, 100, fallback));

const RANGE_PERCENT = (key, label, fallback = 50) =>
  Object.freeze({
    key,
    label,
    type: "range",
    min: 0,
    max: 100,
    step: 1,
    default: fallback,
    valuePercent: true,
  });

const ACTIVE_FIELD = Object.freeze({
  key: "active",
  label: "State",
  type: "segmented",
  options: Object.freeze([
    Object.freeze({ value: false, label: "Inactive" }),
    Object.freeze({ value: true, label: "Active" }),
  ]),
});

const CONTACT_PINS = Object.freeze([
  Object.freeze({ n: 1, name: "1", role: "lead" }),
  Object.freeze({ n: 2, name: "2", role: "lead" }),
]);

function contactSensor({ id, title, blurb, label }) {
  return {
    id,
    kind: "discrete",
    title,
    blurb,
    group: "Sensors",
    fullySimulated: true,
    sensor: Object.freeze({ type: "contact", label }),
    footprint: Object.freeze({ offsets: Object.freeze([0, 2]) }),
    pins: CONTACT_PINS,
    properties: [ACTIVE_FIELD],
    countsAsConnection: true,
    normalizeParams(raw) {
      return raw?.active === true ? { active: true } : {};
    },
    clickToggle(params) {
      return { active: params?.active !== true };
    },
    internalBridges(params) {
      return params?.active === true ? [[1, 2]] : [];
    },
  };
}

function poweredDigitalSensor({ id, title, blurb, label }) {
  return {
    id,
    kind: "discrete",
    title,
    blurb,
    group: "Sensors",
    fullySimulated: true,
    sensor: Object.freeze({ type: "digital", label }),
    footprint: Object.freeze({ offsets: Object.freeze([0, 1, 2]) }),
    pins: Object.freeze([
      Object.freeze({ n: 1, name: "VCC", role: "vcc" }),
      Object.freeze({ n: 2, name: "OUT", role: "output" }),
      Object.freeze({ n: 3, name: "GND", role: "gnd" }),
    ]),
    properties: [ACTIVE_FIELD],
    normalizeParams(raw) {
      return raw?.active === true ? { active: true } : {};
    },
    clickToggle(params) {
      return { active: params?.active !== true };
    },
    internalBridges(params) {
      return [[2, params?.active === true ? 1 : 3]];
    },
  };
}

function analogComparatorSensor({ id, title, blurb, label, levelLabel }) {
  return {
    id,
    kind: "discrete",
    title,
    blurb,
    group: "Sensors",
    fullySimulated: true,
    sensor: Object.freeze({ type: "analog", label }),
    footprint: Object.freeze({ offsets: Object.freeze([0, 1, 2, 3]) }),
    pins: Object.freeze([
      Object.freeze({ n: 1, name: "VCC", role: "vcc" }),
      Object.freeze({ n: 2, name: "GND", role: "gnd" }),
      Object.freeze({ n: 3, name: "DO", role: "output" }),
      Object.freeze({ n: 4, name: "AO", role: "output" }),
    ]),
    properties: [
      RANGE_PERCENT("level", levelLabel),
      RANGE_PERCENT("threshold", "Digital threshold"),
    ],
    countsAsConnection: true,
    normalizeParams(raw) {
      return {
        level: percent(raw),
        threshold: percent(raw, "threshold"),
      };
    },
    internalBridges(raw) {
      const { level, threshold } = this.normalizeParams(raw);
      return [
        [3, level >= threshold ? 1 : 2],
        ...(level === 0 ? [[4, 2]] : []),
        ...(level === 100 ? [[4, 1]] : []),
      ];
    },
    weakBridges(raw) {
      const { level } = this.normalizeParams(raw);
      if (level === 0 || level === 100) return [];
      // A 100 kΩ divider. Spice Lite therefore reads AO as level% of VCC;
      // the logic engine sees the same node as a deliberately weak signal.
      return [
        [4, 1, (100 - level) * 1000],
        [4, 2, level * 1000],
      ];
    },
  };
}

const LDR_DEF = Object.freeze({
  id: "sensor-ldr",
  kind: "discrete",
  title: "Photoresistor (LDR)",
  blurb:
    "Light-dependent resistor. Set Illumination from darkness to bright light; " +
    "its resistance moves logarithmically from about 1 MΩ down to 1 kΩ. Use " +
    "it in a divider, comparator, transistor switch or 555 circuit.",
  group: "Sensors",
  fullySimulated: true,
  sensor: Object.freeze({ type: "resistive", label: "LDR" }),
  footprint: Object.freeze({ offsets: Object.freeze([0, 2]) }),
  pins: CONTACT_PINS,
  properties: [RANGE_PERCENT("level", "Illumination")],
  countsAsConnection: true,
  normalizeParams(raw) {
    return { level: percent(raw) };
  },
  resistance(raw) {
    return 1e6 * 1000 ** (-this.normalizeParams(raw).level / 100);
  },
  internalBridges() {
    return [];
  },
  weakBridges(raw) {
    return [[1, 2, this.resistance(raw)]];
  },
});

const NTC_DEF = Object.freeze({
  id: "sensor-ntc",
  kind: "discrete",
  title: "NTC temperature sensor (10 kΩ)",
  blurb:
    "10 kΩ NTC thermistor with a 3950 K beta value. Set Temperature from " +
    "−40 to 125 °C; its resistance follows the thermistor beta equation. " +
    "It needs no code—use it in a divider or analog threshold circuit.",
  group: "Sensors",
  fullySimulated: true,
  sensor: Object.freeze({ type: "resistive", label: "NTC" }),
  footprint: Object.freeze({ offsets: Object.freeze([0, 2]) }),
  pins: CONTACT_PINS,
  properties: [
    Object.freeze({
      key: "celsius",
      label: "Temperature",
      type: "range",
      min: -40,
      max: 125,
      step: 1,
      default: 25,
      valueSuffix: " °C",
    }),
  ],
  countsAsConnection: true,
  normalizeParams(raw) {
    return { celsius: Math.round(clamp(raw?.celsius, -40, 125, 25)) };
  },
  resistance(raw) {
    const kelvin = this.normalizeParams(raw).celsius + 273.15;
    return 10000 * Math.exp(3950 * (1 / kelvin - 1 / 298.15));
  },
  internalBridges() {
    return [];
  },
  weakBridges(raw) {
    return [[1, 2, this.resistance(raw)]];
  },
});

const JOYSTICK_DEF = Object.freeze({
  id: "sensor-joystick",
  kind: "discrete",
  title: "Analog joystick module",
  blurb:
    "Two 10 kΩ potentiometers and a push switch. X and Y are adjustable " +
    "analog divider outputs between GND and VCC; SW closes to GND when " +
    "pressed. It can feed comparators, ADC chips or threshold logic directly.",
  group: "Sensors",
  fullySimulated: true,
  sensor: Object.freeze({ type: "joystick", label: "JOY" }),
  footprint: Object.freeze({ offsets: Object.freeze([0, 1, 2, 3, 4]) }),
  pins: Object.freeze([
    Object.freeze({ n: 1, name: "GND", role: "gnd" }),
    Object.freeze({ n: 2, name: "VCC", role: "vcc" }),
    Object.freeze({ n: 3, name: "X", role: "output" }),
    Object.freeze({ n: 4, name: "Y", role: "output" }),
    Object.freeze({ n: 5, name: "SW", role: "output" }),
  ]),
  properties: [
    RANGE_PERCENT("x", "X position"),
    RANGE_PERCENT("y", "Y position"),
    Object.freeze({ ...ACTIVE_FIELD, key: "pressed", label: "Stick switch" }),
  ],
  countsAsConnection: true,
  normalizeParams(raw) {
    return {
      x: percent(raw, "x"),
      y: percent(raw, "y"),
      ...(raw?.pressed === true ? { pressed: true } : {}),
    };
  },
  internalBridges(raw) {
    const p = this.normalizeParams(raw);
    return [
      ...(p.pressed ? [[5, 1]] : []),
      ...(p.x === 0 ? [[3, 1]] : p.x === 100 ? [[3, 2]] : []),
      ...(p.y === 0 ? [[4, 1]] : p.y === 100 ? [[4, 2]] : []),
    ];
  },
  weakBridges(raw) {
    const p = this.normalizeParams(raw);
    return [
      ...(p.x > 0 && p.x < 100
        ? [
            [3, 2, (100 - p.x) * 100],
            [3, 1, p.x * 100],
          ]
        : []),
      ...(p.y > 0 && p.y < 100
        ? [
            [4, 2, (100 - p.y) * 100],
            [4, 1, p.y * 100],
          ]
        : []),
    ];
  },
});

const ENCODER_DEF = Object.freeze({
  id: "sensor-encoder",
  kind: "discrete",
  title: "Rotary encoder module",
  blurb:
    "KY-040 style quadrature encoder with CLK, DT and push-switch outputs. " +
    "Move through the four detent phases or press the shaft; three onboard " +
    "10 kΩ pull-ups make it usable directly with counters and logic.",
  group: "Sensors",
  fullySimulated: true,
  sensor: Object.freeze({ type: "encoder", label: "ENC" }),
  footprint: Object.freeze({ offsets: Object.freeze([0, 1, 2, 3, 4]) }),
  pins: Object.freeze([
    Object.freeze({ n: 1, name: "GND", role: "gnd" }),
    Object.freeze({ n: 2, name: "VCC", role: "vcc" }),
    Object.freeze({ n: 3, name: "SW", role: "output" }),
    Object.freeze({ n: 4, name: "DT", role: "output" }),
    Object.freeze({ n: 5, name: "CLK", role: "output" }),
  ]),
  properties: [
    Object.freeze({
      key: "phase",
      label: "Detent phase",
      type: "range",
      min: 0,
      max: 3,
      step: 1,
      default: 0,
    }),
    Object.freeze({ ...ACTIVE_FIELD, key: "pressed", label: "Shaft switch" }),
  ],
  countsAsConnection: true,
  normalizeParams(raw) {
    return {
      phase: Math.round(clamp(raw?.phase, 0, 3, 0)),
      ...(raw?.pressed === true ? { pressed: true } : {}),
    };
  },
  internalBridges(raw) {
    const { phase, pressed } = this.normalizeParams(raw);
    const states = [
      [false, false],
      [false, true],
      [true, true],
      [true, false],
    ][phase];
    return [
      ...(pressed ? [[3, 1]] : []),
      ...(states[0] ? [[4, 1]] : []),
      ...(states[1] ? [[5, 1]] : []),
    ];
  },
  weakBridges() {
    return [
      [3, 2, 10000],
      [4, 2, 10000],
      [5, 2, 10000],
    ];
  },
});

const KEYPAD_KEYS = Object.freeze([
  "1",
  "2",
  "3",
  "A",
  "4",
  "5",
  "6",
  "B",
  "7",
  "8",
  "9",
  "C",
  "*",
  "0",
  "#",
  "D",
]);

const KEYPAD_DEF = Object.freeze({
  id: "sensor-keypad",
  kind: "discrete",
  title: "4×4 matrix keypad",
  blurb:
    "Passive sixteen-key matrix keypad with four row and four column pins. " +
    "Choose the pressed key to close its row-to-column contact; scan it with " +
    "ordinary gates, counters and multiplexers or use it as a manual switch.",
  group: "Sensors",
  fullySimulated: true,
  sensor: Object.freeze({ type: "keypad", label: "KEYPAD" }),
  footprint: Object.freeze({
    offsets: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]),
  }),
  pins: Object.freeze([
    ...[1, 2, 3, 4].map((n) => Object.freeze({ n, name: `R${n}`, role: "io" })),
    ...[1, 2, 3, 4].map((n) =>
      Object.freeze({ n: n + 4, name: `C${n}`, role: "io" }),
    ),
  ]),
  properties: [
    Object.freeze({
      key: "key",
      label: "Pressed key",
      type: "select",
      default: "none",
      options: Object.freeze([
        Object.freeze({ value: "none", label: "None" }),
        ...KEYPAD_KEYS.map((key) => Object.freeze({ value: key, label: key })),
      ]),
    }),
  ],
  countsAsConnection: true,
  normalizeParams(raw) {
    return { key: KEYPAD_KEYS.includes(raw?.key) ? raw.key : "none" };
  },
  internalBridges(raw) {
    const key = this.normalizeParams(raw).key;
    const index = KEYPAD_KEYS.indexOf(key);
    return index < 0 ? [] : [[Math.floor(index / 4) + 1, (index % 4) + 5]];
  },
});

export const SENSOR_DEFS = Object.freeze(
  [
    LDR_DEF,
    NTC_DEF,
    JOYSTICK_DEF,
    ENCODER_DEF,
    KEYPAD_DEF,
    analogComparatorSensor({
      id: "sensor-sound",
      title: "Sound sensor module",
      label: "SOUND",
      levelLabel: "Sound level",
      blurb:
        "Microphone module with analog AO and thresholded digital DO outputs. " +
        "Set the sound level and comparator threshold in Properties.",
    }),
    analogComparatorSensor({
      id: "sensor-flame",
      title: "Flame sensor module",
      label: "FLAME",
      levelLabel: "Flame intensity",
      blurb:
        "Infrared flame detector with analog AO and comparator DO outputs. " +
        "Its simulated flame intensity is adjustable without firmware.",
    }),
    analogComparatorSensor({
      id: "sensor-gas",
      title: "Gas sensor module",
      label: "GAS",
      levelLabel: "Gas concentration",
      blurb:
        "MQ-style gas sensor module with analog AO and thresholded DO outputs. " +
        "Use the level control to explore alarm and comparator circuits.",
    }),
    analogComparatorSensor({
      id: "sensor-heartbeat",
      title: "Heartbeat sensor module",
      label: "PULSE",
      levelLabel: "Pulse signal",
      blurb:
        "Adjustable optical pulse-sensor output with analog AO and thresholded " +
        "DO. It models the sensor level, ready for amplifiers and pulse shapers.",
    }),
    poweredDigitalSensor({
      id: "sensor-pir",
      title: "PIR motion sensor",
      label: "PIR",
      blurb:
        "Three-wire motion detector. Click it, or change State in Properties, " +
        "to drive OUT between GND and VCC for motion/no-motion experiments.",
    }),
    poweredDigitalSensor({
      id: "sensor-hall",
      title: "Hall-effect sensor module",
      label: "HALL",
      blurb:
        "Powered magnetic-field switch with a digital OUT. Click it to bring a " +
        "simulated magnet near or move it away.",
    }),
    contactSensor({
      id: "sensor-tilt",
      title: "Tilt switch",
      label: "TILT",
      blurb:
        "Two-terminal ball tilt switch. Click it to change orientation and open " +
        "or close the contact; add your own pull-up or pull-down.",
    }),
    contactSensor({
      id: "sensor-reed",
      title: "Magnetic reed switch",
      label: "REED",
      blurb:
        "Open glass reed contact. Click it to apply or remove a magnet; " +
        "the contact is passive and needs no supply or program.",
    }),
    contactSensor({
      id: "sensor-vibration",
      title: "Vibration switch",
      label: "VIBE",
      blurb:
        "Two-terminal vibration contact. Toggle the simulated vibration to close " +
        "the contact and feed a latch, monostable, counter or alarm circuit.",
    }),
  ].map(Object.freeze),
);
