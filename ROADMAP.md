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

- **Astrophysics** — Rocket Ascent Simulator now; Solar System Mission Simulator later.
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
- **Site credits footer:** `Built by Hwa Lee · GitHub` (placeholder href) on every page.
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

## V3: Solar System Mission Simulator (STAGE 3B SHIPPED — see V3_SPEC.md)

**Status:** Stage 3a is shipped, reviewed, and patched. Stage 3b is shipped, reviewed, and closure-gap-fixed. Stage 3c is not built.

**Detailed spec lives in [`V3_SPEC.md`](V3_SPEC.md)** at the repo root. That file is the source of truth for V3 — destinations, mission types, physics framework, reference numbers, staged build plan with per-stage tests, and the resolved conventions (initial geometry, return-phase matching, closed-orbit and hyperbolic-segment dt, default time acceleration, flyby periapsis, units, etc.).

**Build plan summary** (full detail in V3_SPEC.md → "Staged build plan"):
- **Stage 3a — SHIPPED / REVIEWED / PATCHED** — `public/shared/orbital.js` + `orbital.test.html`. Pure math: propagate, closedOrbitDt, hohmannTransfer, sphereOfInfluence, visViva, escapeBurn, transformFrame, hohmannPhaseAngle, returnWaitTime, plus a `CONSTANTS` table. Original gating tests pass, and the review patch adds high-eccentricity dt coverage, angular momentum, propagation-based Kepler's 3rd law, isolated escapeBurn checks, stronger frame-transform checks, and validation guards. CC touch-up pass applied: Moon dt-policy test now uses anchor expectations instead of duplicating the formula; escapeBurn tests use the locked hyperbolic-escape formula rather than bound lunar-TLI shorthand.
- **Stage 3b — SHIPPED / REVIEWED / CLOSURE-GAP-FIXED** — `planMission(originBody, targetBody, missionType, options) → MissionPlan` in `orbital.js`. Six mission patterns (Mars/Venus/Moon × flyby/orbit-return/touch-return). Still no UI. Review fixes include propagated interplanetary/translunar return arcs, honest residual Earth-arrival gap markers, Venus orbit-return coverage, and the Earth-arrival speed marker convention.
- **Stage 3c — NEXT APPROVAL GATE** — `public/astro/solar.html`. Adaptive zoom, time acceleration, mission timeline, Δv readout, true-scale toggle, footer. Visual style matches lab.css.

Each stage gets reviewed before the next starts — same process that worked for V1 and V2.

**Why physics-first:** two-body orbits, patched conics, Hohmann transfers, scale ratios spanning 6 orders of magnitude. A one-shot Codex prompt will produce something that *looks* right and is subtly wrong. The physics module is built and tested in isolation so UI bugs can't hide physics bugs.

**Next gate:** Stage 3c can start only after explicit approval. Stage 3b is built, tested, reviewed, and closure-gap-fixed.

### Decisions logged

- Keep V1 Rocket Ascent and V3 Solar System as separate sims; do not merge them.
- Reason: V1 produces no orbital state V3 can consume — no horizontal velocity, gravity turn, or orbital insertion.
- Merging would either fake the handoff or require rewriting V1, weakening its focused atmospheric / Max-Q lesson.
- Future option: V4 "Mission Story Mode" can stitch V1 + V3 conceptually with a step-through narrative and combined Δv budget card, after V3 ships and feedback warrants it.
- Stage 3b labels strict-return residual drift instead of correcting it. Iterative targeting would require a shooting solve on return wait/departure timing, which is its own Stage 3b.5/3c engineering project and should not be bolted onto the mission planner patch.
- Post-publish investigation: Mars-flyby `arrivalGeocentricSpeed` can describe a fallback loose-return marker when `returnPropagationNote` exists, not a point the deflected flyby physically reaches. Consider suppressing that marker when fallback reporting is active.

---

## Build order

1. **V2 friction-lab** — done.
2. **V2.5 physics-lab migration** — done.
3. **V2.6 design + branding pass** — done.
4. **Publish + get friend's reaction.** The lab is now in publishable shape (brand, theme, focus mode, favicon, footer credits all in place). Ship it, then let feedback shape what's next: more depth on stick-slip, more worlds for the rocket sim, more PDF sections, or a new shelf entirely.
5. **Replace the GitHub footer placeholder** with the real repo URL once it exists. The href in the site-credits footer is currently `#`.
6. **V3 solar-system** — Stage 3a is shipped, reviewed, and patched. Stage 3b is shipped, reviewed, and closure-gap-fixed. Start Stage 3c only with explicit approval.

---

## What to give Codex / any agent right now

V2.5 and V2.6 are shipped, V3 Stage 3a is shipped/reviewed/patched, and V3 Stage 3b is shipped/reviewed/closure-gap-fixed. The next move is either publishing/gathering feedback or explicitly starting Stage 3c. If an agent needs to touch the repo outside that approval, the safe scopes are:

- Swap the footer GitHub placeholder once the URL is known.
- Bug fixes flagged by the friend after publish.
- Small additions to existing sims (a new planet for rocket, a fourth tab for friction) — but only if they fit the existing patterns documented in AGENTS.md.

Bigger work — a new shelf, a new sim, or Stage 3c — should still come back through this roadmap before any code is written.
