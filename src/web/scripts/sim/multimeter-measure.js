/*
 * Copyright 2026 Jason Figge
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { partDef } from "../catalog/index.js";
import { inductorOhms } from "../catalog/discretes.js";
import { partPinAddresses } from "../model/occupancy.js";
import { rcTrace } from "./rc-trace.js";

function solve(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-15) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const scale = a[col][col];
    for (let k = col; k <= n; k += 1) a[col][k] /= scale;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let k = col; k <= n; k += 1) {
        a[row][k] -= factor * a[col][k];
      }
    }
  }
  return a.map((row) => row[n]);
}

/** Equivalent value for an uncoupled two-terminal network. */
export function equivalentValue(edges, from, to, kind = "series") {
  if (!from || !to) return null;
  if (from === to) return 0;
  const usable = edges.filter(
    (edge) =>
      edge.a &&
      edge.b &&
      edge.a !== edge.b &&
      Number.isFinite(edge.value) &&
      edge.value > 0,
  );
  const adjacency = new Map();
  const add = (a, edge) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a).push(edge);
  };
  for (const edge of usable) {
    add(edge.a, edge);
    add(edge.b, edge);
  }
  const reached = new Set([from]);
  const pending = [from];
  while (pending.length) {
    const node = pending.pop();
    for (const edge of adjacency.get(node) ?? []) {
      const next = edge.a === node ? edge.b : edge.a;
      if (!reached.has(next)) {
        reached.add(next);
        pending.push(next);
      }
    }
  }
  if (!reached.has(to)) return null;

  const nodes = [...reached].filter((node) => node !== to);
  const index = new Map(nodes.map((node, i) => [node, i]));
  const matrix = nodes.map(() => Array(nodes.length).fill(0));
  for (const edge of usable) {
    if (!reached.has(edge.a) || !reached.has(edge.b)) continue;
    const conductance = kind === "parallel" ? edge.value : 1 / edge.value;
    const ia = index.get(edge.a);
    const ib = index.get(edge.b);
    if (ia != null) matrix[ia][ia] += conductance;
    if (ib != null) matrix[ib][ib] += conductance;
    if (ia != null && ib != null) {
      matrix[ia][ib] -= conductance;
      matrix[ib][ia] -= conductance;
    }
  }
  const source = Array(nodes.length).fill(0);
  source[index.get(from)] = 1;
  const volts = solve(matrix, source);
  if (!volts) return null;
  const result = volts[index.get(from)];
  if (!(result >= 0) || !Number.isFinite(result)) return null;
  return kind === "parallel" ? 1 / result : result;
}

function traceEdges(trace, nets, type) {
  const edges = [];
  const seen = new Set();
  const links = type === "capacitor" ? "capacitors" : "resistors";
  for (const net of nets) {
    for (const link of trace[links](net)) {
      if (!link.far || link.far === net) continue;
      const pair = [net, link.far].sort().join("\u0000");
      const key = `${type}:${link.id}:${pair}:${link.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: net, b: link.far, value: link.value });
    }
  }
  return edges;
}

function inductorEdges(doc, netlist, valueOf) {
  const edges = [];
  for (const comp of doc.components ?? []) {
    if (!partDef(comp.ref)?.inductor) continue;
    const pins = partPinAddresses(doc, comp);
    const a = netlist.netOfPoint.get(
      pins?.find((pin) => pin.pin === 1)?.address,
    );
    const b = netlist.netOfPoint.get(
      pins?.find((pin) => pin.pin === 2)?.address,
    );
    const value = valueOf(comp);
    if (a && b && a !== b && value > 0) edges.push({ a, b, value });
  }
  return edges;
}

export function passiveMeasurements(doc, netlist, redAddress, blackAddress) {
  const red = netlist.netOfPoint.get(redAddress) ?? null;
  const black = netlist.netOfPoint.get(blackAddress) ?? null;
  if (!red || !black) {
    return { resistance: null, capacitance: null, inductance: null };
  }
  const trace = rcTrace(doc, netlist);
  const nets = netlist.nets.keys();
  const resistors = traceEdges(trace, nets, "resistor");
  const capacitors = traceEdges(trace, netlist.nets.keys(), "capacitor");
  resistors.push(
    ...inductorEdges(doc, netlist, (comp) => inductorOhms(comp.params)),
  );
  const inductors = inductorEdges(
    doc,
    netlist,
    (comp) => Number(comp.params?.henries) || 0,
  );
  return {
    resistance: equivalentValue(resistors, red, black),
    capacitance: equivalentValue(capacitors, red, black, "parallel"),
    inductance: equivalentValue(inductors, red, black),
  };
}
