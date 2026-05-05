# Solar UI Lessons

This note captures post-ship UX decisions from the V3 Solar System Mission Simulator. Keep this focused on durable interface behavior and visual honesty. Do not create a new Markdown file for each Solar tweak, and do not turn `ROADMAP.md` into a long bug log.

## Purpose

`public/astro/solar.html` is not a flight game. It is a readable patched-conic mission viewer: choose a destination and profile, compute the route once, then watch the white spacecraft marker move through the mission stages.

The UI should answer three beginner questions without requiring orbital mechanics background:

- Where is the spacecraft now?
- Which stage of the mission is this?
- Is this path a real maneuver, a simplified transfer, or an honest model artifact?

## Control Decisions

- **Plan and launch:** recomputes the mission and restarts playback from `0 d`.
- **Back event / Next event:** jumps between MissionPlan event times. These controls should change mission time, not silently reset the user's speed selection.
- **Pause / Resume:** pauses the current playback state. At `READY` or `DONE`, Pause is disabled instead of pretending there is something to resume.
- **Reset icon:** rewinds the loaded plan to `0 d`, sets status to `READY`, resets canvas zoom/pan, and preserves selected destination, mission type, and dwell speed.
- **Dwell speed:** time acceleration, not engine throttle. Keep enough stops for manual inspection. Current useful stops include `300,000x` and `500,000x` between `100,000x` and `1,000,000x`.

## View Decisions

- **System view:** default view for heliocentric/translunar coasts and final return geometry. It is the clearest view for long interplanetary motion.
- **SOI view:** brief automatic handoff around SOI/capture/departure events, plus manual inspection on demand. Do not leave high-speed cruise in SOI for long stretches; that made Mars/Venus encounters feel like sudden jumps into an unreadable close-up.
- **Local view:** automatic for target parking orbit, target wait, descent, ascent, and surface dwell.
- **Instantaneous handoffs:** SOI crossing and capture/departure can share the same mission timestamp. The UI may hold the handoff visually for readability, but should not invent mission duration or alter the MissionPlan.
- **End-state labels:** at `DONE`, the side panel should show an end marker such as `EARTH ARRIVAL MARKER` or `LOOSE RETURN MARKER`, not the last coast segment. Playback speed should read as stopped.
- **Local view fit:** the default Local fit should be close enough that the target body and parking-orbit marker are readable. `Fit` returns to the per-view default, not a mathematical `1x`.
- **Canvas zoom:** `+`, `-`, and `Fit` change magnification; drag-to-pan changes focus location. This is separate from System/SOI/Local frame selection.

## Timeline Semantics

Timeline chips need to communicate state, not just list events.

- A `0 d` launch/TLI burn is a real event, but it is already complete almost immediately after playback begins.
- At mission start or after Reset, the `0 d` event should read as the current start event.
- After playback advances, the `0 d` event should read as completed/past, while the next future event is highlighted.
- Events with the same displayed day can still be separate instantaneous mission events. Do not invent phantom durations just to make them look separated.
- If several same-time events are crossed in one animation frame, hold the most user-relevant handoff label instead of flashing through each internal label.

## Visual Honesty

- **No fake closure:** flybys do not naturally close on Earth. Orbit-return and touch-return may still show residual integration drift. Label both honestly.
- **Residual gap:** draw as a dotted marker and label it as drift artifact, not a maneuver.
- **Fallback flyby markers:** if `returnPropagationNote` exists, label the fallback and avoid drawing it as if it were the physical deflected path.
- **Long path jumps:** if projected points create a large visual connector across the canvas, break the path. A straight connector can imply a burn or steering command that does not exist.
- **Display scale:** planet disks are enlarged so users can see them. Do not keep a true-scale toggle if it only produces a blank-looking canvas; explain the enlargement ratio instead.
- **Parking orbit:** render target parking/wait/orbit segments analytically as one clean circular orbit. Do not draw aliased stored polylines for these local phases.
- **Do not fake missing planner segments:** if the MissionPlan has zero-duration capture/departure handoffs, the UI can label and pace them but should not invent decorative approach paths. The V3.1 follow-up plan for fixing this correctly lives in `docs/solar-v3-1-capture-return-plan.md`.

## Explanation Pattern

The status strip under the canvas should use stable, simple stage language:

- outbound coast
- capture burn
- parking orbit
- return-window wait
- return departure
- return coast
- flyby
- Earth-arrival marker

Avoid rapid text churn around every small internal event. The right side can show technical labels; the status strip should teach what the user is watching.

When a view auto-switches, the status strip must agree with the view. For example, during the brief SOI approach, do not say System view is clearest; explain that the sim is auto-fitting the target and spacecraft for the upcoming handoff.

## Verification Pattern

For solar UI changes, verify:

- all 29 orbital gating tests still pass (`16 / 16` and `13 / 13`);
- Mars, Venus, and Moon orbit-return still animate at `1,000,000x` and `10,000,000x`;
- playback uses a brief SOI handoff near arrival/departure and does not stay in SOI during long cruise;
- live Mars orbit-return playback starts in System, briefly switches to SOI near arrival, then settles into Local after capture;
- Next event at a SOI/capture event shows the handoff label and throttled speed before resuming;
- Pause freezes elapsed time;
- Reset returns to `0 d`, `READY`, `SYSTEM`, and the first timeline chip marked current;
- canvas zoom and drag-to-pan work without horizontal page overflow.

## Applying This To Other Sims

Use these lessons when improving `public/astro/rocket.html` or other future sims:

- Prefer one clear beginner-facing status line over many fast-changing technical labels.
- Make reset semantics explicit and complete.
- Do not add a toggle if the "accurate" mode looks broken without strong explanation.
- Make timeline/history controls show current, past, and next state clearly.
- Keep visual artifacts labeled as artifacts instead of smoothing them into fake physics.
