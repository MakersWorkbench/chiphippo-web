# Multimeter

The built-in multimeter puts two movable probes directly on the breadboard.
Open it from the meter icon in the desk toolbar, choose a measurement, then
click **Red** or **Black** and click a circuit point to place that probe. The
colored rings show exactly which holes are being measured. The meter is also
available in interactive article embeds.

The probes and selected mode are temporary bench tools. They do not alter the
circuit and are not stored in the `.chiphippo` project file.

## Live measurements

**V DC** displays the red probe voltage minus the black probe voltage. Start
the circuit first. The ordinary logic engine displays nominal 0/5 V values;
[Spice Lite](spice-lite.md) replaces those with its solved physical voltages.

**A DC** displays current through the component lead under either probe. This
does not insert a zero-ohm ammeter path or modify the circuit. Put a probe on a
resistor, LED, inductor, switch, chip-output, or supply lead for which Spice
Lite reports branch current. If neither selected point carries a known branch
current, the display remains open.

## Passive measurements

Stop the circuit before treating these readings like bench measurements:

- **Ω** calculates the equivalent resistance between the probes, including
  series/parallel resistor networks and an inductor's winding resistance.
- **Continuity** sounds a short beep at 50 Ω or less and shows an open circuit
  when no resistive path joins the probes.
- **C** calculates the equivalent capacitance of the connected capacitor
  network, including series and parallel combinations.
- **L** calculates the equivalent inductance of the connected, uncoupled
  inductor network, including series and parallel combinations.

Capacitor ESR is intentionally not modeled. Chip Hippo's capacitors are ideal
components, so an ESR reading would imply faults and parasitics that the
simulator does not contain.

## Moving or closing the meter

Select either lead button at any time to move that probe. Press `Escape` or
`M` to cancel an armed lead without closing the panel. Drag the **Multimeter**
title bar to move the panel around the visible workspace. Close the panel with
the × button or click the toolbar meter icon again.
