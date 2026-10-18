/*
 * Copyright 2026 Jason Figge
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** Return the most recent requested edge crossing at or before `before`. */
export function triggerAt(samples, channel, edge, level, before = Infinity) {
  for (let i = samples.length - 1; i > 0; i -= 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (b.at > before) continue;
    const av = a[channel];
    const bv = b[channel];
    if (!Number.isFinite(av) || !Number.isFinite(bv)) continue;
    const crossed =
      edge === "falling"
        ? av > level && bv <= level
        : av < level && bv >= level;
    if (crossed) return b.at;
  }
  return null;
}

/** Keep the oscilloscope's bounded history inexpensive during long runs. */
export function appendScopeSample(samples, sample, capacity = 4000) {
  samples.push(sample);
  if (samples.length > capacity) samples.splice(0, samples.length - capacity);
  return samples;
}

function crossingTime(a, b, channel, level) {
  const av = a[channel];
  const bv = b[channel];
  if (!Number.isFinite(av) || !Number.isFinite(bv) || av === bv) return null;
  const ratio = (level - av) / (bv - av);
  if (ratio < 0 || ratio > 1) return null;
  return a.at + (b.at - a.at) * ratio;
}

/** Voltage and timing measurements over one visible acquisition window. */
export function scopeMeasurements(
  samples,
  channel,
  { start = -Infinity, end = Infinity, threshold = 2.5 } = {},
) {
  const points = samples.filter(
    (sample) =>
      sample.at >= start &&
      sample.at <= end &&
      Number.isFinite(sample.at) &&
      Number.isFinite(sample[channel]),
  );
  if (!points.length) return null;
  const values = points.map((point) => point[channel]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const rising = [];
  let highTime = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.at - a.at;
    if (!(dt > 0)) continue;
    const av = a[channel];
    const bv = b[channel];
    const aHigh = av >= threshold;
    const bHigh = bv >= threshold;
    if (!aHigh && bHigh) {
      const crossing = crossingTime(a, b, channel, threshold);
      if (crossing != null) {
        rising.push(crossing);
        highTime += b.at - crossing;
      }
    } else if (aHigh && !bHigh) {
      const crossing = crossingTime(a, b, channel, threshold);
      if (crossing != null) highTime += crossing - a.at;
    } else if (aHigh && bHigh) highTime += dt;
  }
  const periods = rising.slice(1).map((at, index) => at - rising[index]);
  const period = periods.length
    ? periods.reduce((sum, value) => sum + value, 0) / periods.length
    : null;
  const duration = points.at(-1).at - points[0].at;
  return {
    min,
    max,
    peakToPeak: max - min,
    average,
    period,
    frequency: period > 0 ? 1 / period : null,
    dutyCycle: duration > 0 ? (highTime / duration) * 100 : null,
  };
}

/** Smallest available volts/div that fits `maxAbs` into four divisions. */
export function autoVoltageScale(maxAbs, steps) {
  const needed = Math.max(0, maxAbs) / 3.5;
  return steps.find((step) => step >= needed) ?? steps.at(-1);
}

/** Smallest available time/div that displays at least 2.5 signal periods. */
export function autoTimeScale(period, steps) {
  if (!(period > 0)) return null;
  const needed = (period * 2.5) / 10;
  return steps.find((step) => step >= needed) ?? steps.at(-1);
}
