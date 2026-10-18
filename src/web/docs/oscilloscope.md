# Oscilloscope

The oscilloscope is a two-channel voltage display for watching circuit levels
over simulated time. It is available in both the full workbench and embedded
labs.

## Taking a measurement

1. Select **Oscilloscope** in the desk tools.
2. Place **CH1**, **CH2**, and the shared **Ground** probe on breadboard holes
   or component connection points. Click a probe button to move it later.
3. Press **Run**. The display reads each channel relative to Ground and draws
   the captured voltage trace.

Use **Time/div** to change the horizontal window and **V/div** to change the
vertical scale. The trigger controls select CH1 or CH2, rising or falling edge,
and the voltage level used to align repeating signals.

Each channel can be enabled independently, switched between DC and display-only
AC coupling, and moved vertically in divisions. **Auto** selects useful voltage
and time scales from the capture, **Hold** freezes the acquisition without
stopping the circuit, and **Clear** starts an empty capture.

The measurement rows report peak-to-peak and average voltage, frequency,
period, and duty cycle for each enabled channel. **Cursors** adds independently
adjustable T1/T2 and V1/V2 markers with live Δt and ΔV readouts.

The bundled `oscilloscope-demo` lesson supplies a 1 Hz clock and a
divide-by-two flip-flop output for checking frequency, duty cycle, triggering,
and cursor measurements in an embedded lab.

Drag the title bar to move the oscilloscope around the workspace. Its position
is constrained to the visible desk so the controls cannot be lost off-screen.

The first implementation is DC-coupled and uses the simulator's calculated
node voltage when Spice Lite provides one. Digital-only runs fall back to 5 V
for HIGH and 0 V for LOW. A settled circuit that publishes one sample is shown
as a flat level across the screen.

## Current scope

This version provides two voltage channels, one common ground, adjustable
time and voltage scales, edge triggering, channel coupling and offsets,
automatic measurements, hold/clear/autoscale, and time/voltage cursors. It
does not model probe loading or analog bandwidth, and intentionally omits
specialized XY and FFT analysis.
