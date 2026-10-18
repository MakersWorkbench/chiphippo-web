/*
 * Copyright 2026 Jason Figge
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { el } from "../dom.js";
import { formatNumber, t } from "../i18n.js";
import { PX_PER_UNIT } from "../desk/desk-geometry.js";
import { readNet, readVolts } from "../model/scope-recorder.js";
import {
  appendScopeSample,
  autoTimeScale,
  autoVoltageScale,
  scopeMeasurements,
  triggerAt,
} from "../model/oscilloscope-trace.js";

const SVGNS = "http://www.w3.org/2000/svg";
const WIDTH = 600;
const HEIGHT = 240;
const X_DIVS = 10;
const Y_DIVS = 8;
const CHANNELS = ["ch1", "ch2"];
const PROBES = ["ch1", "ch2", "ground"];
const TIME_STEPS = [
  1e-9, 10e-9, 100e-9, 1e-6, 10e-6, 100e-6, 1e-3, 10e-3, 100e-3, 250e-3, 500e-3,
  1,
];
const VOLT_STEPS = [0.5, 1, 2, 5, 10];

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function logicVolts(level) {
  if (level === "H") return 5;
  if (level === "L") return 0;
  return null;
}

function voltageAt(address, detail) {
  if (!address) return null;
  return readVolts(address, detail) ?? logicVolts(readNet(address, detail));
}

function secondsLabel(seconds) {
  const options = { maximumSignificantDigits: 3 };
  if (seconds < 1e-6) return `${formatNumber(seconds * 1e9, options)} ns/div`;
  if (seconds < 1e-3) return `${formatNumber(seconds * 1e6, options)} µs/div`;
  if (seconds < 1) return `${formatNumber(seconds * 1e3, options)} ms/div`;
  return `${formatNumber(seconds, options)} s/div`;
}

function scaledLabel(value, unit) {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return `0 ${unit}`;
  const abs = Math.abs(value);
  const scales = [
    [1e9, "G"],
    [1e6, "M"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
  ];
  const [scale, prefix] = scales.find(([at]) => abs >= at) ?? scales.at(-1);
  return `${formatNumber(value / scale, { maximumSignificantDigits: 4 })} ${prefix}${unit}`;
}

export class Oscilloscope {
  #viewport;
  #overlay;
  #hitTest;
  #addressWorld;
  #onStateChange;
  #panel;
  #screen;
  #readout;
  #measurements;
  #cursorControls;
  #cursorReadout;
  #timeSelect;
  #voltsSelect;
  #probeButtons = new Map();
  #markers = new Map();
  #probes = { ch1: null, ch2: null, ground: null };
  #samples = [];
  #visible = false;
  #activeProbe = null;
  #wasRunning = false;
  #timePerDiv = 10e-6;
  #voltsPerDiv = 1;
  #triggerChannel = "ch1";
  #triggerEdge = "rising";
  #triggerLevel = 2.5;
  #held = false;
  #channels = {
    ch1: { enabled: true, coupling: "dc", offset: 0 },
    ch2: { enabled: true, coupling: "dc", offset: 0 },
  };
  #cursorsVisible = false;
  #cursors = { t1: 0.25, t2: 0.75, v1: 1, v2: -1 };
  #renderQueued = false;
  #drag = null;

  constructor({ viewport, overlay, hitTest, addressWorld, onStateChange }) {
    this.#viewport = viewport;
    this.#overlay = overlay;
    this.#hitTest = hitTest;
    this.#addressWorld = addressWorld;
    this.#onStateChange = onStateChange;
    this.#panel = this.#buildPanel();
    viewport.append(this.#panel);
    for (const probe of PROBES) {
      const marker = el("div", {
        class: `oscilloscope-probe oscilloscope-probe--${probe}`,
        hidden: true,
        "aria-hidden": "true",
      });
      this.#markers.set(probe, marker);
      overlay.append(marker);
    }
    window.addEventListener("chiphippo:sim-tick", (event) =>
      this.#onTick(event.detail),
    );
    window.addEventListener("chiphippo:sim-state", (event) => {
      const running =
        event.detail?.mode !== "stopped" && event.detail?.running !== false;
      if (running) this.#onTick(event.detail);
      else {
        this.#wasRunning = false;
        if (this.#visible) this.#scheduleRender();
      }
    });
    window.addEventListener("chiphippo:doc-changed", () => this.refresh());
    window.addEventListener("resize", () => this.#clampPanel());
  }

  get visible() {
    return this.#visible;
  }

  get armed() {
    return this.#visible && this.#activeProbe != null;
  }

  toggle() {
    this.setVisible(!this.#visible);
  }

  setVisible(visible) {
    this.#visible = Boolean(visible);
    this.#panel.hidden = !this.#visible;
    if (this.#visible && !this.#probes.ch1) this.arm("ch1");
    else if (!this.#visible) this.disarmPlacement();
    this.refresh();
    this.#onStateChange?.({ visible: this.#visible, armed: this.armed });
  }

  arm(probe) {
    if (!this.#visible || !PROBES.includes(probe)) return;
    this.#activeProbe = probe;
    this.#viewport.classList.add("desk-viewport--scoping");
    this.#renderProbeButtons();
    this.#onStateChange?.({ visible: true, armed: true });
  }

  disarmPlacement() {
    this.#activeProbe = null;
    this.#viewport.classList.remove("desk-viewport--scoping");
    this.#renderProbeButtons();
    this.#onStateChange?.({ visible: this.#visible, armed: false });
  }

  handleEscape() {
    if (!this.armed) return false;
    this.disarmPlacement();
    return true;
  }

  commitClick(world) {
    if (!this.armed) return false;
    const hit = this.#hitTest(world);
    if (!hit?.address) return false;
    const probe = this.#activeProbe;
    this.#probes[probe] = hit.address;
    const next = PROBES.find((name) => !this.#probes[name]);
    if (next) this.arm(next);
    else this.disarmPlacement();
    this.refresh();
    return true;
  }

  refresh() {
    for (const probe of PROBES) {
      const marker = this.#markers.get(probe);
      const point = this.#probes[probe]
        ? this.#addressWorld(this.#probes[probe])
        : null;
      marker.hidden = !this.#visible || !point;
      if (point) {
        marker.style.left = `${point.x * PX_PER_UNIT}px`;
        marker.style.top = `${point.y * PX_PER_UNIT}px`;
      }
    }
    this.#renderProbeButtons();
    this.#scheduleRender();
  }

  #onTick(detail) {
    if (!Number.isFinite(detail?.at)) return;
    if (this.#held) return;
    // Some engines publish their first settled tick immediately before the
    // matching running-state announcement. Mark the run here as well so that
    // announcement cannot mistake the first captured sample for an old trace
    // and clear it again.
    if (!this.#wasRunning) {
      this.#samples = [];
      this.#wasRunning = true;
    }
    const ground = voltageAt(this.#probes.ground, detail) ?? 0;
    const sample = { at: detail.at };
    for (const channel of CHANNELS) {
      const value = voltageAt(this.#probes[channel], detail);
      sample[channel] = value == null ? null : value - ground;
    }
    const previous = this.#samples.at(-1);
    if (previous?.at === sample.at) Object.assign(previous, sample);
    else appendScopeSample(this.#samples, sample);
    if (this.#visible) this.#scheduleRender();
  }

  #buildPanel() {
    this.#screen = svg("svg", {
      class: "oscilloscope-screen",
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      role: "img",
      "aria-label": t("oscilloscope.screen"),
    });
    this.#readout = el("span", { class: "oscilloscope-readout" });

    const time = el("select", {
      class: "oscilloscope-select",
      "aria-label": t("oscilloscope.timeScale"),
      onChange: (event) => {
        this.#timePerDiv = Number(event.currentTarget.value);
        this.#scheduleRender();
      },
    });
    this.#timeSelect = time;
    for (const value of TIME_STEPS) {
      time.append(el("option", { value, text: secondsLabel(value) }));
    }
    time.value = String(this.#timePerDiv);

    const volts = el("select", {
      class: "oscilloscope-select",
      "aria-label": t("oscilloscope.voltageScale"),
      onChange: (event) => {
        this.#voltsPerDiv = Number(event.currentTarget.value);
        this.#scheduleRender();
      },
    });
    this.#voltsSelect = volts;
    for (const value of VOLT_STEPS) {
      volts.append(el("option", { value, text: `${value} V/div` }));
    }
    volts.value = String(this.#voltsPerDiv);

    const triggerChannel = el(
      "select",
      {
        class: "oscilloscope-select",
        "aria-label": t("oscilloscope.triggerChannel"),
        onChange: (event) => {
          this.#triggerChannel = event.currentTarget.value;
          this.#scheduleRender();
        },
      },
      [
        el("option", { value: "ch1", text: t("oscilloscope.ch1") }),
        el("option", { value: "ch2", text: t("oscilloscope.ch2") }),
      ],
    );
    const edge = el("button", {
      type: "button",
      class: "oscilloscope-control",
      text: "↗",
      title: t("oscilloscope.triggerEdge"),
      "aria-label": t("oscilloscope.triggerEdge"),
      onClick: (event) => {
        this.#triggerEdge =
          this.#triggerEdge === "rising" ? "falling" : "rising";
        event.currentTarget.textContent =
          this.#triggerEdge === "rising" ? "↗" : "↘";
        this.#scheduleRender();
      },
    });
    const triggerLevel = el("input", {
      class: "oscilloscope-trigger-level",
      type: "number",
      min: -50,
      max: 50,
      step: 0.1,
      value: this.#triggerLevel,
      title: t("oscilloscope.triggerLevel"),
      "aria-label": t("oscilloscope.triggerLevel"),
      onChange: (event) => {
        this.#triggerLevel = Number(event.currentTarget.value) || 0;
        this.#scheduleRender();
      },
    });

    const probes = el("div", { class: "oscilloscope-probes" });
    for (const probe of PROBES) {
      const button = el("button", {
        type: "button",
        class: `oscilloscope-probe-button oscilloscope-probe-button--${probe}`,
        onClick: () => this.arm(probe),
      });
      this.#probeButtons.set(probe, button);
      probes.append(button);
    }

    const channelControls = el("div", {
      class: "oscilloscope-channels",
      role: "group",
      "aria-label": t("oscilloscope.channels"),
    });
    for (const channel of CHANNELS) {
      const enabled = el("input", {
        type: "checkbox",
        checked: true,
        "aria-label": t("oscilloscope.channelEnabled", {
          channel: t(`oscilloscope.${channel}`),
        }),
        onChange: (event) => {
          this.#channels[channel].enabled = event.currentTarget.checked;
          this.#scheduleRender();
        },
      });
      const coupling = el(
        "select",
        {
          class: "oscilloscope-select",
          "aria-label": t("oscilloscope.coupling", {
            channel: t(`oscilloscope.${channel}`),
          }),
          onChange: (event) => {
            this.#channels[channel].coupling = event.currentTarget.value;
            this.#scheduleRender();
          },
        },
        [
          el("option", { value: "dc", text: t("oscilloscope.dc") }),
          el("option", { value: "ac", text: t("oscilloscope.ac") }),
        ],
      );
      const offset = el("input", {
        class: "oscilloscope-offset",
        type: "number",
        min: -4,
        max: 4,
        step: 0.5,
        value: 0,
        title: t("oscilloscope.offset"),
        "aria-label": t("oscilloscope.channelOffset", {
          channel: t(`oscilloscope.${channel}`),
        }),
        onChange: (event) => {
          this.#channels[channel].offset = Math.max(
            -4,
            Math.min(4, Number(event.currentTarget.value) || 0),
          );
          this.#scheduleRender();
        },
      });
      channelControls.append(
        el(
          "label",
          { class: `oscilloscope-channel oscilloscope-channel--${channel}` },
          [
            enabled,
            el("span", { text: t(`oscilloscope.${channel}`) }),
            coupling,
            offset,
            el("span", { text: t("oscilloscope.divisions") }),
          ],
        ),
      );
    }

    const action = (key, onClick) =>
      el("button", {
        type: "button",
        class: "oscilloscope-control",
        text: t(`oscilloscope.${key}`),
        title: t(`oscilloscope.${key}Title`),
        onClick,
      });
    const actions = el("div", { class: "oscilloscope-actions" });
    const hold = action("hold", (event) => {
      this.#held = !this.#held;
      event.currentTarget.textContent = t(
        this.#held ? "oscilloscope.resume" : "oscilloscope.hold",
      );
      event.currentTarget.classList.toggle(
        "oscilloscope-control--active",
        this.#held,
      );
      this.#scheduleRender();
    });
    const clear = action("clear", () => {
      this.#samples = [];
      this.#scheduleRender();
    });
    const auto = action("auto", () => this.#autoScale());
    const cursors = action("cursors", (event) => {
      this.#cursorsVisible = !this.#cursorsVisible;
      this.#cursorControls.hidden = !this.#cursorsVisible;
      event.currentTarget.classList.toggle(
        "oscilloscope-control--active",
        this.#cursorsVisible,
      );
      this.#scheduleRender();
    });
    actions.append(hold, clear, auto, cursors);

    const cursorInput = (key, min, max, step) =>
      el("input", {
        type: "range",
        min,
        max,
        step,
        value: this.#cursors[key],
        "aria-label": t(`oscilloscope.${key}`),
        onInput: (event) => {
          this.#cursors[key] = Number(event.currentTarget.value);
          this.#scheduleRender();
        },
      });
    this.#cursorReadout = el("span", { class: "oscilloscope-cursor-readout" });
    this.#cursorControls = el(
      "div",
      { class: "oscilloscope-cursor-controls", hidden: true },
      [
        el("label", {}, [
          el("span", { text: t("oscilloscope.t1") }),
          cursorInput("t1", 0, 1, 0.01),
        ]),
        el("label", {}, [
          el("span", { text: t("oscilloscope.t2") }),
          cursorInput("t2", 0, 1, 0.01),
        ]),
        el("label", {}, [
          el("span", { text: t("oscilloscope.v1") }),
          cursorInput("v1", -50, 50, 0.1),
        ]),
        el("label", {}, [
          el("span", { text: t("oscilloscope.v2") }),
          cursorInput("v2", -50, 50, 0.1),
        ]),
        this.#cursorReadout,
      ],
    );
    this.#measurements = el("div", { class: "oscilloscope-measurements" });

    const close = el("button", {
      type: "button",
      class: "oscilloscope-close",
      text: "×",
      title: t("common.close"),
      "aria-label": t("common.close"),
      onClick: () => this.setVisible(false),
    });
    const dragHandle = el(
      "div",
      {
        class: "oscilloscope-drag-handle",
        onPointerdown: (event) => this.#startDrag(event),
        onPointermove: (event) => this.#moveDrag(event),
        onPointerup: (event) => this.#endDrag(event),
        onPointercancel: (event) => this.#endDrag(event),
      },
      [
        el("strong", {
          class: "oscilloscope-title",
          text: t("oscilloscope.title"),
        }),
        close,
      ],
    );
    const controls = el("div", { class: "oscilloscope-controls" }, [
      time,
      volts,
      el("span", { text: t("oscilloscope.trigger") }),
      triggerChannel,
      edge,
      triggerLevel,
      el("span", { text: t("oscilloscope.voltsUnit") }),
    ]);
    const panel = el(
      "section",
      {
        class: "oscilloscope-panel",
        hidden: true,
        "aria-label": t("oscilloscope.title"),
      },
      [
        dragHandle,
        controls,
        channelControls,
        actions,
        this.#screen,
        this.#readout,
        this.#measurements,
        this.#cursorControls,
        probes,
      ],
    );
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    panel.addEventListener("click", (event) => event.stopPropagation());
    return panel;
  }

  #autoScale() {
    const values = this.#samples.flatMap((sample) =>
      CHANNELS.filter((channel) => this.#channels[channel].enabled)
        .map((channel) => sample[channel])
        .filter(Number.isFinite),
    );
    if (values.length) {
      this.#voltsPerDiv = autoVoltageScale(
        Math.max(...values.map(Math.abs)),
        VOLT_STEPS,
      );
      this.#voltsSelect.value = String(this.#voltsPerDiv);
    }
    for (const channel of CHANNELS) {
      const measured = scopeMeasurements(this.#samples, channel, {
        threshold: this.#triggerLevel,
      });
      const scale = autoTimeScale(measured?.period, TIME_STEPS);
      if (scale != null) {
        this.#timePerDiv = scale;
        this.#timeSelect.value = String(scale);
        break;
      }
    }
    this.#scheduleRender();
  }

  #startDrag(event) {
    if (event.button !== 0 || event.target.closest("button, input, select"))
      return;
    const panel = this.#panel.getBoundingClientRect();
    this.#drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - panel.left,
      offsetY: event.clientY - panel.top,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    this.#panel.classList.add("oscilloscope-panel--dragging");
    event.preventDefault();
    event.stopPropagation();
  }

  #moveDrag(event) {
    if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;
    const viewport = this.#viewport.getBoundingClientRect();
    const panel = this.#panel.getBoundingClientRect();
    const left = Math.max(
      0,
      Math.min(
        viewport.width - panel.width,
        event.clientX - viewport.left - this.#drag.offsetX,
      ),
    );
    const top = Math.max(
      0,
      Math.min(
        viewport.height - panel.height,
        event.clientY - viewport.top - this.#drag.offsetY,
      ),
    );
    this.#panel.style.left = `${left}px`;
    this.#panel.style.top = `${top}px`;
    this.#panel.style.right = "auto";
    this.#panel.style.bottom = "auto";
    event.preventDefault();
  }

  #endDrag(event) {
    if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    this.#drag = null;
    this.#panel.classList.remove("oscilloscope-panel--dragging");
    event.preventDefault();
    event.stopPropagation();
  }

  #clampPanel() {
    if (this.#panel.hidden || !this.#panel.style.left) return;
    const viewport = this.#viewport.getBoundingClientRect();
    const panel = this.#panel.getBoundingClientRect();
    const left = Math.max(
      0,
      Math.min(viewport.width - panel.width, panel.left - viewport.left),
    );
    const top = Math.max(
      0,
      Math.min(viewport.height - panel.height, panel.top - viewport.top),
    );
    this.#panel.style.left = `${left}px`;
    this.#panel.style.top = `${top}px`;
  }

  #renderProbeButtons() {
    for (const probe of PROBES) {
      const button = this.#probeButtons.get(probe);
      if (!button) continue;
      button.textContent = `${t(`oscilloscope.${probe}`)}: ${this.#probes[probe] ?? t("multimeter.place")}`;
      button.classList.toggle(
        "oscilloscope-probe-button--active",
        this.#activeProbe === probe,
      );
    }
  }

  #scheduleRender() {
    if (this.#renderQueued) return;
    this.#renderQueued = true;
    const frame =
      globalThis.requestAnimationFrame ?? ((callback) => callback());
    frame(() => {
      this.#renderQueued = false;
      this.#render();
    });
  }

  #render() {
    if (!this.#screen) return;
    this.#screen.replaceChildren();
    for (let x = 0; x <= X_DIVS; x += 1) {
      this.#screen.append(
        svg("line", {
          class: "oscilloscope-grid",
          x1: (x / X_DIVS) * WIDTH,
          x2: (x / X_DIVS) * WIDTH,
          y1: 0,
          y2: HEIGHT,
        }),
      );
    }
    for (let y = 0; y <= Y_DIVS; y += 1) {
      this.#screen.append(
        svg("line", {
          class: "oscilloscope-grid",
          x1: 0,
          x2: WIDTH,
          y1: (y / Y_DIVS) * HEIGHT,
          y2: (y / Y_DIVS) * HEIGHT,
        }),
      );
    }
    if (!this.#samples.length) {
      this.#readout.textContent = t("oscilloscope.runHint");
      this.#measurements.textContent = "";
      this.#cursorReadout.textContent = "";
      return;
    }
    const latest = this.#samples.at(-1).at;
    const span = this.#timePerDiv * X_DIVS;
    const before = latest - 2 * this.#timePerDiv;
    const trigger = triggerAt(
      this.#samples,
      this.#triggerChannel,
      this.#triggerEdge,
      this.#triggerLevel,
      before,
    );
    const end =
      trigger == null
        ? latest
        : Math.min(latest, trigger + 2 * this.#timePerDiv);
    const start = end - span;
    const centerY = HEIGHT / 2;
    const visibleSamples = this.#samples.filter(
      (sample) => sample.at >= start && sample.at <= end,
    );
    for (const channel of CHANNELS) {
      if (!this.#channels[channel].enabled) continue;
      const values = visibleSamples
        .map((sample) => sample[channel])
        .filter(Number.isFinite);
      const baseline =
        this.#channels[channel].coupling === "ac" && values.length
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : 0;
      const points = visibleSamples
        .filter((sample) => Number.isFinite(sample[channel]))
        .map((sample) => {
          const x = ((sample.at - start) / span) * WIDTH;
          const y =
            centerY -
            ((sample[channel] - baseline) / this.#voltsPerDiv +
              this.#channels[channel].offset) *
              (HEIGHT / Y_DIVS);
          return {
            x: x.toFixed(2),
            y: Math.max(2, Math.min(HEIGHT - 2, y)).toFixed(2),
          };
        });
      // A settled DC circuit may publish only one event. A real scope still
      // shows that level across the sweep, so extend the lone sample back to
      // the left edge instead of leaving an invisible one-point trace.
      if (points.length === 1) {
        points.unshift({ x: "0.00", y: points[0].y });
      }
      if (points.length > 1) {
        const path = [
          `M ${points[0].x} ${points[0].y}`,
          ...points.slice(1).map((point) => `H ${point.x} V ${point.y}`),
        ].join(" ");
        this.#screen.append(
          svg("path", {
            class: `oscilloscope-trace oscilloscope-trace--${channel}`,
            d: path,
          }),
        );
      }
    }
    if (this.#cursorsVisible) {
      for (const [key, className] of [
        ["t1", "a"],
        ["t2", "b"],
      ]) {
        const x = this.#cursors[key] * WIDTH;
        this.#screen.append(
          svg("line", {
            class: `oscilloscope-cursor oscilloscope-cursor--${className}`,
            x1: x,
            x2: x,
            y1: 0,
            y2: HEIGHT,
          }),
        );
      }
      for (const [key, className] of [
        ["v1", "a"],
        ["v2", "b"],
      ]) {
        const y = Math.max(
          0,
          Math.min(
            HEIGHT,
            centerY -
              (this.#cursors[key] / this.#voltsPerDiv) * (HEIGHT / Y_DIVS),
          ),
        );
        this.#screen.append(
          svg("line", {
            class: `oscilloscope-cursor oscilloscope-cursor--${className}`,
            x1: 0,
            x2: WIDTH,
            y1: y,
            y2: y,
          }),
        );
      }
      this.#cursorReadout.textContent = `${t("oscilloscope.deltaTime")} ${scaledLabel(Math.abs(this.#cursors.t2 - this.#cursors.t1) * span, "s")} · ${t("oscilloscope.deltaVoltage")} ${scaledLabel(Math.abs(this.#cursors.v2 - this.#cursors.v1), "V")}`;
    } else this.#cursorReadout.textContent = "";
    const last = this.#samples.at(-1);
    const fmt = (value) =>
      Number.isFinite(value)
        ? `${formatNumber(value, { maximumFractionDigits: 3 })} V`
        : "—";
    this.#readout.textContent = `CH1 ${fmt(last.ch1)} · CH2 ${fmt(last.ch2)}`;
    const measurementText = [];
    for (const channel of CHANNELS) {
      if (!this.#channels[channel].enabled) continue;
      const measured = scopeMeasurements(visibleSamples, channel, {
        threshold: this.#triggerLevel,
      });
      if (!measured) continue;
      measurementText.push(
        `${t(`oscilloscope.${channel}`)} ${t("oscilloscope.vpp")} ${scaledLabel(measured.peakToPeak, "V")} · ${t("oscilloscope.average")} ${scaledLabel(measured.average, "V")} · ${t("oscilloscope.frequency")} ${scaledLabel(measured.frequency, "Hz")} · ${t("oscilloscope.period")} ${scaledLabel(measured.period, "s")} · ${t("oscilloscope.duty")} ${Number.isFinite(measured.dutyCycle) ? `${formatNumber(measured.dutyCycle, { maximumFractionDigits: 1 })}%` : "—"}`,
      );
    }
    this.#measurements.textContent = measurementText.join("\n");
  }
}
