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

/** Choose the ten-division acquisition window shown by a digital scope.
    Triggered modes keep the trigger at a fixed horizontal position; roll
    mode continuously follows the newest sample from the right edge. */
export function scopeWindow(
  samples,
  {
    channel = "ch1",
    edge = "rising",
    level = 2.5,
    mode = "auto",
    span = 1,
    triggerPosition = 0.3,
  } = {},
) {
  if (!samples.length || !(span > 0)) return null;
  const latest = samples.at(-1).at;
  const position = Math.max(0, Math.min(1, triggerPosition));
  if (mode === "roll") {
    return { start: latest - span, end: latest, trigger: null };
  }
  const postTrigger = span * (1 - position);
  const trigger = triggerAt(
    samples,
    channel,
    edge,
    level,
    latest - postTrigger,
  );
  if (trigger != null) {
    const start = trigger - span * position;
    return { start, end: start + span, trigger };
  }
  if (mode === "normal") return null;
  const first = samples[0].at;
  const completeEnd = Math.floor(latest / span) * span;
  if (completeEnd - span >= first) {
    // Auto's forced acquisition: publish a complete, stationary record even
    // when the selected trigger cannot qualify. Holding this first complete
    // frame avoids silently turning Auto into a scrolling/rewinding display.
    return {
      start: completeEnd - span,
      end: completeEnd,
      trigger: null,
      freeRun: true,
    };
  }
  // Auto mode must not quietly become Roll while it waits. A real DSO shows
  // completed records; the view uses this flag only while collecting enough
  // history for the first full record.
  return {
    start: latest - span,
    end: latest,
    trigger: null,
    acquiring: true,
  };
}

/** Resample sparse simulator events into a complete DSO acquisition record.
    Digital nets are sample-and-hold signals: each event's value remains valid
    until the next event. One point per display column keeps the rendered trace
    stationary and makes time/div change record resolution, not animation. */
export function resampleScopeWindow(
  samples,
  start,
  end,
  count,
  channels = ["ch1", "ch2"],
) {
  const size = Math.max(2, Math.floor(count) || 2);
  if (!samples.length || !(end > start)) return [];
  let sourceIndex = 0;
  const held = Object.fromEntries(channels.map((channel) => [channel, null]));
  while (
    sourceIndex < samples.length &&
    samples[sourceIndex].at <= start
  ) {
    for (const channel of channels) {
      if (Number.isFinite(samples[sourceIndex][channel])) {
        held[channel] = samples[sourceIndex][channel];
      }
    }
    sourceIndex += 1;
  }
  const result = [];
  for (let index = 0; index < size; index += 1) {
    const at = start + (index / (size - 1)) * (end - start);
    while (
      sourceIndex < samples.length &&
      samples[sourceIndex].at <= at
    ) {
      for (const channel of channels) {
        if (Number.isFinite(samples[sourceIndex][channel])) {
          held[channel] = samples[sourceIndex][channel];
        }
      }
      sourceIndex += 1;
    }
    result.push({ at, ...held });
  }
  return result;
}

/** Keep the oscilloscope's bounded history inexpensive during long runs. */
export function appendScopeSample(samples, sample, capacity = 4000) {
  samples.push(sample);
  if (samples.length > capacity) samples.splice(0, samples.length - capacity);
  return samples;
}

/** Extend an event-driven capture to the current display time. The synthetic
    tail holds the last voltage; it makes Roll move smoothly between circuit
    events without inventing intermediate electrical transitions. */
export function extendScopeSamples(samples, at) {
  const last = samples.at(-1);
  if (!last || !Number.isFinite(at) || at <= last.at) return samples;
  return [...samples, { ...last, at }];
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
  const falling = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!(b.at > a.at)) continue;
    const av = a[channel];
    const bv = b[channel];
    const aHigh = av >= threshold;
    const bHigh = bv >= threshold;
    if (!aHigh && bHigh) {
      const crossing = crossingTime(a, b, channel, threshold);
      if (crossing != null) rising.push(crossing);
    } else if (aHigh && !bHigh) {
      const crossing = crossingTime(a, b, channel, threshold);
      if (crossing != null) falling.push(crossing);
    }
  }
  const periods = rising.slice(1).map((at, index) => at - rising[index]);
  const period = periods.length
    ? periods.reduce((sum, value) => sum + value, 0) / periods.length
    : null;
  const completeCycleDuties = rising.slice(0, -1).flatMap((cycleStart, index) => {
    const cycleEnd = rising[index + 1];
    const fallingEdge = falling.find(
      (at) => at > cycleStart && at < cycleEnd,
    );
    return fallingEdge == null
      ? []
      : [(fallingEdge - cycleStart) / (cycleEnd - cycleStart)];
  });
  return {
    min,
    max,
    peakToPeak: max - min,
    average,
    period,
    frequency: period > 0 ? 1 / period : null,
    dutyCycle: completeCycleDuties.length
      ? (completeCycleDuties.reduce((sum, value) => sum + value, 0) /
          completeCycleDuties.length) *
        100
      : null,
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
