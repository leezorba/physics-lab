# Friction UI Lessons

This note captures post-publish UX decisions from `public/mech/friction.html`. Keep this focused on durable interface behavior and visual honesty. Do not turn this file into a per-fix changelog.

Cross-sim conventions (sticky back link, `.fill-columns` helper, numbered footer headers, "How to Use" intro section) live in `AGENTS.md`. Solar-specific lessons live in `docs/solar-ui-lessons.md`.

## Purpose

Friction Lab is three classic textbook setups in one page (Sliding Block, Inclined Plane, Stick-Slip). The user picks a gravity environment, picks a tab, and pushes a slider. The goal is to make the static-vs-kinetic friction story visible — what changes, when it changes, and why.

The UI should answer three beginner questions for every tab without requiring a physics background:

- What is the block doing right now? (status pill)
- What were the headline numbers during the run? (telemetry tiles + chart)
- What does that velocity curve shape teach me? (chart is the lesson, not a decoration)

## Telemetry Decisions

- **Peak velocity tile (Sliding + Inclined):** the live velocity is zeroed the moment the block hits the wall or base. The peak tile records the highest velocity reached during the current run and persists after the block stops, so the user can read the answer instead of catching it mid-flight. Mirrors rocket's `MAX-Q (PEAK)` pattern.
- **Stick-Slip omits the peak tile:** its existing chart already shows `max X.XX m/s`. Adding a redundant tile would clutter the readout.
- **Status pill drives meaning, not just labels:** `STUCK`, `SLIDING`, `AT WALL`, `AT BASE`, `NEAR SLIP`, `STICKING`, `SLIPPING`. Each is a meaningful state, not a verbose name. Do not add "AT WALL (held by friction)" — the pill is a glance, the canvas is the explanation.

## Chart Decisions

- **Velocity-vs-time chart on every tab:** Sliding and Inclined now use the chart pattern Stick-Slip already had. The curve shape teaches kinetic friction visually — a straight line means no friction; a curve that flattens means kinetic friction is eating the gain.
- **Chart freezes at impact:** when the block reaches the wall/base, the update loop pushes one final `v=0` stamp and then stops appending. The chart preserves the entire run history until the user resets. Do not let zero-velocity frames keep accumulating, that pushes the curve out of view.
- **Chart hint when empty:** before motion starts, show the activation prompt ("push F past static max to start a run", "tilt past slip angle to start a run"). Hidden behavior is unkind to first-time users.
- **Time axis is run-relative, not session-relative:** elapsed counts from when motion begins, not page load. Users compare runs against each other, not against wall-clock.

## Visual Barriers

- **Sliding Block has a visible right wall** matching the `m.x = 1` clamp. The block hitting an invisible boundary felt like a glitch.
- **Inclined Plane stops at the actual ramp/floor corner** with `minS = 0.06`. Earlier `minS = 0.16` left the block floating mid-slope at "AT BASE", which contradicted what the status pill said.
- **No invisible clamps.** If physics enforces a boundary, draw the boundary. The wall, floor, and ramp corner are all rendered explicitly.
- **Removed decoration that pretends to be physics.** The original Stick-Slip canvas drew a hardcoded dark bar on the left that read as a fixed anchor but had no physical role (the spring is anchored on the right via the teal driver bar). Removed.

## Pause / Resume

- **One pause button covers all three tabs.** Lives in the controls-card header next to reset, toggles `⏸` / `▶`. The animation loop skips `updatePhysics(dt)` when `state.paused` is true; render still runs so the canvas stays current.
- **Spacebar shortcut pauses/resumes** from anywhere on the page, except when focus is in an `<input>` or `<textarea>` (don't hijack typing in the gravity slider or the stats panel textarea).
- **Reset `lastTime` on resume** so the very next frame's `dt` is one frame's worth, not the entire paused duration. Otherwise the block teleports forward on resume.
- **Pause is for inspection, not for slowing.** Stick-Slip cycles forever by design; pause is the only way to freeze a single moment in the cycle and read the telemetry.

## Reset Semantics

- **Reset rewinds the active tab's state to defaults**, including position, velocity, status, peak velocity, and chart history. Other tabs are not touched.
- **Switching gravity also resets `peakV` and `chart`** for sliding and incline. Peak velocity from an Earth run is meaningless on the Moon — keeping the stale number would mislead. Same for the chart.
- **Reset does not clear the slider values.** Mass, μ_s, μ_k, applied force, ramp angle, etc. persist. Reset is "rewind this run", not "clear the experiment".

## Footer Structure

The footer follows the lab-wide convention (see `AGENTS.md`): five numbered sections, "How to Use This Lab" first as the beginner-onboarding card grid. Two specific sections use the `.fill-columns` 2-column layout: `04 Why This Matters Off-Earth` (4 list items) and `05 What This Does Not Capture` (3 paragraphs). Reference text fills the box without exceeding ~75 characters per line.

## Verification Pattern

For friction UI changes, verify:

- on each tab, push the relevant control past its threshold and watch the block move;
- live `Velocity` climbs while moving, then drops to `0.00 m/s` at the wall/base;
- `Peak v` tile (Sliding + Inclined only) records the high water mark and stays after the block stops;
- velocity chart fills in during the run, shows the impact stamp, and freezes;
- click `↺` reset on the active tab → position, velocity, peak, chart all clear;
- switch gravity Earth → Moon → Mars → custom → peak and chart clear on the affected tabs;
- pause via `⏸` and via Spacebar both freeze elapsed motion; resume continues without teleporting;
- the other two tabs' telemetry/state remain unchanged when one tab is reset or paused;
- theme toggle dark ↔ light redraws the canvas correctly (wall, floor, ramp, block, arrows);
- focus-mode toggle still collapses the side panel.
