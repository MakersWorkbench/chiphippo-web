# Oscilloscope

The built-in oscilloscope is a two-channel digital storage oscilloscope (DSO)
for seeing how voltages change over simulated time. A multimeter answers “what
is the voltage now?”; an oscilloscope answers “what shape does this voltage make
over time, how often does it repeat, and what happened before and after an
edge?” It is available in the full workbench and interactive article embeds.

Use it to inspect clocks, pulses, flip-flop outputs, counter stages, oscillator
frequency, propagation relationships, duty cycle, RC charge/discharge behavior,
glitches, and two signals that must be compared in time.

## Connecting the probes

1. Select **Oscilloscope** in **Desk tools**.
2. Select **CH1**, then select the first circuit point to observe.
3. Select **CH2**, then select the second point if needed.
4. Select **Ground** and place it on the circuit reference, normally the power
   supply negative terminal or breadboard ground rail.
5. Press **Run**.

Both channels are measured relative to the one common Ground probe. A misplaced
ground therefore shifts both readings. The colored probe markers show the exact
selected points. Select any probe button to move it. Instrument state and probe
positions are temporary bench tools and are not stored in the project file.

Drag the **Oscilloscope** title bar to move the panel around the visible desk.

## Reading the display

The screen is divided into ten horizontal time divisions and eight vertical
voltage divisions.

- Yellow is CH1; blue is CH2.
- The left voltage numbers belong to CH1 and the right numbers to CH2.
- The colored side markers show each channel's 0 V reference.
- The top numbers show time. With a valid trigger, `0 s` is the trigger event;
  negative values occurred before it and positive values after it. In Roll,
  the right edge is now and older data lies to the left.
- The dashed vertical trigger marker identifies the trigger position.

The rows below the screen show the latest channel voltages and automatic
measurements: peak-to-peak voltage, average voltage, frequency, period and duty
cycle. Duty cycle is calculated from complete cycles so partial pulses at the
screen edges do not distort the answer.

## Horizontal scale: time per division

**Time/div** controls how much simulated time one horizontal grid division
represents. The entire screen spans ten times that value.

- Select **−** beside Horizontal to zoom in: less time is visible and edges are
  spread farther apart.
- Select **+** to zoom out: more time and more cycles are visible.
- Select an exact value from the time/div menu.

Start with two to five cycles visible. Zoom in to examine an edge or pulse;
zoom out to compare slower behavior. If the screen contains only a flat segment
or one edge, the signal may be fine—the time window may simply be too short or
too long.

## Vertical scale and separating channels

**V/div** controls how many volts one vertical division represents.

- Select **−** beside Vertical to use fewer volts per division and make the
  waveform taller.
- Select **+** to use more volts per division and make it shorter.

Each channel has an independent **vertical offset** field measured in divisions.
Positive values move that trace upward; negative values move it downward.
Offsets move only the drawing and its colored 0 V marker—they do not alter the
measured voltage. For two overlapping traces, try CH1 at `-2 div` and CH2 at
`+2 div`, then adjust to taste.

Use the channel checkbox to hide a channel. **DC** coupling shows the complete
voltage, including its DC level. Display-only **AC** coupling removes the mean
level so a varying component riding on a DC offset is easier to see.

## Why triggering matters

A repetitive waveform would slide around if every acquisition began at an
arbitrary time. A trigger tells the scope which recognizable event should be
placed at a fixed horizontal position. Repeated acquisitions then align on that
event and the waveform appears stationary even though the circuit continues to
run.

The trigger controls are:

- **Source:** CH1 or CH2—the signal examined for the trigger.
- **Edge:** rising or falling.
- **Level:** the voltage the selected edge must cross.
- **Trigger Position:** where the event appears horizontally. Moving it right
  reveals more pre-trigger history; moving it left reveals more post-trigger
  history.

For a 0–5 V digital clock, a rising trigger near 2.5 V is a useful starting
point. If a stable trace never appears, verify the source, put the level between
the signal's low and high voltages, and confirm the chosen edge actually occurs.

## Auto, Normal and Roll modes

**Auto** is the best starting mode. A valid trigger produces a stable,
edge-aligned display. If no valid trigger arrives, the scope eventually forces a
complete free-running acquisition so a DC level or unknown signal is still
visible.

**Normal** updates only when the requested trigger occurs. Use it when a
specific event matters and you do not want unrelated forced acquisitions. An
incorrect trigger setting may leave the scope waiting.

**Roll** is a continuous chart-recorder view. New data appears at the right and
older data moves left. Roll is useful for slow clocks, RC curves, switch events
and other low-frequency behavior. Its motion is refreshed independently from
the event-driven sampling, so a slow clock scrolls smoothly without fabricated
electrical transitions.

## Acquisition controls

- **Hold** freezes the current capture while the circuit continues. Select
  **Resume** to continue acquiring.
- **Clear** removes the captured history and begins a fresh acquisition.
- **Auto** (the button, not the trigger mode) chooses useful time/div and
  volts/div values from the captured waveform.
- **Cursors** enables T1/T2 time markers and V1/V2 voltage markers. Their Δt and
  ΔV readouts are useful for measuring a pulse, delay, rise interval or voltage
  difference manually.

Sampling and frame rate are deliberately separate. The scope records simulator
events, including transitions that happen between display refreshes, and
resamples the acquisition into screen columns. Screen animation therefore does
not determine the electrical sample history.

## Understanding the demonstration circuit

Open `/embed/oscilloscope-demo`. CH1 is connected to a nominal 1 Hz clock and
CH2 to a 74LS74 flip-flop wired as a divide-by-two stage.

Expected results:

- CH1 is approximately 1 Hz with a period near 1 second.
- CH2 toggles on each selected CH1 edge, so it is approximately 0.5 Hz with a
  period near 2 seconds.
- CH2 may show a TTL high near 3.4 V under Spice Lite rather than reaching the
  full 5 V supply.
- Both signals should have a duty cycle near 50%.

Use Auto mode with CH2 as the trigger source for a stationary comparison. Use
Roll to watch both traces travel continuously. Separate the traces with their
vertical offsets when they overlap.

## A practical workflow

1. Connect Ground, then CH1 and optionally CH2.
2. Run the circuit and begin in Auto trigger mode.
3. Set V/div so each waveform fits vertically.
4. Set Time/div so two to five cycles are visible.
5. Choose the channel and edge that represent the event of interest.
6. Put the trigger level between that signal's low and high values.
7. Separate the traces with channel offsets.
8. Use Hold and Cursors for a close measurement.
9. Switch to Roll only when continuous slow-time movement is more useful than a
   trigger-aligned waveform.

## Troubleshooting

- **No trace:** run the circuit, verify all three probes, enable the channel and
  try Auto trigger mode.
- **Flat line:** the node may be DC, the circuit may not be switching, or the
  time/div setting may show only one part of a long cycle.
- **Trace will not stabilize:** check trigger source, edge and level; then use
  Auto before trying Normal.
- **Only one transition:** zoom out horizontally to include more periods.
- **Waveform is clipped:** increase V/div, change the channel offset, or use
  Autoscale.
- **Traces overlap:** give CH1 and CH2 different vertical offsets.
- **Roll seems different from Auto:** that is intentional. Roll moves through
  time; a correctly triggered Auto/Normal trace appears stationary.
- **Frequency or duty shows —:** the visible acquisition does not contain
  enough complete edges or cycles. Zoom out or acquire longer.

## Current limitations

The scope does not model probe loading, input impedance, analog bandwidth,
noise, probe compensation, sample aliasing from a selectable hardware sample
rate, XY mode, protocol decoding or FFT analysis. Spice Lite supplies calculated
node voltages; digital-only runs fall back to nominal 5 V HIGH and 0 V LOW.
