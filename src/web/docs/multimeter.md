# Multimeter

The built-in multimeter is a two-probe diagnostic tool for answering questions
about one point, two points, or a passive path in a circuit. It is available in
the full workbench and interactive article embeds. The meter and its probes do
not alter the circuit and are not saved in the `.chiphippo` project.

## Opening and positioning the meter

Select the meter icon in **Desk tools**. Drag the **Multimeter** title bar to
move the panel. Select **Red** or **Black**, then select a breadboard hole,
component terminal, supply terminal, or other circuit point. A colored probe
marker shows the exact selected point. Select a probe button again whenever you
want to move it. Press `Escape` or `M` to cancel probe placement.

The reading is always interpreted from red to black. Reversing the probes
reverses the sign of voltage and current readings, just as it does on a physical
meter.

## Choosing a measurement

### DC voltage

**V DC** reports the red-probe voltage minus the black-probe voltage. Run the
circuit before relying on a live voltage reading.

- Put black on circuit ground and red on a signal to measure that signal.
- Put the probes across a component to measure its voltage drop.
- A negative reading means the red probe is at a lower potential than black.
- The ordinary logic engine supplies nominal LOW/HIGH values. Spice Lite uses
  solved circuit voltages, including TTL output levels, supply droop and analog
  nodes.

### DC current

**A DC** reports current through a component lead known to Spice Lite. Place a
probe on a resistor, LED, inductor, switch, chip output, or supply lead that has
a modeled branch current. Unlike a physical ammeter, the virtual meter does not
break the circuit and insert a zero-ohm current path. If neither selected point
has a known branch current, the display remains open rather than guessing.

Use current mode to check LED current, supply load, resistor current, and
whether an output is being overloaded. Enable Spice Lite for meaningful analog
current values.

### Resistance

Stop the circuit, choose **Ω**, and place the probes across the passive path of
interest. The meter calculates equivalent resistance, including supported
series and parallel resistor networks and an inductor's winding resistance.
An open reading means no resistive path connects the probes.

### Continuity

Stop the circuit and choose **Continuity**. A path of 50 Ω or less produces a
short beep; an open path is reported as open. Continuity is useful for checking
breadboard rows, rails, jumper routes, switches and accidental missing
connections. It is a connectivity test, not a logic-state test.

### Capacitance

Stop the circuit and choose **C**. The meter calculates equivalent capacitance
between the probes, including supported series and parallel capacitor networks.
Capacitor ESR is intentionally omitted because Chip Hippo capacitors are ideal
components without simulated aging or faults.

### Inductance

Stop the circuit and choose **L**. The meter calculates equivalent inductance
for supported, uncoupled inductor networks, including series and parallel
combinations. Coupled inductors and transformer measurements are outside the
current model.

## A practical troubleshooting sequence

1. Use **Continuity** with the circuit stopped to verify the intended path.
2. Use **Ω** to catch an incorrect or missing resistor network.
3. Run the circuit and use **V DC** from ground to the supply and signal nodes.
4. Enable Spice Lite and use **A DC** when loading, current limits, LEDs, or
   analog behavior matter.
5. Reverse the probes if you need to confirm polarity; the sign should reverse.

## Common surprises

- **Open or blank current reading:** neither probe is on a lead with modeled
  branch current, or Spice Lite is disabled.
- **Negative voltage:** probe polarity is reversed relative to the voltage you
  expected.
- **Continuity says open:** the selected holes may look adjacent while belonging
  to different breadboard strips, or a switch may be open.
- **Resistance while running:** stop first. Passive measurements are intended
  for an unpowered circuit.
- **No ESR value:** ESR, component aging, probe resistance and meter burden are
  not currently modeled.

Close the panel with its × button or select the toolbar meter icon again.
