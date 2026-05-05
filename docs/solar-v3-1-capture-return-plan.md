# Solar V3.1 Capture/Return Continuity Plan

This follow-up exists because manual testing found a real planner/UI mismatch:
Mars/Venus orbit-return and touch-return visually jump from SOI arrival into
parking orbit, then later jump from target departure into the return coast.

That is not mainly a camera bug. In the current V3 mission planner, capture and
departure are zero-duration segments. The UI can pause or zoom around those
handoffs, but it cannot honestly animate a natural approach into orbit unless
the mission plan includes a finite target-centric approach path.

## Current Root Cause

In `public/shared/orbital.js`, Mars/Venus orbit-return and touch-return use this
shape:

- `heliocentric_outbound`
- `capture` with `duration = 0`
- `target_orbit` with `duration = 0`
- `target_wait`
- `departure` with `duration = 0`
- `heliocentric_return`
- `earth_arrival`

The same simplified pattern exists for Moon orbit-return/touch-return with
`loi_capture`, `moon_orbit`, `tei_departure`, and `translunar_return`.

Flyby missions already have a finite target-centric flyby arc, which is why
they feel less like a teleport near the target.

## User-Facing Problem

The viewer sees:

- the craft approach the target in System/SOI view;
- an immediate jump into a clean parking orbit;
- later, an immediate jump from parking orbit to the return transfer;
- at the end, an Earth-arrival marker that can look like the craft stopped in
  space or jumped to Earth.

For a beginner, that reads as broken motion rather than patched-conic modeling.

## Recommended V3.1 Scope

Do this as a mission-planner follow-up, not as a Solar UI-only patch.

Add finite visualization segments around capture and departure while preserving
the current propulsive budget:

- Add a target-centric arrival segment before capture:
  - Mars/Venus: `target_arrival`
  - Moon: `moon_arrival`
  - It starts at the SOI crossing state and follows the incoming hyperbolic
    target-relative path toward periapsis / parking radius.
  - It has nonzero duration and sampled points.
  - It has `deltaV = 0`.
- Keep capture as an instantaneous burn marker at periapsis / parking insertion:
  - Mars/Venus: `capture`
  - Moon: `loi_capture`
  - It keeps the same delta-v accounting.
- Keep parking orbit/wait as circular analytical display:
  - Mars/Venus: `target_orbit`, `target_wait`
  - Moon: `moon_orbit`, `moon_wait`
- Add a finite target-centric departure/escape segment after departure:
  - Mars/Venus: `target_departure`
  - Moon: `moon_departure`
  - It starts just after the departure burn and propagates from parking radius
    toward SOI exit.
  - It has nonzero duration and sampled points.
  - It has `deltaV = 0`; the burn remains on `departure` / `tei_departure`.
- Keep Earth arrival as a marker, not a modeled reentry or landing.

## UI Expectations

After the planner exposes those finite segments, update `public/astro/solar.html`
to render them as normal motion:

- Use System for long heliocentric/translunar coasts.
- Auto-switch to SOI before target arrival, but keep the transition smooth.
- Use SOI for `target_arrival` / `moon_arrival` and target departure/escape.
- Use Local for parking orbit, wait, descent, ascent, and surface dwell.
- Do not draw straight-line capture/departure connectors as if they are flight
  paths.
- The beginner status strip should say things like:
  - "Approaching Mars inside its SOI."
  - "Capture burn: slowing down into parking orbit."
  - "Waiting in Mars parking orbit for the return window."
  - "Leaving Mars SOI for the return transfer."
  - "Earth-arrival marker: this version stops at return geometry."

## Test Requirements

All 29 orbital gating tests must still pass, or be intentionally updated with
new coverage for the new segment contract.

Add mission-planner tests for:

- Mars/Venus orbit-return include nonzero `target_arrival` and
  `target_departure` segments.
- Mars/Venus touch-return include the same finite arrival/departure segments,
  with descent/ascent still present.
- Moon orbit-return/touch-return include finite Moon arrival/departure display
  segments where physically meaningful.
- Capture/departure delta-v totals do not change because the new segments are
  visualization/coast segments, not extra burns.
- Segment endpoints are continuous in the active frame.
- Return arcs still terminate as honest Earth-arrival markers, with residual
  gap/fallback labels preserved.

Run browser verification for:

- Mars/Venus/Moon orbit-return at `500,000x`, `1,000,000x`, and `10,000,000x`.
- Mars/Venus/Moon touch-return at the same speeds.
- Arrival into target SOI visibly approaches before orbit insertion.
- Departure visibly leaves target SOI before the long return coast.
- Final Earth-arrival marker is understandable and does not look like a hidden
  burn, steering command, or broken stop.

## Copy-Ready New Chat Prompts

Use the **Codex prompt** when you want the next agent to implement after you
approve its proposed segment/test contract.

Use the **Claude Code prompt** when you want a second engineering opinion before
implementation. It asks Claude Code to review the plan and produce a concrete
implementation strategy, not to edit files immediately.

### Codex Implementation Prompt

```text
Working in /Users/hwalee/Desktop/physics-lab.

Read AGENTS.md, ROADMAP.md, V3_SPEC.md, and
docs/solar-v3-1-capture-return-plan.md in that order.

Goal: implement Solar V3.1 capture/return continuity. Manual testing found that
Mars/Venus orbit-return and touch-return jump from target SOI arrival directly
into parking orbit, then later jump from target departure directly into the
return coast. This is because orbital.js currently models capture/departure as
zero-duration handoffs. Fix the planner and UI so the spacecraft visibly
approaches inside target SOI, inserts into parking orbit, leaves target SOI, and
then returns toward Earth.

Constraints:
- Do not touch rocket.html, friction.html, or unrelated sims.
- Keep the app static/Express-only. No React, bundlers, TypeScript, or build step.
- Preserve propulsive delta-v accounting. New arrival/departure visualization
  segments must have deltaV = 0; capture/departure burns keep the existing
  delta-v values.
- Keep Earth arrival as a marker only. Do not add fake reentry, aerocapture, or
  Earth landing.
- Keep residual gap and flyby fallback labels honest.
- Do not fake the problem in solar.html by drawing a decorative approach path
  that is not backed by MissionPlan segment data.

Implementation direction:
1. In public/shared/orbital.js, add finite target-centric arrival and departure
   coast/display segments for Mars/Venus orbit-return and touch-return.
2. Add equivalent Moon arrival/departure display segments where physically
   meaningful for orbit-return and touch-return.
3. Keep capture / LOI capture and departure / TEI departure as instantaneous
   burn markers with existing delta-v totals.
4. Update MissionPlan events so SOI crossing, capture burn, parking orbit,
   departure burn, SOI exit, and Earth-arrival marker are readable.
5. Update public/astro/solar.html so System/SOI/Local auto-view behavior uses
   the new segment types:
   - System for long heliocentric/translunar coasts and final return geometry.
   - SOI for target arrival/departure traversal.
   - Local for parking orbit, wait, descent, ascent, and surface dwell.
6. Update tests. All 29 gating tests across both orbital pages must pass, with
   new tests added or existing tests intentionally updated for the new segment
   contract.

Verification:
- Run the two orbital browser test pages and confirm 16/16 + 13/13, or updated
  expected totals if new tests are added.
- Headless browser check /astro/solar.html for Mars/Venus/Moon orbit-return and
  touch-return at 500,000x, 1,000,000x, and 10,000,000x.
- Confirm Mars arrival no longer jumps straight from SOI crossing into parking
  orbit.
- Confirm Mars departure visibly leaves SOI before the return coast.
- Confirm final Earth-arrival marker is labeled as a marker, not a modeled
  Earth capture or landing.

Before coding, propose the exact segment contract and test changes. Wait for
approval before implementing.
```

### Claude Code Review Prompt

```text
Working in /Users/hwalee/Desktop/physics-lab.

Read AGENTS.md, ROADMAP.md, V3_SPEC.md, and
docs/solar-v3-1-capture-return-plan.md in that order.

I need your engineering review before implementation.

Problem:
Manual testing found that Mars/Venus orbit-return and touch-return visually jump
from target SOI arrival directly into parking orbit, then later jump from target
departure directly into the return coast. The likely root cause is that
orbital.js currently models capture/departure as zero-duration handoffs:

heliocentric_outbound -> capture(duration 0) -> target_orbit
target_wait -> departure(duration 0) -> heliocentric_return

That makes the UI look broken at high speed. I do not want a fake decorative
path in solar.html. I want a physically honest planner/UI fix.

Please review and propose:
1. Whether the V3.1 plan in docs/solar-v3-1-capture-return-plan.md is the right
   fix direction.
2. The exact MissionPlan segment contract you recommend:
   - new segment names,
   - frames,
   - start/end states,
   - durations,
   - deltaV handling,
   - points sampling,
   - event labels.
3. Whether Mars/Venus and Moon should use the same segment pattern or separate
   patterns.
4. How to avoid changing propulsive totalDeltaV while adding finite visual
   arrival/departure coast segments.
5. What orbital.js tests should be added/updated.
6. What solar.html UI changes are required after the planner exposes the new
   segments.
7. Any risk that this accidentally turns V3 from a patched-conic teaching sim
   into a fake precision mission simulator.

Constraints:
- Do not modify files yet. This is a design review only.
- Do not touch rocket.html, friction.html, or unrelated sims.
- Keep Earth arrival as a marker only; no fake reentry, aerocapture, or landing.
- Keep residual gap and flyby fallback labels honest.
- Preserve the static Express app shape. No React, bundlers, TypeScript, or
  build step.

Return a concise implementation recommendation with any pushback. If you think
the plan is wrong, say exactly what should change and why.
```
