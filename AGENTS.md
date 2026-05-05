# AGENTS.md - Physics Lab

Guidance for CC, Codex, Claude, or any other agent editing this project.

## Project Shape

- This is a multi-sim static web app served by Express.
- The product is branded **"Hwa's Physics Lab"** — every `<title>` and the homepage `<h1>` use this exact phrasing. Sim pages title as `<Sim Name> · Hwa's Physics Lab`.
- `public/index.html` is the science-lab homepage.
- Shared design rules live in `public/shared/lab.css`.
- Each simulator is still a self-contained HTML page; only CSS is shared via `/shared/lab.css`.
- Simulator JavaScript stays inline per sim. Do not move reviewed physics into shared code casually.
- Do not add React, bundlers, TypeScript, Vite, Next.js, or a build step.
- The only external frontend dependency should be Google Fonts.
- The backend is a small Express static server in `server.js`.
- The app should remain Railway-ready with `npm start`.

## Documentation Strategy

- Keep `README.md` high-level: what the app is, routes, local testing, and where to find deeper docs.
- Keep `ROADMAP.md` focused on shipped versions, durable decisions, and scoped next work. Do not turn it into a detailed bug diary.
- Use focused docs under `docs/` for lessons learned or UX patterns that should transfer to later sims. Current example: `docs/solar-ui-lessons.md`.
- Do not create one-off Markdown files for every UI patch. Fold durable lessons into the focused doc, and keep transient bug details in the commit/PR/chat context.
- If a shipped behavior changes the V3 contract, update `V3_SPEC.md` so future agents do not follow stale instructions.
- Update `tree.md` last, after files are added/removed or structure changes.

## Adding a New Sim

- Create `public/<shelf>/<sim>.html`.
- Link `/shared/lab.css`.
- Keep sim-specific JavaScript inline in that page.
- Keep only sim-specific layout CSS inline; reusable visual rules belong in `public/shared/lab.css`.
- Add a simulator card to the homepage shelf in `public/index.html`.
- Wire up the page chrome listed under **Page Chrome** below — favicon, theme init script, theme toggle button, theme click handler, focus toggle (sim pages only), and the site-credits footer. Copy the structure from an existing sim — `public/mech/friction.html` is the most complete reference.
- Any drawing the sim does on `<canvas>` must read its colors from the CSS theme tokens described under **Theming**, not hardcoded hex/rgba.

## Theming

The site supports a **dark default** and a **light override**, flipped via the `data-theme` attribute on `<html>`. The user's choice persists in `localStorage["physicsLabTheme"]`.

- All themeable values are CSS custom properties defined in two blocks at the top of `public/shared/lab.css`:
  - `:root { … }` holds the dark palette and is the default.
  - `:root[data-theme="light"] { … }` overrides the same names for light mode.
- Adding a new color or surface? You **must** add a token in **both** blocks. Don't leak raw hex / rgba values into other rules.
- Canvas drawings must follow the theme. The shared sheet exposes canvas-specific tokens for this — `--canvas-bg`, `--canvas-grid`, `--canvas-text`, `--canvas-text-dim`, `--canvas-panel-bg`, `--canvas-panel-border`, `--canvas-chart-bg`, `--canvas-ground-line`, `--canvas-ground-tint`, `--canvas-rule`. Read them in JS via `getComputedStyle(document.documentElement).getPropertyValue(name)`.
- Cache canvas colors at startup, then re-read on the `themechange` window event the toggle dispatches. The friction and rocket sims show the pattern (`readTheme()` + `window.addEventListener("themechange", …)`). Do not call `getComputedStyle` every frame.
- The pre-paint script (see **Page Chrome**) sets `data-theme` before first render so dark mode never flashes. Don't remove it.

## Page Chrome

Every page (homepage and sims) carries the same chrome. When adding a new page, copy these pieces verbatim from `public/mech/friction.html`.

- **Favicon** in `<head>`: an inline SVG data URI rendering the 🪐 emoji as text. No separate file, no extra request.
- **Theme init script** in `<head>`, before `</head>`: an IIFE that reads `localStorage["physicsLabTheme"]` and sets `document.documentElement.dataset.theme` (defaults to `"dark"`). Must run pre-paint to avoid a theme flash.
- **Theme toggle button** at the start of `<body>`: a `.theme-toggle` button with two `<span class="theme-icon">` children (`◑` for dark, `◐` for light). CSS hides the inactive icon based on `[data-theme]`.
- **Theme click handler** at the end of `<body>`: an IIFE that flips `dataset.theme`, persists to `localStorage`, and dispatches a `themechange` `CustomEvent` so sim canvases can re-read theme tokens.
- **Site credits footer** as the last element of `<body>`: `<footer class="site-credits">Built by Hwa Lee · <a href="https://github.com/leezorba/physics-lab" rel="noopener">GitHub</a></footer>`.
- **Focus mode toggle** (sim pages only): a `.focus-toggle` button anchored inside the sim canvas container — for friction it lives **inside** `.sim-hint` as a flex item; for rocket it's absolutely positioned in the corner of `.sim-pane`. The shared CSS rule `.sim-stage, .sim-pane { position: relative }` enables the absolute layout. The button's click handler toggles `body.sim-focus` and dispatches a `resize` event so canvases recompute. Two SVGs (`.focus-icon-expand` / `.focus-icon-collapse`, four-corner-bracket Lucide icons) swap visibility based on the body class.

## CSS Conventions

- **Tinted overlays** use `color-mix(in srgb, var(--token) X%, transparent)` instead of raw `rgba(…)` literals. This keeps tints theme-aware automatically. Search for existing examples in `lab.css` (the active button, status pill, hover borders).
- **Container width** caps at `min(1400px, calc(100% - 48px))`. Sim pages may override their inner `.shell` / `.container` to a different cap if they have a reason — but match that pattern, don't go wider.
- **Card spacing rhythm:** card padding is 22px, internal vertical gaps between header and body are 18px (handled by the lobotomized-owl rule on `.control-band`, `.stats-card`, `.telemetry-card`, `.controls-card`). Don't add ad-hoc margins inside these cards — let the rule do it.
- **Body line-height** is 1.6. Use 1.6 for narrative text. Headings have their own tighter line-heights set per element — leave them alone.
- **No casual/educational mode.** That toggle was removed; rocket.html now shows all telemetry, sliders, and equations unconditionally. Don't reintroduce `.edu-only` / `body.edu-mode` classes.

## Physics Rules

- Only the active tab updates each animation frame. Hidden tabs must not keep running physics in the background.
- `resetActiveTab()` must reset the full active-tab state:
  - slider-controlled values
  - positions
  - velocities
  - status text
  - tab-specific chart/timer state
- When a visual or physical boundary clamps position, clamp velocity too.
- Use explicit boundary statuses such as `at wall` or `at base` instead of leaving telemetry in a misleading `sliding` state.
- Stick-slip should use a stable moving reference frame. Do not periodically reset or modulo `xDrive` / `xBlock` in a way that causes visual teleporting.
- Keep `muK <= muS` in both model state and slider DOM state.
- For migrated sims, do not change physics, equations, or educational content silently. Flag any suspected bug in the summary instead.

## Bug-Fix Practice

- Do not spot-fix when bugs cascade.
- Before changing physics behavior, re-read the full relevant update function end-to-end:
  - `updateSliding`
  - `updateIncline`
  - `updateStick`
  - `updatePhysics`
- Check the matching render function after physics changes. A physics fix can still look broken if the draw code pins or wraps the visual position.
- Check DOM/state sync after reset. If state changes but sliders do not show it, the fix is incomplete.
- Check tab switches for state leakage. Switching tabs should not secretly advance another simulation or clear state unless that is intentional.

## Solar UI Practice

`public/astro/solar.html` is the current reference for post-launch UX lessons. Read `docs/solar-ui-lessons.md` before making Solar UI changes or borrowing its patterns for Rocket/Friction improvements.

- Treat the Solar sim as a precomputed mission viewer, not a piloting game.
- Use SOI as a short automatic handoff around SOI/capture/departure events, then settle back into System or Local. Long auto-SOI playback at high speed made missions harder to read.
- Use System for long coasts and final return geometry; use Local for target parking orbit, wait, descent, ascent, and surface dwell.
- Preserve drag-to-pan plus `+`, `-`, `Fit` canvas zoom controls. These are separate from System/SOI/Local frame buttons.
- Keep Pause/Resume, Back event, Next event, and Reset semantics distinct:
  - Pause freezes current mission time.
  - Back/Next jump between mission events.
  - Reset rewinds the loaded plan to `0 d` and `READY`, preserving destination, mission type, and speed choices.
- Timeline chips should distinguish current, past, and next events. A `0 d` launch/TLI burn is current at reset/start, then past after playback advances.
- Do not restore the true-scale toggle casually. Current UI uses a display-scale explanation because true scale looked blank and confused manual testers.
- Label visual artifacts honestly. Residual gaps are drift artifacts, fallback flyby markers are fallback markers, and long path jumps should not render as fake straight-line maneuvers.

## Educational Framing

- The stats panel's `mu +/- 2s` result is a scatter/tolerance band, not a confidence interval for the mean.
- Use `mu_min` when relying on friction to hold, such as traction, anchors, brakes, or clamps.
- Use `mu_max` when sizing motors or actuators that must overcome friction.
- Keep the distinction between weight-coupled friction and mechanically-clamped friction:
  - Weight-coupled friction scales with `F_n = m * g`.
  - Mechanically-clamped friction depends on clamp force, not the object's weight.
- Low-pressure stiction claims must stay qualitative only.
- Do not imply Mars is vacuum. Mars has a thin atmosphere, not hard vacuum.
- Preserve honest limitations footers. They should read like textbook articles, not console logs.

## Testing

After code changes:

```bash
npm install && npm start
```

- Verify the app serves on port `3000`.
- Check `http://localhost:3000/health` (returns `{"ok":true}`).
- Check `http://localhost:3000/`.
- Check `http://localhost:3000/astro/rocket.html`.
- Check `http://localhost:3000/astro/solar.html`.
- Check `http://localhost:3000/mech/friction.html`.
- Check `http://localhost:3000/shared/lab.css`.
- For V3/orbital changes, open `http://localhost:3000/shared/orbital.test.html` and `http://localhost:3000/shared/orbital.mission.test.html`; all 29 gating tests must pass (`16 / 16` and `13 / 13`).
- For UI changes, also click through in a browser:
  - The theme toggle (top-right) flips dark ↔ light, both DOM and canvas drawings follow, and the choice survives a page reload (localStorage).
  - The focus toggle on each sim collapses the side panel and the canvas takes the full row; clicking again restores.
  - Each sim's interactive elements (planet selector on rocket, three tabs on friction, all sliders) still work and the existing physics rules above still hold.
  - Solar-specific checks: playback uses a brief SOI handoff near arrival/departure without staying there for long cruise, Pause freezes elapsed time, Reset returns to `0 d` / `READY`, and the first timeline event is current at reset but past after launch starts.
- Stop the server after confirming.

For documentation-only changes, verify the edited Markdown files by reading them back.
