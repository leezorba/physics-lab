// Orbital mechanics library for the V3 Solar System Mission Simulator.
//
// Pure functions only — no DOM, no globals, no I/O. Two-body propagation uses
// semi-implicit Euler (Euler-Cromer), the same scheme V1 already validated.
//
// Units (locked by V3_SPEC):
//   length     km
//   time       s
//   velocity   km/s
//   mu (= GM)  km^3/s^2
//
// State objects are { r: [x, y], v: [vx, vy] } — arrays, not {x,y}, so the
// shape is friendly to Float64Array later if perf matters.

export const CONSTANTS = Object.freeze({
  sun:    Object.freeze({ mu: 1.327e11 }),
  earth:  Object.freeze({ mu: 398600,   radius: 6378,  orbitRadius: 1.496e8, soi: 924000 }),
  mars:   Object.freeze({ mu: 42828,    radius: 3389,  orbitRadius: 2.279e8, soi: 577000 }),
  venus:  Object.freeze({ mu: 324859,   radius: 6052,  orbitRadius: 1.082e8, soi: 616000 }),
  // Moon's orbitRadius is around Earth, not the Sun — special-cased everywhere
  // it matters (returnWaitTime, the eventual planMission).
  moon:   Object.freeze({ mu: 4903,     radius: 1737,  orbitRadius: 384400,  soi: 66000  }),
  // Hand-wavy round-trip surface↔low-orbit Δv tax for touch-and-return.
  surfaceDeltaV: Object.freeze({ mars: 8.0, moon: 4.0, venus: 27.0 })
});

function assertFiniteNumber(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function assertPositiveNumber(name, value) {
  assertFiniteNumber(name, value);
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than 0`);
  }
}

function assertNonNegativeNumber(name, value) {
  assertFiniteNumber(name, value);
  if (value < 0) {
    throw new RangeError(`${name} must be greater than or equal to 0`);
  }
}

function assertVector2(name, vector) {
  if (!vector || typeof vector.length !== "number" || vector.length !== 2) {
    throw new TypeError(`${name} must be a two-element vector`);
  }
  assertFiniteNumber(`${name}[0]`, vector[0]);
  assertFiniteNumber(`${name}[1]`, vector[1]);
}

function assertState(state) {
  if (!state || typeof state !== "object") {
    throw new TypeError("state must be an object with r and v vectors");
  }
  assertVector2("state.r", state.r);
  assertVector2("state.v", state.v);
}

function resolveBody(body, name) {
  if (typeof body === "string") {
    const resolved = CONSTANTS[body];
    if (!resolved || body === "surfaceDeltaV") {
      throw new RangeError(`${name} must be a known body name`);
    }
    return { key: body, value: resolved };
  }
  if (!body || typeof body !== "object") {
    throw new TypeError(`${name} must be a body name or body object`);
  }
  return { key: null, value: body };
}

function assertOrbitBody(name, body) {
  assertPositiveNumber(`${name}.orbitRadius`, body.orbitRadius);
  return body;
}

// Two-body propagation, semi-implicit Euler:
//   v_new = v + a(r) · dt
//   r_new = r + v_new · dt
// Symplectic — energy is bounded (oscillates) rather than drifting secularly.
export function propagate(state, mu, dt) {
  assertState(state);
  assertPositiveNumber("mu", mu);
  assertNonNegativeNumber("dt", dt);

  const x = state.r[0], y = state.r[1];
  const vx = state.v[0], vy = state.v[1];
  const r2 = x * x + y * y;
  const r  = Math.sqrt(r2);
  if (r === 0) {
    throw new RangeError("state.r magnitude must be greater than 0");
  }
  const r3 = r2 * r;
  const ax = -mu * x / r3;
  const ay = -mu * y / r3;
  const vxn = vx + ax * dt;
  const vyn = vy + ay * dt;
  const xn  = x + vxn * dt;
  const yn  = y + vyn * dt;
  return { r: [xn, yn], v: [vxn, vyn] };
}

// Hohmann transfer between two coplanar circular orbits of radii r1, r2 about a
// central body with gravitational parameter mu. Returns Δv magnitudes at each
// end (always positive — direction is implicit in mission context), the half-
// period transfer time, and ellipse geometry.
export function hohmannTransfer(r1, r2, mu) {
  assertPositiveNumber("r1", r1);
  assertPositiveNumber("r2", r2);
  assertPositiveNumber("mu", mu);

  const aT = (r1 + r2) / 2;
  const sqrtMuR1 = Math.sqrt(mu / r1);
  const sqrtMuR2 = Math.sqrt(mu / r2);
  const dv1 = Math.abs(sqrtMuR1 * (Math.sqrt(2 * r2 / (r1 + r2)) - 1));
  const dv2 = Math.abs(sqrtMuR2 * (1 - Math.sqrt(2 * r1 / (r1 + r2))));
  const transferTime = Math.PI * Math.sqrt(aT * aT * aT / mu);
  return {
    dv1,
    dv2,
    transferTime,
    semiMajorAxis: aT,
    periapsis: Math.min(r1, r2),
    apoapsis:  Math.max(r1, r2)
  };
}

// Recommended fixed step for closed two-body orbits. The floor preserves the
// original T/1000 rule for low-eccentricity cases; the high-eccentricity term
// caps the periapsis motion per step at 1% of periapsis radius.
export function closedOrbitDt(periapsis, apoapsis, mu) {
  assertPositiveNumber("periapsis", periapsis);
  assertPositiveNumber("apoapsis", apoapsis);
  assertPositiveNumber("mu", mu);
  if (apoapsis < periapsis) {
    throw new RangeError("apoapsis must be greater than or equal to periapsis");
  }

  const semiMajorAxis = (periapsis + apoapsis) / 2;
  const eccentricity = (apoapsis - periapsis) / (apoapsis + periapsis);
  const period = 2 * Math.PI * Math.sqrt(semiMajorAxis * semiMajorAxis * semiMajorAxis / mu);
  const steps = Math.max(
    1000,
    Math.ceil(
      (2 * Math.PI * Math.sqrt(1 + eccentricity)) /
      (0.01 * Math.pow(1 - eccentricity, 1.5))
    )
  );

  return {
    dt: period / steps,
    steps,
    period,
    semiMajorAxis,
    eccentricity
  };
}

// Sphere of influence (Laplace): R · (m_planet / m_central)^(2/5). Mass and mu
// scale identically (mu = G·m), so passing mu values for both arguments is
// equivalent to passing masses — the ratio is what matters.
export function sphereOfInfluence(planetMass, centralMass, planetOrbitRadius) {
  assertPositiveNumber("planetMass", planetMass);
  assertPositiveNumber("centralMass", centralMass);
  assertPositiveNumber("planetOrbitRadius", planetOrbitRadius);

  return planetOrbitRadius * Math.pow(planetMass / centralMass, 2 / 5);
}

// Vis-viva: v² = μ · (2/r − 1/a). Returns the speed at radius r on an orbit
// with semi-major axis a around a body of gravitational parameter mu.
export function visViva(r, a, mu) {
  assertPositiveNumber("r", r);
  assertPositiveNumber("a", a);
  assertPositiveNumber("mu", mu);

  const speedSquared = mu * (2 / r - 1 / a);
  if (speedSquared < 0) {
    throw new RangeError("vis-viva speed squared must be non-negative");
  }
  return Math.sqrt(speedSquared);
}

// Δv to leave a circular parking orbit at r_park onto a hyperbolic escape
// with the given hyperbolic excess speed v_∞:
//   Δv = √(v_∞² + 2μ/r_park) − √(μ/r_park)
// Symmetric for capture (use the same formula with the arrival v_∞).
export function escapeBurn(r_park, v_infinity, mu) {
  assertPositiveNumber("r_park", r_park);
  assertNonNegativeNumber("v_infinity", v_infinity);
  assertPositiveNumber("mu", mu);

  return Math.sqrt(v_infinity * v_infinity + 2 * mu / r_park) - Math.sqrt(mu / r_park);
}

// Frame transformation. fromFrame / toFrame are labels for clarity only — the
// actual operation is an arithmetic shift of velocity by the relative frame
// velocity. Position is left untouched; the caller handles any origin offset
// separately (frames typically share an inertial origin in this sim).
export function transformFrame(state, fromFrame, toFrame, frameVelocity) {
  assertState(state);
  assertVector2("frameVelocity", frameVelocity);

  void fromFrame;
  void toFrame;
  return {
    r: [state.r[0], state.r[1]],
    v: [state.v[0] - frameVelocity[0], state.v[1] - frameVelocity[1]]
  };
}

// Optimal-launch-window phase angle for a Hohmann transfer from a circular
// origin orbit of radius r_origin to a circular target orbit of radius r_target
// about a central body of gravitational parameter mu_central:
//   α = π − ω_target · T_transfer
// Sign convention: α > 0 means the target leads the origin at t=0 (e.g. Mars);
// α < 0 means the target trails (e.g. Venus). Origin is assumed at angle 0.
export function hohmannPhaseAngle(r_origin, r_target, mu_central) {
  assertPositiveNumber("r_origin", r_origin);
  assertPositiveNumber("r_target", r_target);
  assertPositiveNumber("mu_central", mu_central);

  const aT = (r_origin + r_target) / 2;
  const T_transfer = Math.PI * Math.sqrt(aT * aT * aT / mu_central);
  const omega_target = Math.sqrt(mu_central / (r_target * r_target * r_target));
  return Math.PI - omega_target * T_transfer;
}

// Wait time at the target so the return Hohmann arrives at origin's *actual*
// position (not just orbital radius). Closure condition at return launch t_L:
//   θ_origin(t_L + T_transfer) ≡ θ_target(t_L) + π   (mod 2π)
// because a return Hohmann from r_target to r_origin sweeps exactly π radians.
//
// Returns the smallest non-negative wait such that t_arrival + wait satisfies
// the condition. Earth→Moon is special-cased: Earth is the central body for
// the Moon trip and has no orbital phase to wait for, so the wait is 0.
export function returnWaitTime(originBody, targetBody, t_arrival) {
  assertNonNegativeNumber("t_arrival", t_arrival);

  const origin = resolveBody(originBody, "originBody");
  const target = resolveBody(targetBody, "targetBody");
  const O = assertOrbitBody("originBody", origin.value);
  const T = assertOrbitBody("targetBody", target.value);
  const oKey = origin.key;
  const tKey = target.key;

  if (oKey === 'earth' && tKey === 'moon') return 0;

  const mu = CONSTANTS.sun.mu;
  const r1 = O.orbitRadius;
  const r2 = T.orbitRadius;
  const aT = (r1 + r2) / 2;
  const T_transfer = Math.PI * Math.sqrt(aT * aT * aT / mu);
  const w_origin = Math.sqrt(mu / (r1 * r1 * r1));
  const w_target = Math.sqrt(mu / (r2 * r2 * r2));

  const origin_phase_0 = 0;
  const target_phase_0 = hohmannPhaseAngle(r1, r2, mu);

  // f(t) = θ_origin(t + T_transfer) − θ_target(t) − π
  //      = (origin_phase_0 − target_phase_0 − π + w_origin·T_transfer)
  //        + (w_origin − w_target) · t
  // Need f(t_L) ≡ 0 (mod 2π), t_L ≥ t_arrival, smallest such t_L.
  const offset = origin_phase_0 - target_phase_0 - Math.PI + w_origin * T_transfer;
  const slope  = w_origin - w_target;

  if (Math.abs(slope) < 1e-20) return 0;

  const TWOPI = 2 * Math.PI;
  // slope · t_L = -offset + 2π·k  →  t_L = (-offset + 2π·k) / slope
  let k = Math.round((t_arrival * slope + offset) / TWOPI);
  let t_launch = (-offset + TWOPI * k) / slope;
  if (slope > 0) {
    while (t_launch < t_arrival) { k += 1; t_launch = (-offset + TWOPI * k) / slope; }
  } else {
    while (t_launch < t_arrival) { k -= 1; t_launch = (-offset + TWOPI * k) / slope; }
  }
  return t_launch - t_arrival;
}

// Loose-closure miss for flyby missions: signed angle from Earth to spacecraft
// at return arrival, in radians. Positive = spacecraft is angularly ahead of
// Earth (counter-clockwise of Earth in the orbital plane).
export function returnAngleMiss(returnArrivalState, earthState_at_arrival) {
  assertState(returnArrivalState);
  assertState(earthState_at_arrival);

  const sx = returnArrivalState.r[0], sy = returnArrivalState.r[1];
  const ex = earthState_at_arrival.r[0], ey = earthState_at_arrival.r[1];
  if (Math.hypot(sx, sy) === 0 || Math.hypot(ex, ey) === 0) {
    throw new RangeError("returnAngleMiss requires non-zero position vectors");
  }
  const cross = ex * sy - ey * sx;
  const dot   = ex * sx + ey * sy;
  return Math.atan2(cross, dot);
}
