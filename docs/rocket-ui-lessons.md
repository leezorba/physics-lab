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
- **`Q` (live dynamic pressure) drives the lesson.** This is the central physics — `½ρv²`. Every other readout supports it.
- **Status text is direct, not technical:** `STANDBY`, `ASCENT`, `COASTING`, `MAX-Q`. Plain language so first-time users orient quickly.
- **Constant thrust is honest about its tradeoff.** The footer explicitly notes that real rockets throttle down at Max-Q (BE-3 to ~18%), and this sim runs constant thrust until burnout — which makes Max-Q artificially severe. Do not add throttling to fix the number; the artificially severe Max-Q is the visceral lesson.

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
- the two charts (Altitude vs Time, Q vs Time) draw and update;
- on Earth, Max-Q hits ~10–15 km altitude with default settings;
- on Moon, Q stays at zero for the whole flight;
- on Venus with default settings, Max-Q is dramatically higher than Earth;
- reset returns altitude to 0 and clears charts; planet selection persists;
- footer renders with all 7 numbered headers at heading-size + matching style;
- five footer sections use 2-column layout on full-screen and collapse to 1 column on narrow viewports;
- theme toggle dark ↔ light redraws the rocket canvas correctly.
