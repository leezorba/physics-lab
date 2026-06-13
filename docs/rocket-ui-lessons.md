# Rocket UI Lessons

This note captures post-publish UX decisions from `public/astro/rocket.html`. Keep this focused on durable interface behavior. Do not turn this file into a per-fix changelog.

Cross-sim conventions (sticky back link, `.fill-columns` helper, numbered footer headers, "How to Use" intro section) live in `AGENTS.md`. Solar-specific lessons live in `docs/solar-ui-lessons.md`. Friction-specific lessons live in `docs/friction-ui-lessons.md`.

## Purpose

Rocket Ascent is a 1D vertical-launch sandbox across five worlds (Earth, Mars, Venus, Moon, Titan). The user picks a planet, tweaks engine + mass + drag, hits Launch, and watches dynamic pressure peak as the rocket climbs.

The UI should answer three beginner questions without requiring rocketry background:

- What is the headline number, and why does it matter? (Q and Max-Q)
- How does this world differ from Earth? (planet selector flips gravity + atmosphere)
- Where did the worst aerodynamic stress happen, and when? (chart + Max-Q peak tile)

## Telemetry Decisions

- **`MAX-Q (PEAK)` is the headline tile.** Records the highest dynamic pressure reached during the current run AND the altitude where it happened. Persists after burnout so the user can read it instead of catching it mid-flight. Same pattern that Friction's Sliding/Inclined `Peak v` tiles inherited later.
- **Max-Q needs a visible event cue.** In dark mode, the small inline tag was too easy to miss. The current event cue has three parts: the live Q value gets a short glow, the `MAX-Q` pill uses the amber theme token for contrast, and the canvas draws a labeled pulse around the rocket for ~1.8 s. Keep this as event feedback, not a permanent warning state.
- **`Q` (live dynamic pressure) drives the lesson.** This is the central physics — `½ρv²`. Every other readout supports it.
- **Status text is direct, not technical:** `STANDBY`, `ASCENT`, `COASTING`, `MAX-Q`. Plain language so first-time users orient quickly.
- **Constant thrust is honest about its tradeoff.** The footer explicitly notes that real rockets throttle down at Max-Q (BE-3 to ~18%), and this sim runs constant thrust until burnout — which makes Max-Q artificially severe. Do not add throttling to fix the number; the artificially severe Max-Q is the visceral lesson.

## Canvas Immersion

The ascent canvas is the focal point of the page, but a flat sky-gradient + ground rect reads as a chart, not a scene. Procedural scene layers add character without going skeuomorphic — no images, no decorative textures, everything in vanilla canvas paths.

- **Per-planet horizon silhouette.** Each planet has a `shadowColor` (~50% darker than `surfaceColor`) and a procedural ridge polyline drawn in `drawHorizon`. Heights span 18–58 px so the silhouette reads at full canvas size. The ridge is stroked in `p.accent` at 35% alpha so the top edge stays defined against the sky gradient. Per-planet shape carries the world's character: Earth rolling hills with a launch-pad notch under the rocket, Mars flat-topped mesas, Venus sawtooth volcanic peaks, Moon hard-edged crater rims (no atmosphere = sharp horizon), Titan soft dunes with a methane-lake band.

- **Altitude-keyed stars.** A 90-star field at fixed seeded normalized positions, with alpha keyed to the remaining atmospheric column above the rocket: `alpha = clamp(0, 1, 1 − (rho0·H·exp(-h/H)) / 5000)`. Airless bodies (`rho0 < 1e-3`) clamp to alpha 0.85 always. The model is physics-motivated (atmospheric extinction): stars hidden at Earth ground, fade in by ~25 km, fully visible above 50 km; Mars stars dimly visible from ground (matches reality); Venus hidden until ~95 km; Moon always visible. The /5000 threshold is tuned across all five planets — don't change it without re-checking each.

- **Dynamic-pressure streaks.** Short downward-flowing vertical strokes near the rocket when `sim.q > 200 Pa`. Density and length scale with Q (saturates at 8 kPa). Stateless particle phase from `performance.now()`. Visualizes the Max-Q concept the sim is built around. Threshold is intentionally above standby noise so streaks only appear during meaningful atmospheric flight.

- **Open pressure-envelope arcs.** The old full Q halo read like a mysterious shield. The current arcs are intentionally open and dashed so they read as airflow/aerodynamic load. They appear only when Q is meaningful, and the footer explains that they are a visual cue, not a physical force field.

- **Modern rocket silhouette.** The rocket is a larger procedural capsule/booster shape with fins, engine bell, accent band, twin windows, deterministic plume pulse, and open pressure-envelope arcs. It remains schematic — not a brand-specific replica — but reads more like a modern suborbital vehicle than the old rectangle/nose sprite. Vehicle colors come from `--canvas-rocket-body`, `--canvas-rocket-shade`, and `--canvas-rocket-engine` in both theme blocks. The plume uses theme tokens and `performance.now()`; do not reintroduce `Math.random()` flame flicker.

- **Launch pad + surface detail.** Every planet now gets a low-profile pad, flame trench, landing-target ring, and per-planet ground detail. Earth gets subtle pad-ground contour lines; Mars gets strata and rocks; Venus gets cracked volcanic plates; Moon gets crater ellipses; Titan gets dune lines and a methane-lake strip. Low-altitude exhaust deflects across the pad if the engine is burning. This is visual only — not a reusable-booster guidance model.

Guardrail for future agents: keep canvas immersion procedural and physics-motivated. Cloud layers, weather, day/night cycles, full launch-tower silhouettes, and similar decorative elements were considered and rejected — they push past the schematic look the rest of the lab maintains. A low-profile pad is allowed because rockets visibly launch from and land on pads, and it anchors the 1D ascent without adding a tower scene.

## Thrust-to-Weight + Apogee (post-publish polish pass)

Two telemetry readouts and two canvas markers were added. No physics equation changed — both are derived from existing sim state, recorded here so the additions are documented.

- **`THRUST-TO-WEIGHT` tile.** Live ratio `T / (m·g(h))` while the engine burns; at standby it shows the *liftoff* ratio `T / ((m_dry + m_fuel) · g₀)` so the user can see before launching whether the current build will even leave the pad. The value turns red below 1.0. After fuel-out it reads `COAST`. This is the "why won't it launch" number — a constant-thrust rocket with TWR < 1 never moves, and seeing it pre-launch turns a confusing dead pad into an obvious diagnosis.
- **`APOGEE (PEAK)` tile.** Highest altitude reached this run, tracked as `max(apogee, h)` each step. Follows the lab-wide peak-value tile convention (like `MAX-Q (PEAK)`): it persists after burnout so the user can read the answer instead of catching the turnover mid-flight. Reset by `resetSim`.
- **Canvas altitude markers.** `altMarker()` draws a faint dashed horizontal line at the Max-Q altitude (amber, once Max-Q is meaningful) and at apogee (cyan, once the rocket starts descending — `apogeeMarked` is set the first frame `v` crosses from positive to non-positive). Both labels clear the top-left gravity panel when near the top of the canvas. These pin the headline numbers to a height in the scene, the same way the TARGET (Kármán) line already does.

## Sim-Pane Layout

Sim controls (Launch / Pause / Reset) sit inside `.sim-pane` directly below the canvas, not inside the `.controls` block at the bottom of the page. Burying flight controls below the sliders forced the user to scroll to launch and to reset, which broke the launch-watch-iterate loop.

DOM order inside `.sim-pane`:

1. `.pane-label` — `↥ ASCENT VIEW · <planet>`
2. `.sim-canvas-wrap` — `position: relative` wrapper containing the focus toggle and the canvas
3. `.sim-controls` — three-button grid: Launch (`1fr`), Pause (`auto`), Reset (`auto`), 12 px gap

Two layout details that look small but matter:

- **Focus toggle is anchored to `.sim-canvas-wrap`, not `.sim-pane`.** When it was anchored to `.sim-pane`, the button visually floated above the canvas because `.pane-label` sits between the pane top and the canvas top. Wrapping the canvas in a positioned container gives the toggle a tight anchor at the canvas's top-right corner.

- **TARGET label x-position must clear the status panel.** The on-canvas gravity/density/scale-height panel occupies the top-left ~200×80 region. For short-target planets like Earth (Kármán at 100 km), the TARGET dashed line and label sit near the top of the canvas. The label x is set to `paneX + paneW + 12` (computed from the panel's hoisted dimensions) so it always clears, regardless of canvas width or planet target altitude.

Sim-controls buttons are bumped from the lab default: 56 px min-height, 1 rem padding/font, 0.04 em letter-spacing. Disabled state at 45% opacity. Spacebar toggles pause from anywhere on the page (skipped while typing in form fields), per AGENTS.md → Pause/Resume pattern. On resume, `lastFrame = performance.now()` and `accumulator = 0` so the next physics step's `dt` is one frame's worth, not the entire paused duration.

## Default Settings — Tuned to Clear Kármán

Factory defaults (`thrust: 700 kN`, `fuel: 15,000 kg`, `dry: 20,000 kg`, `Cd: 0.5`, `A: 10.8 m²`, `Isp: 350 s`) are tuned so that on Earth, with no slider changes, the rocket peaks just above the 100 km Kármán line. Liftoff TWR is 1.99, burn time ~73 s, and effective Δv after gravity loss is ~1250 m/s.

Earlier defaults (`thrust: 490 kN`, `fuel: 14,000 kg`) gave TWR 1.47 and peaked at ~80 km — deliberately marginal, so the user had to tune sliders to clear Kármán on Earth. We changed to "barely clears" because:

- "Default settings fail" is honest pedagogy, but a rough first impression for someone landing on the page.
- 700 kN is not unrealistic — BE-3 sea-level thrust is ~490 kN and vacuum is ~710 kN, so 700 approximates the average effective thrust over an ascent as ambient pressure drops. The footer narrative under section 05 (Glossary & Formulas → ROCKET defaults) was updated to explain this.
- Mars and Moon still coast trivially under defaults; Venus still fails at extreme Max-Q. Per-planet differentiation (the core lesson) is preserved.

If a future agent sees the marginal-Kármán behavior on Earth and wants to "fix" it in either direction, this is the durable record that the current value is intentional. AGENTS.md → Physics Rules ("do not change physics, equations, or educational content silently") applies to defaults too.

## Footer Structure

Reorganized to match the lab-wide convention: card-grid intro first, then conceptual flow, then reference, then honesty, then prompts.

| # | Section | Position rationale |
|---|---|---|
| 01 | How to Use This Sandbox (cards) | Beginner onboarding — pick planet, tweak sliders, launch, watch Q peak |
| 02 | Dynamic Pressure Drives Drag | Headline concept |
| 03 | Max-Q: Peak Aerodynamic Stress | The dramatic moment of that concept |
| 04 | A Tour of Five Worlds | Concept applied per destination |
| 05 | Glossary & Formulas | Reference material — moved DOWN from its old #2 slot so users hit physics narrative before the deep glossary |
| 06 | What This Sandbox Does NOT Capture | Honest limitations |
| 07 | Things to Try | Prompts |

The old `01 How to Read the Display` section was deleted — its content (Q and Max-Q meaning) is now covered by the new card #4 (Telemetry tiles) and card #6 (Why Q and Max-Q matter), plus the `02 Dynamic Pressure` and `03 Max-Q` deep-dive sections.

## `.fill-columns` Layout

Five rocket footer sections use the `.fill-columns` helper (defined in this page's inline CSS, with the same shape as friction's):

- `02 Dynamic Pressure Drives Drag` — 3 paragraphs
- `03 Max-Q: Peak Aerodynamic Stress` — 3 paragraphs
- `04 A Tour of Five Worlds` — 5 planet-cards (split 3 left / 2 right)
- `06 What This Sandbox Does NOT Capture` — 6 caveat-list items (uses `.caveat-list` directly with the same column rule)
- `07 Things to Try` — 4 prompts

The helper uses `columns: 320px 2; column-gap: 32px` so on full-screen each column is ~640 px (line length stays in the comfortable 70-75 character zone) and on narrow viewports it collapses to one column with no media query.

`.planet-card` items inside `.fill-columns` get `break-inside: avoid` so cards don't split across the column boundary.

## Numbered Footer Header Override

Rocket is the only sim that wraps its footer in an actual `<footer>` element instead of `<section class="footer-grid">`. That triggers the shared `footer h2 .num` rule from `lab.css`, which renders the number tiny and accent-colored. To match friction and solar (where the number is heading-sized and white, sitting beside the title), rocket has a per-page override:

```css
.rocket-page footer h2 .num {
  margin-right: 10px;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
}
```

The `<footer>` wrapper is kept (not converted to `<section class="footer-grid">`) because the shared `footer h3` rule provides accent styling for the four `<h3>` headings inside the Glossary section (Variables / Core equations / Numerical integration / Key constants used). Switching to `<section>` would silently remove that styling.

## Verification Pattern

For rocket UI changes, verify:

- the planet selector flips gravity and atmosphere model on click;
- launch starts the climb; `T+` ticks; altitude, velocity, acceleration, Q, drag, fuel update live;
- `MAX-Q (PEAK)` records the highest Q + altitude and persists after fuel-out;
- Max-Q event cue is visible in dark mode: live Q value glows, the `MAX-Q` pill is high-contrast, and a short labeled canvas pulse appears around the rocket;
- the two charts (Altitude vs Time, Q vs Time) draw and update;
- on Earth, default settings clear the 100 km Kármán target with ~10 km margin (peak ~110 km); Max-Q hits ~10–15 km altitude;
- on Moon, Q stays at zero for the whole flight;
- on Venus with default settings, Max-Q is dramatically higher than Earth;
- reset returns altitude to 0 and clears charts; planet selection persists;
- TARGET label sits to the right of the gravity status panel and is fully readable on every planet;
- each planet shows a distinct horizon silhouette (Earth hills + pad, Mars mesas, Venus peaks, Moon craters, Titan dunes) with a faint accent ridge line;
- stars fade in with altitude on atmospheric planets and are always visible on Moon;
- Q-streaks appear near the rocket during atmospheric flight and disappear at zero atmosphere or before launch;
- rocket renders as the modern tapered capsule/booster silhouette in both themes; plume animation is smooth/deterministic, not random frame flicker; open pressure-envelope arcs appear only during meaningful aerodynamic loading;
- every planet shows the pad plus distinct ground detail; low-altitude exhaust deflects across the pad only while the engine is burning;
- the focus toggle anchors to the canvas's top-right corner, not floating above the canvas;
- Launch / Pause / Reset sit in a row directly below the canvas, no longer below the sliders, and are visually larger than the lab default buttons;
- Pause button enables on launch and disables in standby/grounded/landed states; Spacebar toggles pause except while typing in form fields; on resume, `dt` does not jump to the entire paused duration;
- footer renders with all 7 numbered headers at heading-size + matching style;
- five footer sections use 2-column layout on full-screen and collapse to 1 column on narrow viewports;
- theme toggle dark ↔ light redraws the rocket canvas correctly.
