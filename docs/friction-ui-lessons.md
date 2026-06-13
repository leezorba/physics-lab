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

## Stick-Slip Diagram

- **Spring stretch should be smooth, not re-counted.** The spring uses a fixed eight-coil sine-wave path with rounded line caps/joins. Do not derive the coil count from the current spring length; that makes new zigzags appear as the spring stretches and feels like geometry popping into existence.
- **Force arrows originate on the block.** `F_s` starts near the spring attachment on the upper-right/upper-left face and points in the spring-force direction. `F_f` starts near the lower contact edge and points opposite the spring force. `F_n` starts at the top face. This keeps the arrows tied to the free-body diagram instead of floating in the spring or hovering off the block.

## Physics Refinements (post-publish polish pass)

These changed sim *behavior*, so they are recorded here per AGENTS.md → Physics Rules ("do not change physics silently — flag it").

- **Substepped stick-slip integration.** `updateStick` now advances the spring in 4 fixed substeps per frame (`h = dt/4`) instead of one Euler step. At high `k` and low mass the spring period approaches the frame time, and a single step visibly distorted the slip arc (overshoot, jagged sawtooth). Substepping keeps `ω·h` small across the whole slider range so the sawtooth is smooth and physically shaped. No equation changed — only the integration resolution.
- **Removed the artificial re-stick heuristic.** The old code re-stuck the block with a `slipTime > 0.08 && v <= driveSpeed && |springForce| < staticMax*0.88` fudge and a separate `slipTime` state field. With `μ_k ≤ μ_s` enforced, the slip arc always decelerates back through `v = 0`, and the block re-sticks exactly when the spring force at that instant can be held by static friction (`|springForce| ≤ staticMax`). That is the physically correct re-stick condition; the heuristic was masking the single-step integration error that substepping now fixes. `slipTime` is gone from state and defaults.
- **Real-meter position scaling.** Sliding stores `m.x ∈ [0,1]` across a `SLIDE_TRACK_M = 5 m` track (`m.x += v·dt / SLIDE_TRACK_M`, identical to the old `v·dt·0.2`). Incline stores `m.s` with `INCLINE_SCALE_M = 1/0.12 ≈ 8.3 m` (`m.s -= v·dt / INCLINE_SCALE_M`, identical to the old `v·dt·0.12`). The constants are mathematically equivalent to the previous magic numbers; naming them lets the info panel report position in meters honestly.

## On-Canvas Readouts

- **Load meter bars in the info panel.** `infoPanel` lines may carry `bar: fraction`. Sliding shows breakaway % (`F / static max`), incline shows `tan θ / μ_s`, stick-slip shows spring load (`|F_s| / static max`). The bar fills green → amber → red as the fraction approaches 1, so the user sees how close the contact is to slipping without reading the number. Colors come from `--green` / `--canvas-meter-warn` / `--red`.
- **Slip-angle guide ray + θ arc (incline).** A dashed ray at `atan(μ_s)` shows the slip threshold on the diagram; it turns red once the ramp tilts past it. A small arc at the base corner labels the current angle θ. These pin the "slip when `tan θ > μ_s`" lesson to the geometry instead of leaving it in the panel only.
- **Hatched wall (sliding).** The right wall the block clamps against at `m.x = 1` gets diagonal hatching on its far side, the textbook convention for an immovable boundary. Reinforces that "AT WALL" is an expected stop.
- **Canvas colors are theme tokens.** The block (gradient via `--canvas-block-fill/-edge/-shade`), spring (`--canvas-spring`), arrows, chart line (`--canvas-chart-line`), and meter colors all read from CSS tokens cached in `readTheme()` and re-cached on `themechange`. No hardcoded hex remains in the friction canvas code.

## Telemetry Rendering

- **Build once, update values per frame.** `buildTelemetry()` (called from `renderControls`) writes the tile DOM for the active tab and caches the `<strong>` nodes in `telemetryEls`; `renderTelemetry()` only updates their `textContent`. The old code rebuilt `grid.innerHTML` every animation frame — needless 60 fps DOM churn that also made values unselectable. The status pill re-applies its class only when the state key actually changes, and replays a short `pill-pop` scale animation on each real transition.

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
- Stick-Slip spring stretches with a stable smooth coil count and does not pop in new zigzags as it expands;
- Stick-Slip `F_s`, `F_f`, and `F_n` arrows attach visually to the block faces/contact edge and stay readable over the spring;
- focus-mode toggle still collapses the side panel.
