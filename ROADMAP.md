# Three-Project Roadmap: Rocket → Friction → Solar System

Goal: build connected web apps that explore physics relevant to space exploration and off-world engineering. V1 and V2 started as separate Railway-deployed projects; V2.5 migrates them into one shared physics-lab service. Build sequentially — do not start v3 until the shared lab shell is ready.

---

## V1: Rocket Ascent Simulator — DONE

**Status:** complete, reviewed by 2 outside LLMs, ready for Railway deploy.
**Repo:** `rocket-sim/`
**What it does:** 1D vertical rocket ascent across Earth, Mars, Venus, Moon, Titan. Shows dynamic pressure, drag, Max-Q.

No further work unless feedback comes from the friend.

---

## V2: Friction Lab — DONE

**Status:** complete. Built as `friction-lab/`, reviewed, bug-fixed, and verified locally on port 3000.

**What shipped:** a single-page friction simulator with three tabs:

1. **Sliding Block** — applied force pushes a block on a horizontal surface. Static friction holds until the applied force exceeds `μ_s · F_n`, then kinetic friction applies while the block slides.
2. **Inclined Plane** — angle slider tilts a ramp. The block slips when the downslope gravity component exceeds max static friction, equivalent to `tan(θ) > μ_s`.
3. **Stick-Slip** — spring-driven block alternates between sticking and slipping, with a velocity chart showing the sawtooth behavior.

### Cross-cutting features built

- **Gravity selector** for Earth, Moon, Mars, and custom gravity. All tabs recompute normal force from the selected gravity.
- **Stats panel** for pasted coefficient readings: mean, sample standard deviation with Bessel's correction, and `μ ± 2s` engineering scatter band.
- **Low-pressure stiction toggle** on the stick-slip tab. This remains qualitative only, not a Mars rover failure model.
- **Educational footer** with glossary, equations, off-world engineering caveats, and honest limitations.

### Tech built

- Single self-contained `public/index.html` with inline HTML, CSS, and vanilla JS.
- Express static server in `server.js`.
- `package.json` start script.
- Railway-ready, same deployment pattern as `rocket-sim`.

### Design pattern lessons learned

- **Active-tab-only physics:** only the visible tab updates each animation frame. Hidden tabs should not continue evolving in the background.
- **Reset means full state reset:** `resetActiveTab()` must reset sliders, positions, velocities, status text, and tab-specific chart/timer state.
- **Stable moving reference frame for stick-slip:** do not periodically modulo/reset `xDrive` and `xBlock`; that creates visual teleports. Render stick-slip in a stable moving reference frame so spring stretch remains visible without discontinuity.
- **Boundary clamp must also zero velocity:** when a block reaches a hard visual/physical boundary, clamp both position and velocity. Use explicit statuses such as `at wall` and `at base` so telemetry does not claim the block is still accelerating while parked.

---

## V2.5: Physics-Lab Migration — DONE

**Status:** complete. `rocket-sim` and `friction-lab` were copied into one Railway-ready `physics-lab` service with a shared science-lab homepage and shared visual system.

**Goal met:** merge `rocket-sim` and `friction-lab` into one Railway service instead of maintaining separate toy physics apps.

**Product metaphor:** a science-lab homepage with shelves or benches for different physics areas:

- **Astrophysics** — Rocket Ascent Simulator and Solar System Mission Simulator.
- **Mechanics** — Friction Lab now.
- **Future shelves** — Thermodynamics, electromagnetism, quantum, and other educational experiments.

### Scope

- Create one Railway-deployed service that routes to multiple labs.
- Add a homepage that feels like a science lab, not a marketing page.
- Keep each lab easy to open, compare, and expand.
- Share common visual tokens and layout utilities through a shared CSS file.
- Redesign away from the dark mission-control look toward a cleaner, more readable educational design.
- Preserve the lightweight deployment model: Express static server, no React, no bundler unless a future lab creates a real need.

### Design direction

- Cleaner typography, stronger contrast, more daylight/worksheet readability.
- Use science-lab metaphors sparingly: shelves, labeled instruments, benches, field notebooks.
- Keep the simulator itself first-class; do not bury the actual tool under a landing-page wrapper.
- Make the shared shell reusable before starting V3.

### Shipped structure

- `public/index.html` — Physics Lab homepage with Astrophysics and Mechanics shelves.
- `public/shared/lab.css` — shared design tokens, typography, cards, telemetry, controls, tabs, footer, and form styling.
- `public/astro/rocket.html` — migrated Cross-Planet Rocket Ascent simulator.
- `public/mech/friction.html` — migrated Friction Lab simulator.
- `server.js` — single Express static server for the full lab.

---

## V2.6: Design + Branding Pass — DONE

**Status:** complete. Cosmetic + UX overhaul on top of V2.5. No physics, no equations, no educational copy changed; one feature explicitly removed (see below).

**What shipped:**

- **Brand:** product is now "Hwa's Physics Lab." Every `<title>` and the homepage `<h1>` use this exact phrasing; sim pages title as `<Sim Name> · Hwa's Physics Lab`.
- **Theming:** dark default with a full light-mode override, driven by CSS custom properties on `:root` and `:root[data-theme="light"]`. Choice persists in `localStorage["physicsLabTheme"]`. Pre-paint init script prevents theme flash.
- **Theme toggle:** round button top-right of every page, swaps `◑` / `◐` icons. Dispatches a `themechange` event so sim canvases re-read theme tokens.
- **Canvas theming:** both sims read canvas-specific CSS tokens (`--canvas-bg`, `--canvas-grid`, `--canvas-text`, `--canvas-panel-bg`, etc.) via `getComputedStyle` and re-cache on `themechange`. No hardcoded hex/rgba in canvas drawing code.
- **Focus mode:** each sim page has a corner-bracket SVG button (Lucide-style) that toggles `body.sim-focus`, collapses the side panel, and gives the canvas the full row width. Canvases recompute on the dispatched `resize` event.
- **Inline SVG favicon:** 🪐 emoji rendered via inline SVG data URI. No separate file.
- **Site credits footer:** `Built by Hwa Lee · GitHub` on every page, linked to `https://github.com/leezorba/physics-lab`.
- **Casual / Educational mode removed:** the rocket sim no longer has a casual/edu toggle — all telemetry, sliders, and equations show unconditionally. `.edu-only` and `body.edu-mode` classes are gone.
- **Friction arrow refactor:** the `arrow()` helper now (a) skips near-zero arrows so labels never strand inside the block, (b) places labels past the arrowhead in the arrow's direction (left arrow → label left of tip, etc.), and (c) clamps sliding-block arrow lengths to canvas bounds so F and F_f never run off-screen.
- **Friction info pill:** on-canvas readouts (`static max`, `kinetic friction`, `slip angle`, etc.) now render inside a framed panel using `--canvas-panel-bg` / `--canvas-panel-border`, mirroring the rocket sim's existing gravity readout style.
- **Spacing rhythm:** container cap bumped to `min(1400px, calc(100% - 48px))`. Card padding standardized at 22px. Lobotomized-owl rule (`> * + *`) on `.control-band`, `.stats-card`, `.telemetry-card`, `.controls-card` adds 18px between header and body. Status pill padding bumped so labels like `AT WALL` / `STUCK` breathe.
- **Rocket chart legibility:** chart axis labels 9px → 11px, altitude tick labels 10px → 12px, status pane resized 160×56 → 200×80 with 11–12px fonts.
- **Accessibility:** `:focus-visible` outlines added to `.theme-toggle` and `.focus-toggle`.
- **Docs:** AGENTS.md gained three new sections — Theming, Page Chrome, CSS Conventions — plus a brand line and a focus-mode note. The "what to copy" reference for new sims now points to `public/mech/friction.html`.

**Convention takeaways for future sims:**

- Any new color must exist in **both** `:root` blocks (dark + light). Never leak raw `rgba(…)` into rules — use `color-mix(in srgb, var(--token) X%, transparent)`.
- New canvas drawings must read theme colors via `getComputedStyle` and re-cache on `themechange`. Don't call `getComputedStyle` per frame.
- Every new page needs the six chrome pieces listed in AGENTS.md → Page Chrome (favicon, theme init, theme toggle, theme handler, footer credits, focus toggle for sim pages).

---

## V3: Solar System Mission Simulator — DONE

**Status:** complete. Built into `physics-lab/` as `public/astro/solar.html`, with the shared orbital physics module in `public/shared/orbital.js`.

**What it does:** a 2D patched-conic mission simulator for Earth-to-Mars, Earth-to-Venus, and Earth-to-Moon missions. Users choose flyby, orbit-and-return, or touch-and-return profiles, then watch the precomputed mission animate with guided System/Local views, optional SOI inspection, time acceleration, mission timeline, Δv budget, display-scale explanation, and honest closure markers.

### What shipped

- **Stage 3a physics module:** `public/shared/orbital.js` + `public/shared/orbital.test.html`. Pure orbital math: propagation, Hohmann transfers, closed-orbit dt policy, SOI radius, vis-viva, escape burns, frame transforms, phase angles, return-window waits, closure angles, constants, and validation guards.
- **Stage 3b mission planner:** `planMission(originBody, targetBody, missionType, options) → MissionPlan`, with six mission patterns across Mars, Venus, and Moon. Review fixes include propagated return arcs, strict-return residual gap markers, Venus orbit-return coverage, and the Earth-arrival speed marker convention.
- **Stage 3c UI:** `public/astro/solar.html`, consuming the reviewed mission planner. The UI includes destination and mission selectors, Plan and launch, auto-throttled playback, System/SOI/Local view buttons, canvas zoom/pan controls, timeline, Back/Next event controls, Pause/Resume, Reset, Δv budget, display-scale note, theme/focus chrome, and a V1/V2-style footer.
- **Homepage integration:** the Astrophysics shelf now links to the Solar System Mission Simulator.
- **UX lessons docs:** `docs/solar-ui-lessons.md` captures Solar's post-ship UI decisions. Friction and Rocket each have their own per-sim lessons docs (`docs/friction-ui-lessons.md`, `docs/rocket-ui-lessons.md`); cross-sim conventions live in `AGENTS.md`.

### Verification

- Stage 3a browser harness: 16/16 passing.
- Stage 3b browser harness: 16/16 passing after the V3.1 finite SOI traversal follow-up.
- Stage 3c browser passes covered all Mars/Venus/Moon × flyby/orbit-return/touch-return combinations during initial ship, plus later regression checks for Mars/Venus/Moon orbit-return at 1,000,000× and 10,000,000×.
- Solar UI regression checks confirmed Pause freezes elapsed time, Reset returns to `0 d` / `READY`, high-speed playback uses only brief SOI handoffs instead of long SOI cruise, and timeline chips distinguish current/past/next events.
- Local route checks confirmed `/`, `/astro/solar.html`, `/astro/rocket.html`, `/mech/friction.html`, `/shared/lab.css`, and `/health`.

No further V3 work unless post-publish feedback or the logged follow-up investigation below warrants it.

### Decisions logged

- Keep V1 Rocket Ascent and V3 Solar System as separate sims; do not merge them.
- Reason: V1 produces no orbital state V3 can consume — no horizontal velocity, gravity turn, or orbital insertion.
- Merging would either fake the handoff or require rewriting V1, weakening its focused atmospheric / Max-Q lesson.
- Future option: V4 "Mission Story Mode" can stitch V1 + V3 conceptually with a step-through narrative and combined Δv budget card, after V3 ships and feedback warrants it.
- Stage 3b labels strict-return residual drift instead of correcting it. Iterative targeting would require a shooting solve on return wait/departure timing, which is its own Stage 3b.5/3c engineering project and should not be bolted onto the mission planner patch.
- Post-publish investigation: Mars-flyby `arrivalGeocentricSpeed` can describe a fallback loose-return marker when `returnPropagationNote` exists, not a point the deflected flyby physically reaches. Consider suppressing that marker when fallback reporting is active.
- Stage 3c uses SOI as a short arrival/departure handoff view, then returns to System or Local. Long auto-SOI playback made high-speed transfers harder to understand.
- Stage 3c replaced the true-scale toggle with a display-scale explanation. True scale was physically honest but looked like an empty/broken canvas for the intended educational UI.
- Stage 3c keeps Reset as a compact rewind-to-start control while Pause/Resume handles temporary stopping. Back/Next event controls remain timeline navigation, not speed resets.
- Stage 3c timeline chips mark `0 d` launch/TLI as the current start event at reset and as completed after playback begins.
- V3.1 follow-up: orbit-return and touch-return now include finite target/Moon SOI arrival and departure coast segments backed by MissionPlan data. The added segments have `deltaV = 0`; capture/departure burns keep the pre-V3.1 propulsive totals.
- Post-V3 polish pass aligned Friction and Rocket UX with the lab-wide conventions captured in `AGENTS.md` → Lab-Wide UI Conventions, with sim-specific decisions documented in `docs/friction-ui-lessons.md` and `docs/rocket-ui-lessons.md`.
- Pre-ship Rocket/Friction polish is complete: Rocket has stronger canvas immersion, visible Max-Q event feedback, launch-pad/ground cues, and documented visual limits; Friction Stick-Slip has a smooth fixed-coil spring and block-anchored force arrows. Durable details live in the per-sim lessons docs.
- Polish pass across all three sims (graphics, UI, transitions, physics resolution). Shared: theme crossfade (`.theme-transition`), focus/tab opacity dip (`.view-anim`), and a `prefers-reduced-motion` reset, all in `lab.css`. **Friction physics changed** (flagged, not silent): stick-slip now integrates in 4 substeps for a smooth sawtooth, the artificial re-stick heuristic and `slipTime` were removed in favor of the correct `|F_spring| ≤ staticMax` re-stick condition (valid because `μ_k ≤ μ_s` is enforced), and position is stored in named meter-scale constants (`SLIDE_TRACK_M`, `INCLINE_SCALE_M`) mathematically equal to the old magic numbers. Friction also gained on-canvas load-meter bars, a slip-angle guide ray + θ arc, a hatched wall, full theme-token canvas colors, and a build-once/update-values telemetry path (no more 60 fps `innerHTML` churn). Rocket gained live thrust-to-weight + apogee tiles and Max-Q/apogee altitude markers (derived from existing state, no equation change). Solar got graphics-only depth (shaded body spheres, Sun glow, spacecraft halo) with no change to mission timing, path geometry, or the planner. Verified: all routes 200, both orbital gating harnesses still 16/16 in headless Chrome, all three sims initialize cleanly. Durable details live in the per-sim lessons docs.

---

## Build order

1. **V2 friction-lab** — done.
2. **V2.5 physics-lab migration** — done.
3. **V2.6 design + branding pass** — done.
4. **V3 solar-system** — done.
5. **Publish + get friend's reaction.** The lab is now in publishable shape (brand, theme, focus mode, favicon, footer credits, Rocket, Friction, and Solar all in place, with the pre-ship Rocket/Friction polish folded in). Ship it, then let feedback shape what's next: more worlds, more PDF sections, deeper follow-up prompts, or a new shelf entirely.

---

## What to give Codex / any agent right now

V2.5, V2.6, and V3 are shipped. The next move is publishing/gathering feedback, or handling a clearly scoped post-publish fix. If an agent needs to touch the repo outside that feedback, the safe scopes are:

- Bug fixes flagged by the friend after publish.
- Solar / Friction / Rocket UI polish that follows `docs/solar-ui-lessons.md`, `docs/friction-ui-lessons.md`, or `docs/rocket-ui-lessons.md` respectively, plus the lab-wide rules in `AGENTS.md`.
- Follow-up fixes to V3.1 Solar capture/return continuity, if manual testing finds a remaining visual or contract issue.
- Small additions to existing sims (a new planet for rocket, a fourth tab for friction) — but only if they fit the existing patterns documented in AGENTS.md.

Bigger work — a new shelf, a new sim, or major V3 follow-up — should still come back through this roadmap before any code is written.
