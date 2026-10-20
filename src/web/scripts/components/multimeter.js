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

import { el } from "../dom.js";
import { formatNumber, t } from "../i18n.js";
import { PX_PER_UNIT } from "../desk/desk-geometry.js";
import { passiveMeasurements } from "../sim/multimeter-measure.js";

const MODES = [
  "voltage",
  "resistance",
  "continuity",
  "current",
  "capacitance",
  "inductance",
];
const MODE_LABELS = Object.freeze({
  voltage: "V DC",
  resistance: "Ω",
  continuity: "●)))",
  current: "A DC",
  capacitance: "C",
  inductance: "L",
});
const CONTINUITY_OHMS = 50;

function logicVolts(level) {
  if (level === "H") return 5;
  if (level === "L") return 0;
  return null;
}

function engineering(value, unit) {
  if (!Number.isFinite(value)) return "OL";
  const abs = Math.abs(value);
  const steps = [
    [1e9, "G"],
    [1e6, "M"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
    [1e-12, "p"],
  ];
  const [scale, prefix] = steps.find(([at]) => abs >= at) ?? steps.at(-1);
  return `${formatNumber(value / scale, { maximumSignificantDigits: 4 })} ${prefix}${unit}`;
}

export class Multimeter {
  #doc;
  #viewport;
  #overlay;
  #sim;
  #netlist;
  #hitTest;
  #addressWorld;
  #onStateChange;
  #panel;
  #display;
  #hint;
  #leadButtons = new Map();
  #markers = new Map();
  #mode = "voltage";
  #visible = false;
  #activeLead = null;
  #red = null;
  #black = null;
  #wasContinuous = false;
  #drag = null;

  constructor({
    doc,
    viewport,
    overlay,
    simOverlay,
    netlist,
    hitTest,
    addressWorld,
    onStateChange,
  }) {
    this.#doc = doc;
    this.#viewport = viewport;
    this.#overlay = overlay;
    this.#sim = simOverlay;
    this.#netlist = netlist;
    this.#hitTest = hitTest;
    this.#addressWorld = addressWorld;
    this.#onStateChange = onStateChange;
    this.#panel = this.#buildPanel();
    viewport.append(this.#panel);
    for (const lead of ["red", "black"]) {
      const marker = el("div", {
        class: `multimeter-probe multimeter-probe--${lead}`,
        hidden: true,
        "aria-hidden": "true",
      });
      this.#markers.set(lead, marker);
      overlay.append(marker);
    }
    window.addEventListener("resize", () => this.#clampPanel());
  }

  get visible() {
    return this.#visible;
  }

  get armed() {
    return this.#visible && this.#activeLead != null;
  }

  toggle() {
    this.setVisible(!this.#visible);
  }

  setVisible(visible) {
    this.#visible = Boolean(visible);
    this.#panel.hidden = !this.#visible;
    if (this.#visible && !this.#red) this.arm("red");
    else if (!this.#visible) this.disarmPlacement();
    this.#render();
    this.#onStateChange?.({ visible: this.#visible, armed: this.armed });
  }

  /**
   * Open the meter the way a lesson or a project's desktop left it: a mode,
   * and the two points the probes sit on. Like the scope's setup this is
   * runtime state, never part of the circuit document. An address that no
   * longer exists is harmless: the normal refresh path leaves its marker
   * hidden. `visible: false` closes the meter.
   *
   * @param {{visible?: boolean, mode?: string, red?: string, black?: string}} [setup]
   */
  loadSetup(setup = {}) {
    if (MODES.includes(setup.mode)) this.#mode = setup.mode;
    if (typeof setup.red === "string" && setup.red) this.#red = setup.red;
    if (typeof setup.black === "string" && setup.black) {
      this.#black = setup.black;
    }
    this.setVisible(setup.visible !== false);
    if (this.#red && this.#black) this.disarmPlacement();
    this.refresh();
  }

  arm(lead) {
    if (!this.#visible || !["red", "black"].includes(lead)) return;
    this.#activeLead = lead;
    this.#viewport.classList.add("desk-viewport--metering");
    this.#render();
    this.#onStateChange?.({ visible: true, armed: true });
  }

  disarmPlacement() {
    this.#activeLead = null;
    this.#viewport.classList.remove("desk-viewport--metering");
    this.#render();
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
    const lead = this.#activeLead;
    if (lead === "red") this.#red = hit.address;
    else this.#black = hit.address;
    const other = lead === "red" ? "black" : "red";
    if (!(other === "red" ? this.#red : this.#black)) this.arm(other);
    else this.disarmPlacement();
    this.refresh();
    return true;
  }

  refresh() {
    for (const [lead, address] of [
      ["red", this.#red],
      ["black", this.#black],
    ]) {
      const marker = this.#markers.get(lead);
      const point = address ? this.#addressWorld(address) : null;
      marker.hidden = !this.#visible || !point;
      if (point) {
        marker.style.left = `${point.x * PX_PER_UNIT}px`;
        marker.style.top = `${point.y * PX_PER_UNIT}px`;
      }
    }
    this.#render();
  }

  #buildPanel() {
    const modes = el("div", { class: "multimeter-modes", role: "group" });
    for (const mode of MODES) {
      const button = el("button", {
        type: "button",
        class: "multimeter-mode",
        text: MODE_LABELS[mode],
        title: t(`multimeter.mode.${mode}`),
        "aria-label": t(`multimeter.mode.${mode}`),
        onClick: () => {
          this.#mode = mode;
          this.#wasContinuous = false;
          this.#render();
        },
      });
      button.dataset.mode = mode;
      modes.append(button);
    }
    this.#display = el("output", {
      class: "multimeter-display",
      text: "—",
      "aria-live": "polite",
    });
    this.#hint = el("div", { class: "multimeter-hint" });
    const leads = el("div", { class: "multimeter-leads" });
    for (const lead of ["red", "black"]) {
      const button = el("button", {
        type: "button",
        class: `multimeter-lead multimeter-lead--${lead}`,
        onClick: () => this.arm(lead),
      });
      this.#leadButtons.set(lead, button);
      leads.append(button);
    }
    const close = el("button", {
      type: "button",
      class: "multimeter-close",
      text: "×",
      title: t("common.close"),
      "aria-label": t("common.close"),
      onClick: () => this.setVisible(false),
    });
    const dragHandle = el(
      "div",
      {
        class: "multimeter-drag-handle",
        onPointerdown: (event) => this.#startDrag(event),
        onPointermove: (event) => this.#moveDrag(event),
        onPointerup: (event) => this.#endDrag(event),
        onPointercancel: (event) => this.#endDrag(event),
      },
      [
        el("strong", {
          class: "multimeter-title",
          text: t("multimeter.title"),
        }),
        close,
      ],
    );
    const panel = el(
      "section",
      {
        class: "multimeter-panel",
        hidden: true,
        "aria-label": t("multimeter.title"),
      },
      [dragHandle, modes, this.#display, this.#hint, leads],
    );
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    panel.addEventListener("click", (event) => event.stopPropagation());
    return panel;
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
    this.#panel.classList.add("multimeter-panel--dragging");
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
    this.#panel.classList.remove("multimeter-panel--dragging");
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

  #reading() {
    if (!this.#red || !this.#black) {
      return { text: "—", hint: t("multimeter.placeBoth") };
    }
    if (this.#mode === "voltage") {
      const solvedRed = this.#sim.voltsAt(this.#red);
      const solvedBlack = this.#sim.voltsAt(this.#black);
      if (solvedRed != null && solvedBlack != null) {
        return {
          text: engineering(solvedRed - solvedBlack, "V"),
          hint: t("multimeter.redMinusBlack"),
        };
      }
      const red = logicVolts(this.#sim.levelAt(this.#red));
      const black = logicVolts(this.#sim.levelAt(this.#black));
      return red == null || black == null
        ? { text: "—", hint: t("multimeter.runSpice") }
        : {
            text: engineering(red - black, "V"),
            hint: t("multimeter.logicVoltage"),
          };
    }
    if (this.#mode === "current") {
      const red = this.#sim.currentAt(this.#red);
      const black = this.#sim.currentAt(this.#black);
      const amps = red ?? (black == null ? null : -black);
      return amps == null
        ? { text: "—", hint: t("multimeter.currentLead") }
        : { text: engineering(amps, "A"), hint: t("multimeter.currentLead") };
    }
    const doc = this.#doc.toJSON();
    const netlist = this.#netlist.get({ inductors: "branch" });
    const passive = passiveMeasurements(doc, netlist, this.#red, this.#black);
    if (this.#mode === "resistance") {
      return {
        text: engineering(passive.resistance, "Ω"),
        hint: t("multimeter.powerOff"),
      };
    }
    if (this.#mode === "capacitance") {
      return {
        text: engineering(passive.capacitance, "F"),
        hint: t("multimeter.powerOff"),
      };
    }
    if (this.#mode === "inductance") {
      return {
        text: engineering(passive.inductance, "H"),
        hint: t("multimeter.powerOff"),
      };
    }
    const continuous =
      passive.resistance != null && passive.resistance <= CONTINUITY_OHMS;
    if (continuous && !this.#wasContinuous) this.#beep();
    this.#wasContinuous = continuous;
    return {
      text: continuous ? t("multimeter.beep") : "OL",
      hint:
        passive.resistance == null
          ? t("multimeter.open")
          : engineering(passive.resistance, "Ω"),
    };
  }

  #render() {
    if (!this.#panel) return;
    for (const button of this.#panel.querySelectorAll(".multimeter-mode")) {
      const active = button.dataset.mode === this.#mode;
      button.classList.toggle("multimeter-mode--active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    for (const [lead, address] of [
      ["red", this.#red],
      ["black", this.#black],
    ]) {
      const button = this.#leadButtons.get(lead);
      button.textContent = `${t(`multimeter.${lead}`)}: ${address ?? t("multimeter.place")}`;
      button.classList.toggle(
        "multimeter-lead--active",
        this.#activeLead === lead,
      );
    }
    const reading = this.#reading();
    this.#display.textContent = reading.text;
    this.#hint.textContent = reading.hint;
  }

  #beep() {
    try {
      const AudioContextRef = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextRef) return;
      const context = new AudioContextRef();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 900;
      gain.gain.setValueAtTime(0.06, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.09);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.1);
      oscillator.addEventListener("ended", () => context.close(), {
        once: true,
      });
    } catch {
      // A visual continuity result remains when audio is unavailable.
    }
  }
}
