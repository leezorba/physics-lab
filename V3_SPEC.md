# V3: Solar System Mission Simulator — Spec v2

Status: V3 is shipped end-to-end. Stage 3a physics, Stage 3b mission planner, and Stage 3c UI are implemented, reviewed, patched, and tracked in ROADMAP. This spec remains the V3 contract plus post-ship UI amendments.

This document specifies the third sim for physics-lab: a 2D solar system mission simulator. It replaces "rocket goes straight up" with "rocket leaves Earth, travels to a destination, and returns." It does NOT replace the existing rocket ascent sim — that one stays as a focused atmospheric/Max-Q tool.

---

## What this sim does

User picks a destination and mission type:

**Destinations:**
- **Mars** (heliocentric transfer)
- **Venus** (heliocentric transfer)
- **Moon** (geocentric transfer — special case, Moon orbits Earth not Sun)

**Mission types:**
1. **Flyby** — Hohmann transfer out, swing past target using its gravity, return trajectory back to Earth. NO capture burn. Uses target's gravity to bend trajectory.
2. **Orbit and return** — Hohmann transfer out, capture burn into low circular orbit around target, departure burn back, return Hohmann. Two extra Δv burns vs flyby.
3. **Touch and return** — orbit-and-return PLUS a descent + ascent Δv pair at the target. Treated as a Δv "tax" with no atmospheric model. (See Out of Scope for why.)

App animates the full mission across realistic time scales. User watches Earth depart, the heliocentric (or geocentric for Moon) transfer arc, sphere-of-influence transition at target, target operations, and return.

## Physics framework: patched conics + two-body

For Mars/Venus missions, segments switch reference frame at SOI boundaries:

| Segment | Frame | Active gravity |
|---|---|---|
| Earth departure | Geocentric | Earth |
| Heliocentric outbound | Heliocentric | Sun |
| Target arrival | Target-centric | Target planet |
| Target operations | Target-centric | Target planet |
| Target departure | Target-centric | Target planet |
| Heliocentric return | Heliocentric | Sun |
| Earth arrival | Geocentric | Earth |

For Moon missions (special case): NO heliocentric segment. Entire trajectory is geocentric (Earth's gravity field) until Moon SOI crossing, then Moon-centric. Sun's pull on the spacecraft is ignored (consistent with classical Earth-Moon patched conics).

**Continuity at SOI boundaries:** position and velocity are continuous; reference frame transformation applied with frame velocity (e.g., Earth's orbital velocity around Sun).

## Reference numbers (verified via web search)

**Earth → Mars Hohmann transfer:**
- Travel time: ~259 days (~9 months) one-way
- Total Δv from LEO: ~5.6 km/s (3.6 km/s departure + 2.1 km/s arrival capture)
- Heliocentric transfer ellipse semi-major axis: 1.888×10⁸ km
- Earth orbital radius: 1.496×10⁸ km (1 AU)
- Mars orbital radius: 2.279×10⁸ km (1.524 AU)
- Sun gravitational parameter μ☉: 1.327×10¹¹ km³/s²

**Earth → Venus Hohmann transfer (inner planet, Δv applied retrograde):**
- Travel time: ~146 days
- Total Δv from LEO: ~5.2 km/s

**Earth → Moon Hohmann transfer (geocentric):**
- Travel time: ~5 days (translunar coast)
- Total Δv from LEO: ~3.9 km/s (3.1 km/s TLI + 0.8 km/s lunar orbit insertion)

**Spheres of influence:**
- Earth SOI (vs Sun): ~924,000 km
- Mars SOI: ~577,000 km
- Venus SOI: ~616,000 km
- Moon SOI (vs Earth): ~66,000 km

**Round-trip Δv estimates (rough, for sanity-check tests):**
- Mars flyby: ~3–4 km/s propulsive total (outbound burn only; Earth arrival speed is a marker, not a burn)
- Mars orbit-and-return: ~7–9 km/s propulsive total
- Mars touch-and-return: ~15–17 km/s propulsive total (varies hugely with descent assumptions)
- Moon orbit-and-return: ~4.3–5.2 km/s propulsive total
- Venus orbit-and-return: ~9–11 km/s

**Earth-arrival Δv convention:** Stage 3b/3c treat Earth arrival as a return-geometry and energy marker, not a propulsive recapture burn. `earth_arrival.deltaV` is therefore `0` for Mars, Venus, and Moon missions, while the segment reports incoming `arrivalGeocentricSpeed` for educational/safety framing. Total Δv is propulsive mission Δv only. This is deliberate because v1 does not model atmospheric reentry, aerocapture, heat shields, or propulsive Earth-orbit capture. For Moon returns this is speed at the propagated Earth-arrival radius, not a true asymptotic v∞.

**Key equations:**
- Vis-viva: `v² = μ(2/r − 1/a)`
- Hohmann transfer Δv₁ (departure from circular r₁ to ellipse meeting r₂): `Δv₁ = √(μ/r₁) · (√(2r₂/(r₁+r₂)) − 1)`
- Hohmann transfer Δv₂ (capture at r₂ into circular): `Δv₂ = √(μ/r₂) · (1 − √(2r₁/(r₁+r₂)))`
- Hohmann travel time: `T_transfer = π · √(a_t³/μ)` where `a_t = (r₁+r₂)/2`
- Orbital period: `T = 2π · √(a³/μ)`
- SOI radius (Laplace): `r_SOI = R · (m_planet/m_central)^(2/5)`

## Hard scope decisions

**Coplanar, circular planet orbits.** Real planets aren't, but for visualization the difference is small and the math is much simpler. Note as a limitation in footer.

**2D top-down view.** No inclination, no 3D camera.

**Integration scheme: semi-implicit Euler (Euler-Cromer)** at fixed dt per segment. Same scheme used in V1 rocket sim — already validated. NOT forward Euler (energy drift), NOT RK4 (overkill for visualization at our accuracy targets).

**Per-segment dt rules:**
- **Closed orbits (circular / elliptical):** use `closedOrbitDt(periapsis, apoapsis, mu)`. It computes eccentricity `e = (apoapsis - periapsis) / (apoapsis + periapsis)` and then:
  - `steps = max(1000, ceil(2π·√(1+e)/(0.01·(1-e)^(3/2))))`
  - `dt = T_segment / steps`, where T_segment is the full orbital period.
  This keeps the original `T/1000` behavior for low-eccentricity orbits while forcing smaller steps for high-eccentricity transfers where periapsis motion is fast. The 1% term means the periapsis passage is sampled finely enough for Moon-scale Hohmann transfers; animation can still decimate stored points later.
- **Hyperbolic segments (flybys, escape arcs):** no period exists. Start with `dt ≈ t_traverse / 2000` where `t_traverse ≈ 2 · r_SOI / v_∞` is the characteristic SOI-to-SOI traversal time. **However, this dt is known to undersample periapsis.** Worked example: Mars flyby at 1.1× planet radius, v_∞ ≈ 2.65 km/s → t_traverse ≈ 4.35×10⁵ s → dt ≈ 218 s. At periapsis v_p ≈ 5.48 km/s, so the spacecraft moves ≈1190 km per step ≈ **32% of r_p** per step. That's far too coarse for an accurate deflection angle.
  - **Pre-authorized fallback: RK4 for hyperbolic segments.** If the Stage 3b deflection-angle test exceeds 5% error (and given the 32% sampling above, it likely will), swap semi-implicit Euler for RK4 on hyperbolic segments only. Do NOT relitigate this decision in Stage 3b — go straight to RK4 if the test fails. Closed orbits stay on semi-implicit Euler.

**Time acceleration is mandatory and auto-throttles around event segments.** Default **100,000×** wall clock. User-adjustable from 1× to 10,000,000× with discrete stops, including added inspection speeds at 300,000× and 500,000×. The user-set slider is interpreted as the **dwell-phase speed** (parking-orbit waits, return-phase waits, long heliocentric coast). During **event-phase segments** — burns, capture/departure, descent/ascent, flyby arcs, and Earth-arrival markers — playback ramps down to a fixed 50,000× so the user can see what's happening. Do not add a broad "near event" speed branch; segment type is authoritative. Without auto-throttle, a Mars round trip with strict phase matching is ~14 minutes wall-clock at 100,000× user-set and the user misses every interesting moment.

**Initial geometry at t=0:** Earth is placed at heliocentric position `(1 AU, 0)` and orbits counter-clockwise. Target planet (Mars / Venus) is placed at the **optimal-launch-window phase angle** — the lead/lag angle that makes the outbound Hohmann ellipse arrive at the target's position. For Earth→Mars this is Mars leading Earth by ≈44.3° at t=0; for Earth→Venus this is Venus trailing Earth by ≈54.0°. Spec authors: don't hand-pick angles in the implementation — derive them from `α = π − ω_target · T_transfer` (target's angular velocity × transfer time), so the same code generalizes if a future destination is added.

**Return-phase matching is split by mission type:**

- **`orbit_return` and `touch_return`: strict.** Spacecraft waits in target parking orbit for `returnWaitTime(origin, target, t_arrival)` seconds — for v1 Earth-origin missions, that means `returnWaitTime("earth", target, t_arrival)`. It returns the smallest non-negative t such that the return Hohmann arrives at Earth's *actual* position. For Mars this is typically a 400–500 day wait, matching real-mission synodic planning. This is what makes Mars round trips take ~2.5 years and is a core pedagogical point.

- **`flyby`: loose.** Pure two-body flybys have no Δv and therefore no degree of freedom to wait — once past SOI you're on a heliocentric trajectory the flyby geometry determined. The spacecraft will arrive back at Earth's *orbital radius* but at potentially the wrong angular position. Do NOT fake a wait or a phantom burn to close the loop. Instead, MissionPlan for flyby missions reports a `returnAngleMiss` field (radians, signed) — the angle between the spacecraft's return arrival point and Earth's actual position at that time. UI shows this honestly: "Spacecraft passes Earth's orbit ~X° behind Earth on return — true free-return trajectories require non-Hohmann transfer geometry (Apollo 13 style), out of scope for v1." This is more pedagogically valuable than a fake closure.

`returnWaitDuration` in MissionPlan is therefore non-zero only for `orbit_return` / `touch_return`. For `flyby` it is `0` and `returnAngleMiss` carries the honest closure error.

**Moon return wait special case:** `returnWaitTime("earth", "moon", t_arrival)` intentionally returns `0` in v1. The Moon mission is modeled in the geocentric frame, with Earth as the central body, so there is no Earth orbital phase to wait for in the simplified closure condition. Stage 3b may still include an explicit `moon_wait` segment for timeline consistency, but its duration is 0 unless a later version adds a fuller Earth-Moon return-window model.

**Mission views — three discrete levels:**
1. **System view** — Sun + planets visible at AU scale. Planet dots rendered at exaggerated size (~10–50× true) for visibility; spacecraft is a tiny moving dot.
2. **SOI view** — target planet centered, SOI sphere visible, transition arc highlighted.
3. **Local view** — close to target planet, orbit/operations visible.

Current shipped UI behavior: System is automatic during heliocentric/translunar coast and final return geometry; SOI appears as a short automatic handoff around SOI/capture/departure events; Local is automatic during parking orbit, wait, descent, ascent, and surface dwell. Earlier long auto-SOI playback made high-speed encounters harder to understand. Manual buttons remain System / SOI / Local. SOI crossing and capture/departure can share the same mission timestamp; the UI may hold that handoff briefly for readability, but must not invent mission duration or alter the MissionPlan.

Canvas magnification is separate from frame selection: `+`, `-`, and `Fit` zoom/reset the current view, and drag-to-pan moves the focus. `Fit` returns to each view's readable default framing, so Local may be closer than System. No scroll-wheel zoom in v1.

**Visual scale honesty:** shipped UI uses enlarged planet disks plus a display-scale note instead of a true-scale toggle. True scale was physically honest but looked like a blank/broken canvas to manual testers. Distances and path shapes remain scale-based; planet disk exaggeration is disclosed in the side panel and footer.

**Pre-computed missions.** User picks "Earth → Mars → return," app calculates the full trajectory at start (returns a `MissionPlan`), then animates playback. NOT real-time delta-v budgeting (that's KSP territory).

**Animation playback model:** for each segment, propagate two-body physics from segment start state at fixed dt, store positions in an array. Animation interpolates linearly between stored positions based on current playback time. Total mission produces ~5,000–20,000 stored points across all segments.

**Δv budget displayed but not interactively spent.** Show how much Δv each maneuver costs; show running total. Educational, not a game.

## Out of scope (explicit)

- Manual flight control (no WASD piloting)
- N-body perturbations
- Orbital inclination
- Real launch windows / phase angle waiting (animation starts assuming optimal alignment)
- Atmospheric flight on arrival or descent (link back to existing rocket sim if user wants atmospheric ascent). "Touch and return" treats descent + ascent as a hand-wavy Δv sink (typical values: Mars surface ~8 km/s round-trip surface↔orbit, Moon ~4 km/s, Venus ~27 km/s — labeled as approximations only).
- Aerocapture, gravity assists beyond simple flyby
- Low-energy ballistic capture transfers
- Mass/fuel tracking (just shows Δv, not propellant or rocket equation)

These are all worth their own sims later.

## Staged build plan

### Stage 3a: Physics module (no UI)

Build `public/shared/orbital.js` as a standalone library — pure functions, no global state, no DOM. Exports a `CONSTANTS` object plus the functions below.

**Units convention (locked):** km for length, seconds for time, km/s for velocity, km³/s² for μ. UI displays Δv in km/s. Position/velocity vectors are `[x, y]` arrays (not `{x, y}` objects) — matches the spec's `state.r: [x,y]` and is friendlier for `Float64Array` later if perf matters.

```
// CONSTANTS table — used by orbital.js itself AND consumed by 3b's planMission.
// Values are sourced from the "Reference numbers" section above.
export const CONSTANTS = {
  sun:    { mu: 1.327e11 },
  earth:  { mu: 398600,   radius: 6378,  orbitRadius: 1.496e8, soi: 924000 },
  mars:   { mu: 42828,    radius: 3389,  orbitRadius: 2.279e8, soi: 577000 },
  venus:  { mu: 324859,   radius: 6052,  orbitRadius: 1.082e8, soi: 616000 },
  moon:   { mu: 4903,     radius: 1737,  orbitRadius: 384400,  soi: 66000  },  // orbitRadius is around Earth, not Sun
  // Touch-and-return Δv tax values (round-trip surface↔low-orbit, hand-wavy approximations).
  surfaceDeltaV: { mars: 8.0, moon: 4.0, venus: 27.0 }  // km/s
}

// Two-body propagation (semi-implicit Euler / Euler-Cromer):
//   v_new = v + (a(r) · dt);  r_new = r + v_new · dt
propagate(state, mu, dt) → newState
  state = { r: [x,y], v: [vx,vy] }

// Closed-orbit integration step policy:
//   e = (apoapsis - periapsis) / (apoapsis + periapsis)
//   steps = max(1000, ceil(2π·√(1+e)/(0.01·(1-e)^(3/2))))
//   dt = T / steps
closedOrbitDt(periapsis, apoapsis, mu) → {
  dt,                 // seconds
  steps,              // integration steps per full period
  period,             // seconds
  semiMajorAxis,      // km
  eccentricity
}

// Hohmann transfer between coplanar circular orbits
hohmannTransfer(r1, r2, mu) → {
  dv1, dv2,           // departure and arrival Δv magnitudes (km/s)
  transferTime,       // seconds (half-period of transfer ellipse)
  semiMajorAxis,      // km
  periapsis,          // km (= min(r1,r2))
  apoapsis            // km (= max(r1,r2))
}

// SOI radius (Laplace formula): R · (m_planet/m_central)^(2/5)
sphereOfInfluence(planetMass, centralMass, planetOrbitRadius) → r_SOI

// Vis-viva: v² = μ · (2/r − 1/a)
visViva(r, a, mu) → v

// Burn from circular parking orbit at r_park into a hyperbolic escape with given v_∞.
// Δv = √(v_∞² + 2μ/r_park) − √(μ/r_park).
escapeBurn(r_park, v_infinity, mu) → deltaV   // km/s

// Frame transformation: adds/subtracts frame velocity from state velocity.
// fromFrame / toFrame are labels for clarity; the actual transform is just an
// arithmetic shift. frameVelocity is the relative velocity of `toFrame` w.r.t.
// `fromFrame`, expressed as [vx, vy] in the shared (heliocentric) inertial frame.
transformFrame(state, fromFrame, toFrame, frameVelocity) → newState

// Optimal Hohmann phase angle: target's lead/lag at t=0 such that the outbound
// transfer arc rendezvous with the target. α = π − ω_target · T_transfer.
hohmannPhaseAngle(r_origin, r_target, mu_central) → angle_radians

// Synodic-period wait time at target so the return Hohmann arrives at origin's
// actual position (not just orbital radius). Solves the smallest non-negative t
// such that the return-window phase condition is met. For circular orbits this
// is closed-form; one transcendental solve, no iteration needed.
// IMPORTANT: this only applies to mission types with a wait phase
// (orbit_return, touch_return). For flyby missions there is no wait
// degree of freedom — see returnAngleMiss() instead.
returnWaitTime(originBody, targetBody, t_arrival) → seconds

// For loose-closure flyby missions: how far off-target the return trajectory
// arrives, in radians (signed). Computed from the post-flyby heliocentric state
// and Earth's position at return arrival time. UI displays this honestly
// instead of faking closure.
returnAngleMiss(returnArrivalState, earthState_at_arrival) → radians
```

**Tests (must pass before 3b):**
- LEO at orbital **radius** 6,778 km (= 400 km altitude above 6,378 km Earth radius), μ_Earth = 398,600 km³/s² → period **5,553.46 s** ± 1%. Earlier drafts listed 5,538 s; recomputing from the locked constants gives 5,553.46 s, so use the computed value in tests.
- Hohmann transfer Earth → Mars (heliocentric) → travel time 259 days ± 1%
- Hohmann transfer Earth → Mars → total Δv (Δv₁ + Δv₂) within 5% of 5.6 km/s (heliocentric portion only; LEO escape and Mars capture from low parking orbit are computed via vis-viva at the parking radii — see helper `escapeBurn(r_park, v_infinity, mu)`)
- SOI Earth → 924,000 km ± 5%
- SOI Mars → 577,000 km ± 5%
- **Trajectory closure:** propagate a circular orbit through one period; final position within 0.1% of starting position at dt = T/1000
- **Energy conservation:** kinetic + potential energy drift < 0.5% over one circular period at dt = T/1000 (semi-implicit Euler is symplectic — energy is bounded, not strictly conserved; the relaxed 0.5% reflects the bounded oscillation amplitude at this dt). High-eccentricity transfers use `closedOrbitDt()` instead of raw `T/1000`.
- Frame transformation round-trip: A→B→A returns original state to relative error **< 1e-12** (floating-point round-off is ~1e-15 for IEEE 754 doubles; 1e-12 leaves three orders of margin for accumulated error in pure additions/subtractions of frame velocity).
- Frame transformation one-way convention: fromFrame → toFrame subtracts `frameVelocity` from the state velocity, with position unchanged.
- **Closed-orbit dt policy:** Mars Hohmann eccentricity stays on the 1,000-step floor, while Moon-scale transfer eccentricity is anchored around `e ≈ 0.965` and 130,000–140,000 steps.
- **High-eccentricity half-transfer:** propagate an Earth-Moon-like Hohmann ellipse from periapsis to apoapsis using `closedOrbitDt()`. Final radius must be within 0.2% of Moon orbital radius and the angular miss from 180° must be within 0.5°.
- **Angular momentum conservation:** for an eccentric two-body orbit, angular momentum drift must stay below 1e-12 relative over one period.
- **Kepler's 3rd law:** across at least three circular radii, propagate each circular orbit to the first negative-to-positive `y = 0` crossing, double that half-orbit time to measure period, then check `T²/a³` is constant across radii to within 0.5%.
- **escapeBurn isolated checks:** `escapeBurn(r_LEO, 0, μ_Earth) ≈ 3.176 km/s` for parabolic escape from circular LEO, and Earth hyperbolic departure with `v∞ = 2.94 km/s` gives `Δv ≈ 3.568 km/s`. A bound Earth-Moon TLI burn is a different vis-viva calculation, not this hyperbolic escape helper.
- **Validation guards:** invalid radii, μ, NaN values, vector shapes, unknown bodies, and zero-angle vectors fail loudly with `TypeError` / `RangeError` instead of returning `NaN` / `Infinity`.

Tests live in `public/shared/orbital.test.html` (open in browser, console assertions, visible pass/fail report on page).

**Deliverable:** working orbital.js + all tests passing. NO simulator UI yet.

### Stage 3b: Mission planner (still no UI)

Add to orbital.js:

```
planMission(originBody, targetBody, missionType, options) → MissionPlan

// originBody: 'earth' (only origin supported in v1)
// targetBody: 'mars' | 'venus' | 'moon'
// missionType: 'flyby' | 'orbit_return' | 'touch_return'
// options: {
//   parkingOrbitAltitude?: number,   // km above origin surface; default 400
//   targetOrbitAltitude?: number,    // km above target surface; default 400
//   flybyPeriapsisRatio?: number,    // periapsis = ratio × target.radius; default 1.1
//   surfaceDwellDuration?: number,    // seconds on target surface for touch_return; default 0
//   t0?: number                      // mission start time (seconds since epoch); default 0
// }

MissionPlan = {
  segments: [
    {
      type: 'earth_departure',
      frame: 'geocentric',
      mu: μ_earth,
      startState, endState,    // each = { r:[x,y], v:[vx,vy] }
      duration,                // seconds
      deltaV,                  // km/s (impulsive at segment start; 0 if pure coast)
                               // earth_arrival uses deltaV=0 and reports arrivalGeocentricSpeed instead
      points: [[x,y], [x,y]…]  // pre-computed positions for animation, in the segment's frame
    },
    ...
  ],
  totalDeltaV,                 // km/s — sum of propulsive per-segment deltaV
  totalDuration,               // seconds — sum of per-segment durations (includes return-wait if any)
  returnWaitDuration,          // seconds — time spent at target waiting for return launch window
                               //   (orbit_return / touch_return only; 0 for flyby)
  returnAngleMiss,             // radians, signed — honest closure error between the
                               //   propagated return arrival point and Earth's actual
                               //   position at that time. Flyby is intentionally loose;
                               //   orbit_return / touch_return still report residual
                               //   propagation drift instead of hiding it.
  events: [{ t, label }]       // 'TLI burn', 'SOI crossing', 'capture burn',
                               //   'return window opens', 'flyby periapsis', etc.
}
```

Recommended Stage 3b helper signatures (do not implement in Stage 3a):

```
// Circular ephemeris for planet / moon dots in the chosen central frame.
circularOrbitState(radius, mu, t, phase0 = 0) → state

// Endpoint state on a Hohmann transfer ellipse, with +x at departure.
hohmannTransferState(r1, r2, mu, endpoint) → state
  endpoint = 'departure' | 'arrival'

// Signed Hohmann burn directions. Outer transfers are prograde at departure;
// inner transfers are retrograde at departure.
signedHohmannDeltaV(r1, r2, mu) → { dv1, dv2, direction1, direction2, isInnerTransfer }

// Analytical flyby deflection angle for Stage 3b's hyperbolic test.
hyperbolicDeflectionAngle(periapsis, vInfinity, mu) → radians

// Frame transform with both origin offset and frame velocity.
transformFrameWithOrigin(state, framePosition, frameVelocity, direction) → newState
  direction = 'toFrame' | 'fromFrame'

// Angle helpers for closure and display.
normalizeAngle(angle) → radians
signedAngleBetween(a, b) → radians
```

Mission segment patterns:

- **Mars/Venus flyby (loose closure):** earth_departure → heliocentric_outbound → flyby_arc (target-centric, hyperbolic, no Δv) → heliocentric_return → earth_arrival. No `target_wait` segment exists for flyby — there's no degree of freedom to insert one. Resulting trajectory ends at Earth's orbital radius but generally not at Earth's actual position; the angular miss is reported in MissionPlan.returnAngleMiss.
- **Mars/Venus orbit-return (strict return-window matching):** earth_departure → heliocentric_outbound → target_arrival (finite SOI coast, no Δv) → capture (Δv) → target_orbit (parking) → **target_wait (returnWaitTime, no Δv)** → departure (Δv) → target_departure (finite SOI coast, no Δv) → heliocentric_return → earth_arrival. The target_wait segment solves the return window internally, then the return coast is propagated until it crosses Earth's orbital radius. Any remaining Earth-arrival offset is labeled as an `earth_arrival.closureMarker = "residual_gap"` segment, not hidden.
- **Mars/Venus touch-return (strict return-window matching):** orbit_return + descent (Δv tax) + surface_dwell + ascent (Δv tax) inserted between target_orbit and target_wait. Surface_dwell can be 0 or whatever the user picks; the wait that aims the return window is still target_wait, downstream of ascent.
- **Moon flyby (loose closure):** earth_departure → translunar_coast (geocentric) → moon_flyby (moon-centric hyperbolic) → translunar_return → earth_arrival. Same loose-closure rule as Mars/Venus flyby. Moon's short transfer time (~5 days) means returnAngleMiss is small in practice (~5° at most), but report it honestly.
- **Moon orbit-return:** earth_departure → translunar_coast → moon_arrival (finite SOI coast, no Δv) → LOI capture (Δv) → moon_orbit → **moon_wait (returnWaitTime, no Δv; duration 0 in v1's simplified geocentric model)** → TEI departure (Δv) → moon_departure (finite SOI coast, no Δv) → translunar_return → earth_arrival.
- **Moon touch-return:** add descent + surface_dwell + ascent Δv around moon_orbit, before moon_wait.

**Tests (must pass before 3c):**
- `planMission(earth, mars, 'orbit_return')` → `totalDuration` ≈ 970–995 days including return wait, finite target-SOI traversal, and labeled arrival-gap duration; `totalDeltaV` in 7–9 km/s range under the Earth-arrival-speed convention; `returnWaitDuration` > 0; `returnAngleMiss` is finite and reported.
- `planMission(earth, venus, 'orbit_return')` → `totalDuration` ≈ 740–795 days including return wait, finite target-SOI traversal, and labeled arrival-gap duration; `totalDeltaV` in 9–11 km/s range; `returnWaitDuration` > 0; `returnAngleMiss` is finite and reported; `signedHohmannDeltaV(...).direction1 === -1`.
- `planMission(earth, moon, 'orbit_return')` → `totalDuration` ≈ 10 days + small return-arrival marker duration; `totalDeltaV` in 4.3–5.2 km/s range under the Earth-arrival-speed convention; `returnAngleMiss` is finite and reported.
- `planMission(earth, mars, 'flyby')` → `totalDuration` ≈ 2 × 259 days; `totalDeltaV` in 3–4 km/s range; `returnWaitDuration` == 0; `returnAngleMiss` reported (any value, but **must be non-zero in general** — flag if implementer accidentally faked closure).
- **Interplanetary/translunar arc sampling:** `heliocentric_outbound`, `heliocentric_return`, `translunar_coast`, and `translunar_return` points must be generated by two-body propagation with `closedOrbitDt()` resolution, not straight-line interpolation.
- **Patched-conic continuity (all mission types):** independently propagate coast segment N, transform frames at the boundary, then check it matches start of segment N+1; position tolerance < 0.01% relative and velocity tolerance < 0.1% relative.
- **Strict-return residual gap (orbit_return / touch_return only):** use `earth_arrival.startState.r`, not the hardcoded final point, to verify the propagated return state. The browser test must require a non-zero `earth_arrival.duration`, `closureGapDistance`, and `closureMarker = "residual_gap"` when propagation misses Earth's actual position.
- **Finite target-SOI traversal (orbit_return / touch_return only):** Mars/Venus plans include `target_arrival` and `target_departure`; Moon plans include `moon_arrival` and `moon_departure`. These segments have `duration > 0`, `deltaV = 0`, sampled hyperbolic points, and continuous seams into capture/departure/return segments. Total propulsive Δv must remain within 0.01 km/s of the pre-V3.1 planner output.
- **Loose-closure replay (flyby only):** animating all segments produces a return arrival point at Earth's *orbital radius* within 1%, but at angular position offset by `returnAngleMiss` ± 0.5°. Do NOT assert positional closure for flyby.
- **Hyperbolic deflection accuracy:** for a Mars flyby at 1.1× target radius with v_∞ = 2.65 km/s, the analytical deflection angle is `δ = 2·arcsin(1/(1 + r_p·v_∞²/μ))`. Propagated trajectory must match analytical δ within **5%**. **If this test fails, switch hyperbolic segments to RK4 with the same dt heuristic and re-run. Do not relitigate the integrator choice.** Document the swap in the test report; closed orbits stay on semi-implicit Euler regardless.

**Deliverable:** working planner. Still no UI.

### Stage 3c: UI

Now build `public/astro/solar.html`. Uses orbital.js. Features:

- **Destination selector:** Mars, Venus, Moon
- **Mission type selector:** Flyby, Orbit and return, Touch and return
- **"Plan and launch" button** — triggers planMission, switches to playback
- **2D canvas** with System / SOI / Local view buttons. System and Local auto-select by mission phase; SOI appears as a brief arrival/departure handoff and remains manually selectable. Canvas also supports `+`, `-`, `Fit` magnification controls and drag-to-pan.
- **Time acceleration slider:** 1× to 10,000,000× with discrete stops; default 100,000×. The slider sets the **dwell-phase speed** — see auto-throttle below.
- **Auto-throttle is REQUIRED.** Without it, a Mars round trip with strict phase matching plays for ~14 minutes wall-clock at the 100,000× default and the user misses every interesting moment. Behavior:
  - **Event phases (capped at 50,000× regardless of slider):** event segment types such as earth_departure, target_arrival, moon_arrival, capture, departure, target_departure, moon_departure, descent, ascent, flyby_arc, moon_flyby, LOI capture, TEI departure, and Earth-arrival marker segments. Segment type is authoritative; do not throttle merely because a future event is nearby.
  - **Dwell phases (use slider speed):** heliocentric_outbound, heliocentric_return, target_orbit (if no descent), target_wait, surface_dwell, translunar_coast.
  - **Transitions are smoothed** with a ~0.5 s ramp so the speed change isn't jarring.
  - The current effective speed multiplier is shown in the UI (e.g., "Speed: 100,000× → throttled to 50,000× for capture burn").
- **Mission timeline:** current segment label, total elapsed/remaining (in mission seconds, displayed as days/hours), and a horizontal segment-bar showing mission events. Chips distinguish current, past, and next events; `0 d` launch/TLI is current at reset/start and past after playback advances.
- **Δv readout:** per-maneuver list with running total, in km/s.
- **Earth arrival marker:** show incoming Earth-arrival `arrivalGeocentricSpeed` separately from total Δv. It is not counted as a burn because v1 does not model reentry, aerocapture, or propulsive Earth-orbit capture.
- **Closure readout:** for `flyby` missions, display `returnAngleMiss` honestly (e.g., "Return arrival: 12° behind Earth — see footer for why"). For `orbit_return` / `touch_return`, display the return wait plus any residual `closureGapDistance` honestly; do not show "closed loop" if the propagated state misses Earth.
- **"Back event" / "Next event"** buttons — jump simulation time to adjacent MissionPlan events. Useful for skipping return-phase waits without changing the user's selected speed.
- **Pause / Resume** — freezes and resumes playback without changing mission time.
- **Reset** — rewinds the loaded plan to `0 d`, sets status to READY, resets canvas zoom/pan, and preserves destination, mission type, and dwell speed selections.
- **Display scale note** — explains planet disk exaggeration instead of offering a true-scale toggle.
- **Footer:** equations, glossary, scope/limitations (matches V1/V2 footer style). Must explicitly cover: why Mars round trips take 2.5 years (synodic wait), why flyby missions don't naturally close on Earth (no Δv degree of freedom), Apollo's free-return as the real-world workaround, and why Earth-arrival speed is shown as an energy/safety marker instead of counted as Δv. Footer copy: "Earth arrival speed is shown as an energy/safety marker. It is not included in total Δv because this version stops at Earth-return geometry and does not model atmospheric reentry, aerocapture, or propulsive Earth-orbit capture."
- **Stage 3c UI concern:** if a deflected flyby orbit does not cross Earth's orbital radius, Stage 3b may use an unbent post-encounter conic for the loose-return marker and attach `returnPropagationNote`. The Stage 3c renderer must avoid a final-frame snap caused by that fallback endState overwrite and label the fallback instead of presenting it as a physical deflected path.
- **Stage 3c UI concern:** if projected trajectory points create a huge visual connector across the canvas, break the path instead of drawing a straight line that looks like a burn or steering command.

Visual style matches lab.css (dark default, deep blue accent, Inter/Space Grotesk). Page chrome per AGENTS.md → Page Chrome (favicon, theme toggle, focus toggle, site-credits footer, theme init script).

**Each stage gets reviewed (Claude/Gemini/GPT) before next stage starts.** Same process that worked for V1 and V2.

### Stage 3c post-ship UI amendments

Manual testing after V3 ship changed several UI behaviors without changing `orbital.js`:

- SOI appears as a brief automatic handoff around arrival/departure events; System/Local carry the longer automatic phase views.
- Same-time SOI/capture/departure events are held visually as handoffs instead of flashing through every internal label. This is UI pacing only, not a new mission segment.
- The true-scale toggle was removed in favor of a display-scale explanation.
- Timeline chips now show current/past/next state so launch/TLI does not look ignored.
- DONE state labels the end marker rather than the last coast segment, and playback speed reads as stopped.
- Reset is a compact rewind-to-start control; Pause/Resume handles temporary stopping.
- Canvas supports `+`, `-`, `Fit` zoom buttons and drag-to-pan. `Fit` resets to the readable default for the active frame.
- Parking-orbit and wait visuals render analytically as clean circular orbits.
- Residual gaps, flyby fallback markers, and long path breaks are labeled/rendered so they do not imply hidden maneuvers.
- V3.1 planner follow-up: orbit-return and touch-return now include finite target/Moon SOI arrival and departure coast segments (`target_arrival`, `moon_arrival`, `target_departure`, `moon_departure`) with `deltaV = 0`; capture/departure burns remain instantaneous accounting markers.

See `docs/solar-ui-lessons.md` for the focused UX rationale and future-sim takeaways.

## Pedagogical framing

User should leave understanding:
- Why interplanetary travel takes months (Hohmann ellipse geometry, planets are far apart)
- Why launch windows exist (planetary alignment) — outbound launch is fixed at the optimal angle in this sim
- Why "going to Mars" needs ~3.6 km/s Δv beyond LEO (escape + transfer)
- Why orbit-and-return is more expensive than flyby (capture + departure burns)
- Why touch-and-return is much harder than orbit-and-return (descent + ascent on top)
- Why Mars **round trips take ~2.5 years** (~519 days transit + 400–500 days surface wait for the return launch window — the synodic period constraint)
- Why pure two-body **flybys don't naturally close on Earth** (no Δv degree of freedom to wait for the return window — the spacecraft passes Earth's orbit at whatever angular position the geometry produces). Real free-return trajectories like Apollo 13 use carefully tuned non-Hohmann transfers; out of scope here.
- Why Earth↔Moon is ~5 days vs Earth↔Mars 259 days (geocentric ellipse vs heliocentric ellipse, very different scales)
- What patched conics is and why simulators use it (one-body-at-a-time approximation)
- That impulsive Δv is an idealization (real burns last minutes, not instants)
- Why Earth arrival speed is an energy/safety marker, not part of total Δv in v1

Footer carries the explanation. Same care as V1 and V2 footers.

## Honest limitations to document in footer

- Coplanar circular orbits (real planets are tilted and elliptical)
- Patched conics is an approximation; valid because each SOI is small relative to the central body's distance
- No launch window enforcement (real missions wait for alignment that occurs every 26 months for Mars, etc.)
- Pre-computed trajectory; no real-time piloting
- 2D only
- Δv shown is impulsive (instantaneous burn); real engines burn over minutes, which slightly reduces effective Δv (gravity loss)
- Earth arrival speed is shown but not counted in total Δv because this version does not model atmospheric reentry, aerocapture, heat shields, or propulsive Earth-orbit capture
- No gravity assists, no aerocapture, no low-energy transfers
- No mass/fuel modeling — Δv shown but not converted to propellant via the Tsiolkovsky equation
- Touch-and-return descent/ascent is a hand-wavy Δv tax, not a real surface mission model
- Planet disks are exaggerated for visibility; orbital distances and path shapes remain scale-based
- **Flyby missions do not close on Earth.** Pure two-body flybys have no degree of freedom to wait for the return launch window. The simulator reports the angular miss honestly rather than faking closure. Real free-return trajectories (Apollo 13) use non-Hohmann outbound transfers tuned so the post-flyby trajectory ends where Earth will be — out of scope for v1.

## Stage 3a Codex prompt

```
Read V3_SPEC.md. Build only Stage 3a — the physics module. 

Deliverable:
- public/shared/orbital.js (functions per spec)
- public/shared/orbital.test.html (browser-runnable tests with visible pass/fail report)

Do NOT build Stage 3b. Do NOT build Stage 3c. Do NOT add anything to the lab homepage.

Use semi-implicit Euler for two-body propagation (consistent with V1). 
Pure functions; no global state; no DOM dependencies in orbital.js.
Test page imports orbital.js as a module and runs all tests listed in spec section "Stage 3a Tests."

Display test results on the page (green for pass, red for fail with expected vs actual).

After: open localhost:3000/shared/orbital.test.html in a browser. All tests must pass before stopping.

Flag in your summary:
- Any test that's borderline (< 5% margin)
- Any spec ambiguity you had to resolve, with what you chose and why
- Any reference number from the spec that didn't match your computation (don't silently match the spec — if your math says different, surface it)
```

## Ambiguities already resolved (do not re-ask)

This spec went through a review pass before Stage 3a started. The following decisions are locked — if you disagree with any of them, raise it once in your summary, but don't block on them.

- **Default time acceleration:** 100,000× (see Hard scope decisions). 10,000,000× is the max, not the default.
- **Hyperbolic-segment dt:** start with `t_traverse / 2000` on semi-implicit Euler. RK4 swap is **pre-authorized** if Stage 3b's deflection test fails — go straight to RK4, don't relitigate.
- **Closed-orbit dt:** use the single `closedOrbitDt()` rule, `steps = max(1000, ceil(2π·√(1+e)/(0.01·(1-e)^(3/2))))`; do not revert to raw `T/1000` for high-eccentricity transfers.
- **Return-phase matching is split by mission type:** strict via `returnWaitTime()` for `orbit_return` / `touch_return`; loose with `returnAngleMiss` honest reporting for `flyby`. Do NOT fake flyby closure.
- **Initial geometry at t=0:** Earth at (1 AU, 0), counter-clockwise; target at the optimal-launch-window phase angle derived from `α = π − ω_target · T_transfer`.
- **Flyby periapsis default:** 1.1× target.radius, overridable via `options.flybyPeriapsisRatio`.
- **Energy conservation tolerance:** 0.5% over one circular period at dt = T/1000 (relaxed from 0.1% to honor symplectic Euler's bounded oscillation). High-eccentricity transfer accuracy is guarded separately by the `closedOrbitDt()` half-transfer test.
- **Frame round-trip tolerance:** relative error < 1e-12.
- **Auto-throttle in Stage 3c:** mandatory. Event phases capped at 50,000×; dwell phases use slider speed.
- **Mission views:** three discrete frame buttons. System/Local may auto-select by mission phase; SOI appears as a brief arrival/departure handoff and remains manually selectable. Canvas magnification uses `+`, `-`, and `Fit` controls plus drag-to-pan. No scroll-wheel in v1.
- **Units:** km, seconds, km/s, km³/s². Vectors are `[x, y]` arrays.
- **`CONSTANTS` table:** part of Stage 3a deliverable, exported from `orbital.js`.

If you find the spec genuinely wrong (a number that doesn't reproduce, a formula that contradicts itself), surface it in your summary — don't silently match the spec. But don't reopen the resolved decisions above just to suggest a different style.
