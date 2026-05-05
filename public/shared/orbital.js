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

const TWO_PI = 2 * Math.PI;

function cloneState(state) {
  return { r: [state.r[0], state.r[1]], v: [state.v[0], state.v[1]] };
}

function subtractVector(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}

function vectorMagnitude(v) {
  return Math.hypot(v[0], v[1]);
}

function rotateVector(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    v[0] * c - v[1] * s,
    v[0] * s + v[1] * c
  ];
}

function rotateState(state, angle) {
  return {
    r: rotateVector(state.r, angle),
    v: rotateVector(state.v, angle)
  };
}

function vectorAngle(v) {
  assertVector2("vector", v);
  if (vectorMagnitude(v) === 0) {
    throw new RangeError("vector magnitude must be greater than 0");
  }
  return Math.atan2(v[1], v[0]);
}

function circularVelocityAt(position, mu) {
  assertVector2("position", position);
  assertPositiveNumber("mu", mu);
  const r = vectorMagnitude(position);
  if (r === 0) {
    throw new RangeError("position magnitude must be greater than 0");
  }
  const speed = Math.sqrt(mu / r);
  return [-position[1] / r * speed, position[0] / r * speed];
}

function makeState(r, v) {
  return { r: [r[0], r[1]], v: [v[0], v[1]] };
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

// Normalize to [-π, π). This is the display/closure convention used by the
// mission planner when reporting angular misses.
export function normalizeAngle(angle) {
  assertFiniteNumber("angle", angle);
  let normalized = ((angle + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  if (Object.is(normalized, -0)) normalized = 0;
  return normalized;
}

// Signed angle from vector a to vector b. Positive means b is counter-clockwise
// from a in the 2D orbital plane.
export function signedAngleBetween(a, b) {
  assertVector2("a", a);
  assertVector2("b", b);
  if (vectorMagnitude(a) === 0 || vectorMagnitude(b) === 0) {
    throw new RangeError("signedAngleBetween requires non-zero vectors");
  }
  const cross = a[0] * b[1] - a[1] * b[0];
  const dot = a[0] * b[0] + a[1] * b[1];
  return normalizeAngle(Math.atan2(cross, dot));
}

// Circular ephemeris for a body orbiting counter-clockwise around the origin.
export function circularOrbitState(radius, mu, t, phase0 = 0) {
  assertPositiveNumber("radius", radius);
  assertPositiveNumber("mu", mu);
  assertFiniteNumber("t", t);
  assertFiniteNumber("phase0", phase0);

  const omega = Math.sqrt(mu / (radius * radius * radius));
  const theta = phase0 + omega * t;
  const speed = Math.sqrt(mu / radius);
  return {
    r: [radius * Math.cos(theta), radius * Math.sin(theta)],
    v: [-speed * Math.sin(theta), speed * Math.cos(theta)]
  };
}

// Endpoint state on the Hohmann transfer ellipse whose departure point is +x.
// The transfer sweeps counter-clockwise through the upper half-plane.
export function hohmannTransferState(r1, r2, mu, endpoint) {
  assertPositiveNumber("r1", r1);
  assertPositiveNumber("r2", r2);
  assertPositiveNumber("mu", mu);
  if (endpoint !== "departure" && endpoint !== "arrival") {
    throw new RangeError("endpoint must be 'departure' or 'arrival'");
  }

  const transfer = hohmannTransfer(r1, r2, mu);
  const vDeparture = visViva(r1, transfer.semiMajorAxis, mu);
  const vArrival = visViva(r2, transfer.semiMajorAxis, mu);

  if (endpoint === "departure") {
    return { r: [r1, 0], v: [0, vDeparture] };
  }
  return { r: [-r2, 0], v: [0, -vArrival] };
}

// Signed Hohmann burn directions relative to local circular prograde velocity.
// Outer transfers speed up (+1); inner transfers slow down (-1).
export function signedHohmannDeltaV(r1, r2, mu) {
  assertPositiveNumber("r1", r1);
  assertPositiveNumber("r2", r2);
  assertPositiveNumber("mu", mu);

  const sqrtMuR1 = Math.sqrt(mu / r1);
  const sqrtMuR2 = Math.sqrt(mu / r2);
  const rawDv1 = sqrtMuR1 * (Math.sqrt(2 * r2 / (r1 + r2)) - 1);
  const rawDv2 = sqrtMuR2 * (1 - Math.sqrt(2 * r1 / (r1 + r2)));
  return {
    dv1: Math.abs(rawDv1),
    dv2: Math.abs(rawDv2),
    direction1: Math.sign(rawDv1),
    direction2: Math.sign(rawDv2),
    isInnerTransfer: r2 < r1
  };
}

export function hyperbolicDeflectionAngle(periapsis, vInfinity, mu) {
  assertPositiveNumber("periapsis", periapsis);
  assertPositiveNumber("vInfinity", vInfinity);
  assertPositiveNumber("mu", mu);

  return 2 * Math.asin(1 / (1 + periapsis * vInfinity * vInfinity / mu));
}

// Convert between an inertial state and a moving frame with both origin offset
// and frame velocity. direction='toFrame' subtracts the moving frame; direction
// ='fromFrame' adds it back.
export function transformFrameWithOrigin(state, framePosition, frameVelocity, direction) {
  assertState(state);
  assertVector2("framePosition", framePosition);
  assertVector2("frameVelocity", frameVelocity);
  if (direction !== "toFrame" && direction !== "fromFrame") {
    throw new RangeError("direction must be 'toFrame' or 'fromFrame'");
  }

  const sign = direction === "toFrame" ? -1 : 1;
  return {
    r: [
      state.r[0] + sign * framePosition[0],
      state.r[1] + sign * framePosition[1]
    ],
    v: [
      state.v[0] + sign * frameVelocity[0],
      state.v[1] + sign * frameVelocity[1]
    ]
  };
}

function assertMissionBody(name, key, allowed) {
  if (typeof key !== "string" || !allowed.includes(key)) {
    throw new RangeError(`${name} must be one of: ${allowed.join(", ")}`);
  }
  return CONSTANTS[key];
}

function assertMissionOptions(options) {
  if (options === undefined) return {};
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options must be an object when provided");
  }
  return options;
}

function sampleLine(start, end, count = 2) {
  const points = [];
  const steps = Math.max(2, count);
  for (let i = 0; i < steps; i++) {
    const f = i / (steps - 1);
    points.push([
      start[0] + (end[0] - start[0]) * f,
      start[1] + (end[1] - start[1]) * f
    ]);
  }
  return points;
}

function propagateForDuration(startState, mu, duration, dt) {
  assertState(startState);
  assertPositiveNumber("mu", mu);
  assertNonNegativeNumber("duration", duration);
  assertPositiveNumber("dt", dt);

  const points = [startState.r];
  let state = cloneState(startState);
  let elapsed = 0;
  while (elapsed < duration - 1e-9) {
    const step = Math.min(dt, duration - elapsed);
    state = propagate(state, mu, step);
    elapsed += step;
    points.push(state.r);
  }
  return { endState: state, points, dt };
}

function sampleHohmannArc(startState, r1, r2, mu, duration) {
  const profile = closedOrbitDt(Math.min(r1, r2), Math.max(r1, r2), mu);
  return propagateForDuration(startState, mu, duration, profile.dt);
}

function orbitalElements(state, mu) {
  assertState(state);
  assertPositiveNumber("mu", mu);

  const r = vectorMagnitude(state.r);
  const v2 = state.v[0] * state.v[0] + state.v[1] * state.v[1];
  const rv = state.r[0] * state.v[0] + state.r[1] * state.v[1];
  const energy = 0.5 * v2 - mu / r;
  if (energy >= 0) {
    return { bound: false, radius: r, speed: Math.sqrt(v2), energy };
  }

  const semiMajorAxis = -mu / (2 * energy);
  const evec = [
    ((v2 - mu / r) * state.r[0] - rv * state.v[0]) / mu,
    ((v2 - mu / r) * state.r[1] - rv * state.v[1]) / mu
  ];
  const eccentricity = vectorMagnitude(evec);
  const periapsis = semiMajorAxis * (1 - eccentricity);
  const apoapsis = semiMajorAxis * (1 + eccentricity);
  const period = 2 * Math.PI * Math.sqrt(semiMajorAxis * semiMajorAxis * semiMajorAxis / mu);
  return {
    bound: true,
    radius: r,
    speed: Math.sqrt(v2),
    energy,
    semiMajorAxis,
    eccentricity,
    periapsis,
    apoapsis,
    period
  };
}

function interpolateState(a, b, fraction) {
  return {
    r: [
      a.r[0] + (b.r[0] - a.r[0]) * fraction,
      a.r[1] + (b.r[1] - a.r[1]) * fraction
    ],
    v: [
      a.v[0] + (b.v[0] - a.v[0]) * fraction,
      a.v[1] + (b.v[1] - a.v[1]) * fraction
    ]
  };
}

function propagateUntilRadiusCrossing(startState, mu, targetRadius) {
  assertState(startState);
  assertPositiveNumber("mu", mu);
  assertPositiveNumber("targetRadius", targetRadius);

  const elements = orbitalElements(startState, mu);
  const radiusTolerance = targetRadius * 0.01;
  if (
    !elements.bound ||
    targetRadius < elements.periapsis - radiusTolerance ||
    targetRadius > elements.apoapsis + radiusTolerance
  ) {
    return {
      crossed: false,
      reason: "target radius is outside the post-flyby heliocentric orbit",
      elements,
      duration: 0,
      endState: cloneState(startState),
      points: [startState.r]
    };
  }

  const profile = closedOrbitDt(elements.periapsis, elements.apoapsis, mu);
  const dt = Math.min(profile.dt, 1800);
  const maxDuration = elements.period * 1.1;
  const points = [startState.r];
  let previous = cloneState(startState);
  let previousTime = 0;
  let previousOffset = vectorMagnitude(previous.r) - targetRadius;
  let closest = cloneState(startState);
  let closestTime = 0;
  let closestAbsOffset = Math.abs(previousOffset);
  let elapsed = 0;

  while (elapsed < maxDuration - 1e-9) {
    const step = Math.min(dt, maxDuration - elapsed);
    const current = propagate(previous, mu, step);
    elapsed += step;
    const currentOffset = vectorMagnitude(current.r) - targetRadius;
    const currentAbsOffset = Math.abs(currentOffset);
    if (currentAbsOffset < closestAbsOffset) {
      closest = current;
      closestTime = elapsed;
      closestAbsOffset = currentAbsOffset;
    }

    if (previousOffset === 0 || previousOffset * currentOffset <= 0) {
      const denominator = Math.abs(previousOffset) + Math.abs(currentOffset);
      const fraction = denominator === 0 ? 0 : Math.abs(previousOffset) / denominator;
      const crossingState = interpolateState(previous, current, fraction);
      points.push(crossingState.r);
      return {
        crossed: true,
        duration: previousTime + step * fraction,
        endState: crossingState,
        points,
        elements,
        dt
      };
    }

    points.push(current.r);
    previous = current;
    previousTime = elapsed;
    previousOffset = currentOffset;
  }

  if (closestAbsOffset <= radiusTolerance) {
    points.push(closest.r);
    return {
      crossed: true,
      duration: closestTime,
      endState: closest,
      points,
      elements,
      dt,
      radiusToleranceUsed: true
    };
  }

  return {
    crossed: false,
    reason: "no target-radius crossing found within one post-flyby orbit",
    elements,
    duration: maxDuration,
    endState: previous,
    points,
    dt
  };
}

function movingBodyState(orbitRadius, centralMu, absoluteTime, phase0) {
  return circularOrbitState(orbitRadius, centralMu, absoluteTime, phase0);
}

function propagateUntilMovingSoiEntry(startState, centralMu, duration, targetBody, targetPhase0, absoluteStartTime) {
  assertState(startState);
  assertPositiveNumber("centralMu", centralMu);
  assertPositiveNumber("duration", duration);
  assertPositiveNumber("targetBody.orbitRadius", targetBody.orbitRadius);
  assertPositiveNumber("targetBody.soi", targetBody.soi);
  assertFiniteNumber("targetPhase0", targetPhase0);
  assertFiniteNumber("absoluteStartTime", absoluteStartTime);

  const steps = 20000;
  const dt = duration / steps;
  const points = [startState.r];
  let previous = cloneState(startState);
  let previousTime = 0;
  let previousBody = movingBodyState(targetBody.orbitRadius, centralMu, absoluteStartTime, targetPhase0);
  let previousDistance = vectorMagnitude(subtractVector(previous.r, previousBody.r));
  let closest = {
    state: cloneState(previous),
    time: 0,
    distance: previousDistance
  };

  for (let i = 0; i < steps; i++) {
    const current = propagate(previous, centralMu, dt);
    const currentTime = previousTime + dt;
    const currentBody = movingBodyState(targetBody.orbitRadius, centralMu, absoluteStartTime + currentTime, targetPhase0);
    const currentDistance = vectorMagnitude(subtractVector(current.r, currentBody.r));

    if (currentDistance < closest.distance) {
      closest = {
        state: cloneState(current),
        time: currentTime,
        distance: currentDistance
      };
    }

    if (previousDistance > targetBody.soi && currentDistance <= targetBody.soi) {
      const fraction = (previousDistance - targetBody.soi) / (previousDistance - currentDistance);
      const crossingState = interpolateState(previous, current, fraction);
      const crossingTime = previousTime + dt * fraction;
      points.push(crossingState.r);
      return {
        crossed: true,
        duration: crossingTime,
        endState: crossingState,
        points,
        dt,
        bodyState: movingBodyState(targetBody.orbitRadius, centralMu, absoluteStartTime + crossingTime, targetPhase0)
      };
    }

    points.push(current.r);
    previous = current;
    previousTime = currentTime;
    previousDistance = currentDistance;
  }

  return {
    crossed: false,
    reason: "no target SOI crossing found along outbound coast",
    duration: closest.time,
    endState: closest.state,
    points,
    dt,
    closestDistance: closest.distance,
    bodyState: movingBodyState(targetBody.orbitRadius, centralMu, absoluteStartTime + closest.time, targetPhase0)
  };
}

function hyperbolicHalfTraversal(periapsis, vInfinity, mu, soi, branch, velocityDirection, maxPoints = 900) {
  assertPositiveNumber("periapsis", periapsis);
  assertPositiveNumber("vInfinity", vInfinity);
  assertPositiveNumber("mu", mu);
  assertPositiveNumber("soi", soi);
  assertVector2("velocityDirection", velocityDirection);
  if (soi <= periapsis) {
    throw new RangeError("soi must be greater than periapsis");
  }
  if (branch !== "arrival" && branch !== "departure") {
    throw new RangeError("branch must be 'arrival' or 'departure'");
  }

  const eccentricity = 1 + periapsis * vInfinity * vInfinity / mu;
  const p = periapsis * (1 + eccentricity);
  const h = Math.sqrt(mu * p);
  const cosNu = (p / soi - 1) / eccentricity;
  const clampedCosNu = Math.max(-1, Math.min(1, cosNu));
  const nu0 = Math.acos(clampedCosNu);

  const stateAtTrueAnomaly = (nu) => {
    const r = p / (1 + eccentricity * Math.cos(nu));
    return {
      r: [r * Math.cos(nu), r * Math.sin(nu)],
      v: [
        -mu / h * Math.sin(nu),
        mu / h * (eccentricity + Math.cos(nu))
      ]
    };
  };

  const hyperbolicAnomaly = (nu) => {
    const factor = Math.sqrt((eccentricity - 1) / (eccentricity + 1));
    return 2 * Math.atanh(factor * Math.tan(nu / 2));
  };

  const aAbs = mu / (vInfinity * vInfinity);
  const F = hyperbolicAnomaly(nu0);
  const mean = eccentricity * Math.sinh(F) - F;
  const duration = Math.sqrt(aAbs * aAbs * aAbs / mu) * mean;
  const baseStart = branch === "arrival" ? stateAtTrueAnomaly(-nu0) : stateAtTrueAnomaly(0);
  const baseReference = branch === "arrival" ? baseStart.v : stateAtTrueAnomaly(nu0).v;
  const rotation = vectorAngle(velocityDirection) - vectorAngle(baseReference);
  const solveAnomaly = (targetMean) => {
    let estimate = Math.asinh(targetMean / eccentricity);
    for (let i = 0; i < 12; i++) {
      const value = eccentricity * Math.sinh(estimate) - estimate - targetMean;
      const slope = eccentricity * Math.cosh(estimate) - 1;
      estimate -= value / slope;
    }
    return estimate;
  };
  const trueAnomalyFromHyperbolic = (anomaly) => {
    const factor = Math.sqrt((eccentricity + 1) / (eccentricity - 1));
    return 2 * Math.atan(factor * Math.tanh(anomaly / 2));
  };
  const count = Math.max(2, maxPoints);
  const states = [];
  for (let i = 0; i < count; i++) {
    const fraction = i / (count - 1);
    const targetMean = branch === "arrival"
      ? -mean * (1 - fraction)
      : mean * fraction;
    states.push(rotateState(stateAtTrueAnomaly(trueAnomalyFromHyperbolic(solveAnomaly(targetMean))), rotation));
  }

  return {
    startState: states[0],
    endState: states[states.length - 1],
    duration,
    points: states.map((state) => state.r),
    integrator: "analytic",
    periapsis,
    vInfinity,
    eccentricity
  };
}

function sampleCircularArc(radius, mu, duration, startPhase = 0, maxPoints = 1200) {
  assertPositiveNumber("radius", radius);
  assertPositiveNumber("mu", mu);
  assertNonNegativeNumber("duration", duration);
  assertFiniteNumber("startPhase", startPhase);

  const count = duration === 0 ? 2 : Math.min(maxPoints, Math.max(2, Math.ceil(duration / 7200)));
  const points = [];
  for (let i = 0; i < count; i++) {
    const t = duration * i / (count - 1);
    points.push(circularOrbitState(radius, mu, t, startPhase).r);
  }
  return points;
}

function makeSegment(type, frame, mu, startState, endState, duration, deltaV, points) {
  assertState(startState);
  assertState(endState);
  assertPositiveNumber("mu", mu);
  assertNonNegativeNumber("duration", duration);
  assertNonNegativeNumber("deltaV", deltaV);
  return {
    type,
    frame,
    mu,
    startState: cloneState(startState),
    endState: cloneState(endState),
    duration,
    deltaV,
    points: points && points.length ? points.map((p) => [p[0], p[1]]) : [startState.r, endState.r]
  };
}

function withIntegrationDt(segment, propagation) {
  if (propagation && propagation.dt) segment.integrationDt = propagation.dt;
  return segment;
}

function rk4Step(state, mu, dt) {
  const derivative = (s) => {
    const r = vectorMagnitude(s.r);
    if (r === 0) {
      throw new RangeError("state.r magnitude must be greater than 0");
    }
    const r3 = r * r * r;
    return {
      r: [s.v[0], s.v[1]],
      v: [-mu * s.r[0] / r3, -mu * s.r[1] / r3]
    };
  };
  const addScaled = (s, k, scale) => ({
    r: [s.r[0] + k.r[0] * scale, s.r[1] + k.r[1] * scale],
    v: [s.v[0] + k.v[0] * scale, s.v[1] + k.v[1] * scale]
  });

  const k1 = derivative(state);
  const k2 = derivative(addScaled(state, k1, dt / 2));
  const k3 = derivative(addScaled(state, k2, dt / 2));
  const k4 = derivative(addScaled(state, k3, dt));

  return {
    r: [
      state.r[0] + dt / 6 * (k1.r[0] + 2 * k2.r[0] + 2 * k3.r[0] + k4.r[0]),
      state.r[1] + dt / 6 * (k1.r[1] + 2 * k2.r[1] + 2 * k3.r[1] + k4.r[1])
    ],
    v: [
      state.v[0] + dt / 6 * (k1.v[0] + 2 * k2.v[0] + 2 * k3.v[0] + k4.v[0]),
      state.v[1] + dt / 6 * (k1.v[1] + 2 * k2.v[1] + 2 * k3.v[1] + k4.v[1])
    ]
  };
}

function hyperbolicTraversal(periapsis, vInfinity, mu, soi, turnSign = 1, maxPoints = 900) {
  assertPositiveNumber("periapsis", periapsis);
  assertPositiveNumber("vInfinity", vInfinity);
  assertPositiveNumber("mu", mu);
  assertPositiveNumber("soi", soi);
  if (soi <= periapsis) {
    throw new RangeError("soi must be greater than periapsis");
  }

  const sign = turnSign < 0 ? -1 : 1;
  const eccentricity = 1 + periapsis * vInfinity * vInfinity / mu;
  const p = periapsis * (1 + eccentricity);
  const h = Math.sqrt(mu * p);
  const cosNu = (p / soi - 1) / eccentricity;
  const clampedCosNu = Math.max(-1, Math.min(1, cosNu));
  const nu0 = Math.acos(clampedCosNu);

  const stateAtTrueAnomaly = (nu) => {
    const r = p / (1 + eccentricity * Math.cos(nu));
    return {
      r: [r * Math.cos(nu), sign * r * Math.sin(nu)],
      v: [
        -mu / h * Math.sin(nu),
        sign * mu / h * (eccentricity + Math.cos(nu))
      ]
    };
  };

  const hyperbolicAnomaly = (nu) => {
    const factor = Math.sqrt((eccentricity - 1) / (eccentricity + 1));
    return 2 * Math.atanh(factor * Math.tan(nu / 2));
  };

  const aAbs = mu / (vInfinity * vInfinity);
  const F = hyperbolicAnomaly(nu0);
  const mean = eccentricity * Math.sinh(F) - F;
  const halfDuration = Math.sqrt(aAbs * aAbs * aAbs / mu) * mean;
  const duration = 2 * halfDuration;
  const startState = stateAtTrueAnomaly(-nu0);
  const analyticEndState = stateAtTrueAnomaly(nu0);

  // Stage 3b starts with the spec's t_traverse/2000 Euler policy. This exact
  // hyperbolic setup passes the 5% deflection gate, so RK4 remains dormant.
  const steps = 2000;
  const dt = duration / steps;
  const stride = Math.max(1, Math.floor(steps / maxPoints));
  const points = [startState.r];
  let propagated = cloneState(startState);
  for (let i = 0; i < steps; i++) {
    propagated = propagate(propagated, mu, dt);
    if ((i + 1) % stride === 0 || i === steps - 1) {
      points.push(propagated.r);
    }
  }

  const propagatedDeflection = Math.abs(signedAngleBetween(startState.v, propagated.v));
  const analyticalDeflection = hyperbolicDeflectionAngle(periapsis, vInfinity, mu);
  const error = Math.abs(propagatedDeflection - analyticalDeflection) / analyticalDeflection;

  if (error <= 0.05) {
    return {
      startState,
      endState: propagated,
      duration,
      points,
      analyticalDeflection,
      propagatedDeflection,
      integrator: "euler-cromer"
    };
  }

  // Pre-authorized Stage 3b fallback: hyperbolic segments only.
  points.length = 1;
  points[0] = startState.r;
  propagated = cloneState(startState);
  for (let i = 0; i < steps; i++) {
    propagated = rk4Step(propagated, mu, dt);
    if ((i + 1) % stride === 0 || i === steps - 1) {
      points.push(propagated.r);
    }
  }

  return {
    startState,
    endState: propagated,
    duration,
    points,
    analyticalDeflection,
    propagatedDeflection: Math.abs(signedAngleBetween(startState.v, propagated.v)),
    integrator: "rk4",
    analyticEndState
  };
}

function rotateTraversalToIncoming(traversal, incomingVelocity) {
  const incomingAngle = vectorAngle(incomingVelocity);
  const baseAngle = vectorAngle(traversal.startState.v);
  const rotation = incomingAngle - baseAngle;
  return {
    startState: rotateState(traversal.startState, rotation),
    endState: rotateState(traversal.endState, rotation),
    duration: traversal.duration,
    points: traversal.points.map((p) => rotateVector(p, rotation)),
    analyticalDeflection: traversal.analyticalDeflection,
    propagatedDeflection: traversal.propagatedDeflection,
    integrator: traversal.integrator
  };
}

function smallestNonNegativeWait(originPhase0, targetPhase0, rOrigin, rTarget, mu, tArrival) {
  const transfer = hohmannTransfer(rTarget, rOrigin, mu);
  const wOrigin = Math.sqrt(mu / (rOrigin * rOrigin * rOrigin));
  const wTarget = Math.sqrt(mu / (rTarget * rTarget * rTarget));
  const offset = originPhase0 - targetPhase0 - Math.PI + wOrigin * transfer.transferTime;
  const slope = wOrigin - wTarget;
  if (Math.abs(slope) < 1e-20) return 0;

  let k = Math.round((tArrival * slope + offset) / TWO_PI);
  let tLaunch = (-offset + TWO_PI * k) / slope;
  if (slope > 0) {
    while (tLaunch < tArrival) {
      k += 1;
      tLaunch = (-offset + TWO_PI * k) / slope;
    }
  } else {
    while (tLaunch < tArrival) {
      k -= 1;
      tLaunch = (-offset + TWO_PI * k) / slope;
    }
  }
  return tLaunch - tArrival;
}

function segmentEndTime(segments) {
  return segments.reduce((sum, segment) => sum + segment.duration, 0);
}

function pushEvent(events, t, label) {
  events.push({ t, label });
}

function bodyStateAroundSun(bodyKey, t, phase0 = 0) {
  return circularOrbitState(CONSTANTS[bodyKey].orbitRadius, CONSTANTS.sun.mu, t, phase0);
}

function lowOrbitState(radius, bodyMu, phase = 0) {
  const r = [radius * Math.cos(phase), radius * Math.sin(phase)];
  return { r, v: circularVelocityAt(r, bodyMu) };
}

function earthArrivalDeltaV() {
  // Stage 3b convention: Earth arrival speed is an energy/safety marker, not a
  // propulsive burn. V3 stops at Earth-return geometry and does not model
  // atmospheric reentry, aerocapture, or propulsive Earth-orbit capture.
  return 0;
}

function makeEarthArrivalSegment(startState, endState, originMu, options = {}) {
  const arrivalGeocentricSpeed = vectorMagnitude(startState.v);
  const closureGapDistance = vectorMagnitude(subtractVector(startState.r, endState.r));
  const gapDuration = closureGapDistance > 0 && arrivalGeocentricSpeed > 0
    ? closureGapDistance / arrivalGeocentricSpeed
    : 0;
  const duration = options.markResidualGap ? gapDuration : 0;
  const segment = makeSegment(
    "earth_arrival",
    "geocentric",
    originMu,
    startState,
    endState,
    duration,
    earthArrivalDeltaV(),
    sampleLine(startState.r, endState.r, 2)
  );
  segment.arrivalGeocentricSpeed = arrivalGeocentricSpeed;
  segment.closureGapDistance = closureGapDistance;
  if (options.markResidualGap) {
    segment.closureMarker = "residual_gap";
    segment.closureGapDuration = gapDuration;
  }
  if (options.returnPropagationNote) {
    segment.returnPropagationNote = options.returnPropagationNote;
  }
  return segment;
}

function planInterplanetaryMission(originKey, targetKey, missionType, options) {
  const origin = CONSTANTS[originKey];
  const target = CONSTANTS[targetKey];
  const centralMu = CONSTANTS.sun.mu;
  const parkingOrbitAltitude = options.parkingOrbitAltitude ?? 400;
  const targetOrbitAltitude = options.targetOrbitAltitude ?? 400;
  const flybyPeriapsisRatio = options.flybyPeriapsisRatio ?? 1.1;
  const t0 = options.t0 ?? 0;
  const surfaceDwellDuration = options.surfaceDwellDuration ?? 0;
  assertNonNegativeNumber("parkingOrbitAltitude", parkingOrbitAltitude);
  assertNonNegativeNumber("targetOrbitAltitude", targetOrbitAltitude);
  assertPositiveNumber("flybyPeriapsisRatio", flybyPeriapsisRatio);
  assertFiniteNumber("t0", t0);
  assertNonNegativeNumber("surfaceDwellDuration", surfaceDwellDuration);

  const originParkingRadius = origin.radius + parkingOrbitAltitude;
  const targetParkingRadius = target.radius + targetOrbitAltitude;
  const outbound = hohmannTransfer(origin.orbitRadius, target.orbitRadius, centralMu);
  const originOmega = Math.sqrt(centralMu / Math.pow(origin.orbitRadius, 3));
  const targetOmega = Math.sqrt(centralMu / Math.pow(target.orbitRadius, 3));
  const originPhase0 = 0;
  const launchOriginAngle = originPhase0 + originOmega * t0;
  const targetPhase0 = launchOriginAngle +
    hohmannPhaseAngle(origin.orbitRadius, target.orbitRadius, centralMu) -
    targetOmega * t0;

  const segments = [];
  const events = [];
  const originAtLaunch = bodyStateAroundSun(originKey, t0, originPhase0);
  const departureState = rotateState(
    hohmannTransferState(origin.orbitRadius, target.orbitRadius, centralMu, "departure"),
    launchOriginAngle
  );
  const originParkingStart = lowOrbitState(originParkingRadius, origin.mu, 0);
  let outboundVInfinity = subtractVector(departureState.v, originAtLaunch.v);
  let earthDepartureEnd = makeState(originParkingStart.r, outboundVInfinity);
  let outboundStart = transformFrameWithOrigin(
    earthDepartureEnd,
    originAtLaunch.r,
    originAtLaunch.v,
    "fromFrame"
  );
  const arrivalAbsTime = t0 + outbound.transferTime;
  const targetAtArrival = circularOrbitState(target.orbitRadius, centralMu, arrivalAbsTime, targetPhase0);
  const outboundCoast = sampleHohmannArc(
    outboundStart,
    origin.orbitRadius,
    target.orbitRadius,
    centralMu,
    outbound.transferTime
  );
  outboundVInfinity = subtractVector(outboundStart.v, originAtLaunch.v);
  earthDepartureEnd = makeState(originParkingStart.r, outboundVInfinity);
  const earthDepartureDv = escapeBurn(originParkingRadius, vectorMagnitude(outboundVInfinity), origin.mu);
  pushEvent(events, 0, "TLI burn");
  segments.push(makeSegment(
    "earth_departure",
    "geocentric",
    origin.mu,
    originParkingStart,
    earthDepartureEnd,
    0,
    earthDepartureDv,
    sampleLine(originParkingStart.r, earthDepartureEnd.r, 2)
  ));

  if (missionType === "flyby") {
    const arrivalLocal = transformFrameWithOrigin(outboundCoast.endState, targetAtArrival.r, targetAtArrival.v, "toFrame");
    const incomingVInfinity = arrivalLocal.v;
    const flybyPeriapsis = flybyPeriapsisRatio * target.radius;
    const turnSign = target.orbitRadius > origin.orbitRadius ? 1 : -1;
    const traversal = rotateTraversalToIncoming(
      hyperbolicTraversal(flybyPeriapsis, vectorMagnitude(incomingVInfinity), target.mu, target.soi, turnSign),
      incomingVInfinity
    );
    const flybyStart = makeState(arrivalLocal.r, arrivalLocal.v);
    const outboundEnd = transformFrameWithOrigin(flybyStart, targetAtArrival.r, targetAtArrival.v, "fromFrame");
    segments.push(withIntegrationDt(makeSegment(
      "heliocentric_outbound",
      "heliocentric",
      centralMu,
      outboundStart,
      outboundEnd,
      outbound.transferTime,
      0,
      outboundCoast.points
    ), outboundCoast));
    pushEvent(events, segmentEndTime(segments), "target SOI crossing");

    const flybyStartTime = segmentEndTime(segments);
    segments.push({
      ...makeSegment(
        "flyby_arc",
        "target-centric",
        target.mu,
        flybyStart,
        traversal.endState,
        traversal.duration,
        0,
        [flybyStart.r, ...traversal.points.slice(1)]
      ),
      periapsis: flybyPeriapsis,
      analyticalDeflection: traversal.analyticalDeflection,
      propagatedDeflection: traversal.propagatedDeflection,
      integrator: traversal.integrator
    });
    pushEvent(events, flybyStartTime + traversal.duration / 2, "flyby periapsis");

    const returnStartAbsTime = t0 + segmentEndTime(segments);
    const targetAtReturnStart = circularOrbitState(target.orbitRadius, centralMu, returnStartAbsTime, targetPhase0);
    let returnStart = transformFrameWithOrigin(
      traversal.endState,
      targetAtReturnStart.r,
      targetAtReturnStart.v,
      "fromFrame"
    );
    let returnCrossing = propagateUntilRadiusCrossing(returnStart, centralMu, origin.orbitRadius);
    if (!returnCrossing.crossed) {
      const unbentDuringEncounter = propagateForDuration(
        outboundCoast.endState,
        centralMu,
        traversal.duration,
        closedOrbitDt(outbound.periapsis, outbound.apoapsis, centralMu).dt
      );
      const fallbackStart = unbentDuringEncounter.endState;
      returnCrossing = propagateUntilRadiusCrossing(fallbackStart, centralMu, origin.orbitRadius);
      returnStart = fallbackStart;
      returnCrossing.fallbackReason =
        "full 1.1-radius Mars/Venus flyby did not cross Earth's orbit; used unbent post-encounter conic for loose-return marker";
      const flybyEndForReturn = transformFrameWithOrigin(returnStart, targetAtReturnStart.r, targetAtReturnStart.v, "toFrame");
      const flybySegment = segments[segments.length - 1];
      flybySegment.endState = cloneState(flybyEndForReturn);
      flybySegment.points[flybySegment.points.length - 1] = flybyEndForReturn.r;
    }
    const returnDuration = returnCrossing.duration;
    const returnArrivalAbsTime = returnStartAbsTime + returnDuration;
    const returnEnd = returnCrossing.endState;
    segments.push(withIntegrationDt(makeSegment(
      "heliocentric_return",
      "heliocentric",
      centralMu,
      returnStart,
      returnEnd,
      returnDuration,
      0,
      returnCrossing.points
    ), returnCrossing));

    const earthAtArrival = bodyStateAroundSun(originKey, returnArrivalAbsTime, originPhase0);
    const earthArrivalStart = transformFrameWithOrigin(returnEnd, earthAtArrival.r, earthAtArrival.v, "toFrame");
    const earthArrivalEnd = lowOrbitState(originParkingRadius, origin.mu, 0);
    const earthArrivalSegment = makeEarthArrivalSegment(earthArrivalStart, earthArrivalEnd, origin.mu, {
      returnPropagationNote: returnCrossing.fallbackReason
    });
    segments.push(earthArrivalSegment);
    pushEvent(events, segmentEndTime(segments), "Earth arrival");

    const totalDeltaV = segments.reduce((sum, segment) => sum + segment.deltaV, 0);
    const totalDuration = segmentEndTime(segments);
    return {
      segments,
      totalDeltaV,
      totalDuration,
      returnWaitDuration: 0,
      returnAngleMiss: returnAngleMiss(returnEnd, earthAtArrival),
      events
    };
  }

  const legacyCaptureStart = transformFrameWithOrigin(outboundCoast.endState, targetAtArrival.r, targetAtArrival.v, "toFrame");
  const outboundEntry = propagateUntilMovingSoiEntry(
    outboundStart,
    centralMu,
    outbound.transferTime,
    target,
    targetPhase0,
    t0
  );
  const arrivalStart = transformFrameWithOrigin(
    outboundEntry.endState,
    outboundEntry.bodyState.r,
    outboundEntry.bodyState.v,
    "toFrame"
  );
  const arrivalTraversal = hyperbolicHalfTraversal(
    targetParkingRadius,
    vectorMagnitude(legacyCaptureStart.v),
    target.mu,
    target.soi,
    "arrival",
    arrivalStart.v
  );
  const outboundEnd = transformFrameWithOrigin(
    arrivalTraversal.startState,
    outboundEntry.bodyState.r,
    outboundEntry.bodyState.v,
    "fromFrame"
  );
  const outboundPoints = outboundEntry.points.slice();
  outboundPoints[outboundPoints.length - 1] = outboundEnd.r;
  const targetParkingStart = makeState(
    arrivalTraversal.endState.r,
    circularVelocityAt(arrivalTraversal.endState.r, target.mu)
  );
  segments.push(makeSegment(
    "heliocentric_outbound",
    "heliocentric",
    centralMu,
    outboundStart,
    outboundEnd,
    outboundEntry.duration,
    0,
    outboundPoints
  ));
  pushEvent(events, segmentEndTime(segments), "target SOI crossing");

  const arrivalSegment = withIntegrationDt(makeSegment(
    "target_arrival",
    "target-centric",
    target.mu,
    arrivalStart,
    arrivalTraversal.endState,
    arrivalTraversal.duration,
    0,
    arrivalTraversal.points
  ), arrivalTraversal);
  arrivalSegment.periapsis = targetParkingRadius;
  arrivalSegment.vInfinity = vectorMagnitude(legacyCaptureStart.v);
  arrivalSegment.integrator = arrivalTraversal.integrator;
  segments.push(arrivalSegment);

  const captureDv = escapeBurn(targetParkingRadius, vectorMagnitude(legacyCaptureStart.v), target.mu);
  segments.push(makeSegment(
    "capture",
    "target-centric",
    target.mu,
    arrivalTraversal.endState,
    targetParkingStart,
    0,
    captureDv,
    sampleLine(arrivalTraversal.endState.r, targetParkingStart.r, 2)
  ));
  pushEvent(events, segmentEndTime(segments), "capture burn");

  const parkingStartPhase = vectorAngle(targetParkingStart.r);
  segments.push(makeSegment(
    "target_orbit",
    "target-centric",
    target.mu,
    targetParkingStart,
    targetParkingStart,
    0,
    0,
    sampleCircularArc(targetParkingRadius, target.mu, 0, parkingStartPhase)
  ));

  let waitStartState = targetParkingStart;
  if (missionType === "touch_return") {
    const surfaceState = { r: [target.radius, 0], v: [0, 0] };
    const tax = CONSTANTS.surfaceDeltaV[targetKey];
    segments.push(makeSegment(
      "descent",
      "target-centric",
      target.mu,
      waitStartState,
      surfaceState,
      0,
      tax / 2,
      sampleLine(waitStartState.r, surfaceState.r, 2)
    ));
    pushEvent(events, segmentEndTime(segments), "descent burn");
    segments.push(makeSegment(
      "surface_dwell",
      "target-centric",
      target.mu,
      surfaceState,
      surfaceState,
      surfaceDwellDuration,
      0,
      sampleLine(surfaceState.r, surfaceState.r, 2)
    ));
    segments.push(makeSegment(
      "ascent",
      "target-centric",
      target.mu,
      surfaceState,
      targetParkingStart,
      0,
      tax / 2,
      sampleLine(surfaceState.r, targetParkingStart.r, 2)
    ));
    pushEvent(events, segmentEndTime(segments), "ascent burn");
    waitStartState = targetParkingStart;
  }

  const waitArrivalAbs = t0 + outbound.transferTime + surfaceDwellDuration;
  const returnWaitDuration = smallestNonNegativeWait(
    originPhase0,
    targetPhase0,
    origin.orbitRadius,
    target.orbitRadius,
    centralMu,
    waitArrivalAbs
  );
  const waitStartPhase = vectorAngle(waitStartState.r);
  const waitEndOrbit = circularOrbitState(targetParkingRadius, target.mu, returnWaitDuration, waitStartPhase);
  segments.push(makeSegment(
    "target_wait",
    "target-centric",
    target.mu,
    waitStartState,
    waitEndOrbit,
    returnWaitDuration,
    0,
    sampleCircularArc(targetParkingRadius, target.mu, returnWaitDuration, waitStartPhase)
  ));
  pushEvent(events, segmentEndTime(segments), "return window opens");

  const returnLaunchAbsTime = t0 + segmentEndTime(segments);
  const targetAtReturnLaunch = circularOrbitState(target.orbitRadius, centralMu, returnLaunchAbsTime, targetPhase0);
  const returnLaunchAngle = vectorAngle(targetAtReturnLaunch.r);
  const returnDepartureState = rotateState(
    hohmannTransferState(target.orbitRadius, origin.orbitRadius, centralMu, "departure"),
    returnLaunchAngle
  );
  const returnVInfinityTarget = subtractVector(returnDepartureState.v, targetAtReturnLaunch.v);
  const departureTraversal = hyperbolicHalfTraversal(
    targetParkingRadius,
    vectorMagnitude(returnVInfinityTarget),
    target.mu,
    target.soi,
    "departure",
    returnVInfinityTarget
  );
  const departureExit = makeState(departureTraversal.endState.r, returnVInfinityTarget);
  const departureEnd = departureTraversal.startState;
  const departureDv = escapeBurn(targetParkingRadius, vectorMagnitude(returnVInfinityTarget), target.mu);
  segments.push(makeSegment(
    "departure",
    "target-centric",
    target.mu,
    waitEndOrbit,
    departureEnd,
    0,
    departureDv,
    sampleLine(waitEndOrbit.r, departureEnd.r, 2)
  ));
  pushEvent(events, segmentEndTime(segments), "departure burn");

  const departureSegment = withIntegrationDt(makeSegment(
    "target_departure",
    "target-centric",
    target.mu,
    departureTraversal.startState,
    departureExit,
    departureTraversal.duration,
    0,
    departureTraversal.points
  ), departureTraversal);
  departureSegment.periapsis = targetParkingRadius;
  departureSegment.vInfinity = vectorMagnitude(returnVInfinityTarget);
  departureSegment.integrator = departureTraversal.integrator;
  segments.push(departureSegment);
  pushEvent(events, segmentEndTime(segments), "target SOI exit");

  const returnStartAbsTime = t0 + segmentEndTime(segments);
  const targetAtReturnExit = circularOrbitState(target.orbitRadius, centralMu, returnStartAbsTime, targetPhase0);
  const returnStart = transformFrameWithOrigin(
    departureExit,
    targetAtReturnExit.r,
    targetAtReturnExit.v,
    "fromFrame"
  );
  const returnCrossing = propagateUntilRadiusCrossing(returnStart, centralMu, origin.orbitRadius);
  const returnDuration = returnCrossing.duration;
  const returnEnd = returnCrossing.endState;
  const returnArrivalAbsTime = returnStartAbsTime + returnDuration;
  const earthAtArrival = bodyStateAroundSun(originKey, returnArrivalAbsTime, originPhase0);
  segments.push(withIntegrationDt(makeSegment(
    "heliocentric_return",
    "heliocentric",
    centralMu,
    returnStart,
    returnEnd,
    returnDuration,
    0,
    returnCrossing.points
  ), returnCrossing));

  const earthArrivalLocalStart = transformFrameWithOrigin(
    returnEnd,
    earthAtArrival.r,
    earthAtArrival.v,
    "toFrame"
  );
  const earthArrivalEnd = lowOrbitState(originParkingRadius, origin.mu, 0);
  const earthArrivalSegment = makeEarthArrivalSegment(earthArrivalLocalStart, earthArrivalEnd, origin.mu, {
    markResidualGap: true,
    returnPropagationNote: returnCrossing.crossed ? undefined : returnCrossing.reason
  });
  segments.push(earthArrivalSegment);
  pushEvent(events, segmentEndTime(segments), "Earth arrival");

  return {
    segments,
    totalDeltaV: segments.reduce((sum, segment) => sum + segment.deltaV, 0),
    totalDuration: segmentEndTime(segments),
    returnWaitDuration,
    returnAngleMiss: returnAngleMiss(returnEnd, earthAtArrival),
    events
  };
}

function planMoonMission(originKey, missionType, options) {
  const origin = CONSTANTS[originKey];
  const moon = CONSTANTS.moon;
  const centralMu = origin.mu;
  const parkingOrbitAltitude = options.parkingOrbitAltitude ?? 400;
  const targetOrbitAltitude = options.targetOrbitAltitude ?? 400;
  const flybyPeriapsisRatio = options.flybyPeriapsisRatio ?? 1.1;
  const t0 = options.t0 ?? 0;
  const surfaceDwellDuration = options.surfaceDwellDuration ?? 0;
  assertNonNegativeNumber("parkingOrbitAltitude", parkingOrbitAltitude);
  assertNonNegativeNumber("targetOrbitAltitude", targetOrbitAltitude);
  assertPositiveNumber("flybyPeriapsisRatio", flybyPeriapsisRatio);
  assertFiniteNumber("t0", t0);
  assertNonNegativeNumber("surfaceDwellDuration", surfaceDwellDuration);

  const originParkingRadius = origin.radius + parkingOrbitAltitude;
  const moonParkingRadius = moon.radius + targetOrbitAltitude;
  const transfer = hohmannTransfer(originParkingRadius, moon.orbitRadius, centralMu);
  const moonOmega = Math.sqrt(centralMu / Math.pow(moon.orbitRadius, 3));
  const moonPhase0 = hohmannPhaseAngle(originParkingRadius, moon.orbitRadius, centralMu) - moonOmega * t0;
  const segments = [];
  const events = [];

  const earthParkingStart = lowOrbitState(originParkingRadius, origin.mu, 0);
  const transferDeparture = hohmannTransferState(originParkingRadius, moon.orbitRadius, centralMu, "departure");
  const earthDepartureEnd = makeState(earthParkingStart.r, transferDeparture.v);
  const translunarCoast = sampleHohmannArc(
    earthDepartureEnd,
    originParkingRadius,
    moon.orbitRadius,
    centralMu,
    transfer.transferTime
  );
  pushEvent(events, 0, "TLI burn");
  segments.push(makeSegment(
    "earth_departure",
    "geocentric",
    origin.mu,
    earthParkingStart,
    earthDepartureEnd,
    0,
    transfer.dv1,
    sampleLine(earthParkingStart.r, earthDepartureEnd.r, 2)
  ));

  const moonArrivalAbsTime = t0 + transfer.transferTime;
  const moonAtArrival = circularOrbitState(moon.orbitRadius, centralMu, moonArrivalAbsTime, moonPhase0);
  if (missionType === "flyby") {
    const arrivalLocal = transformFrameWithOrigin(translunarCoast.endState, moonAtArrival.r, moonAtArrival.v, "toFrame");
    const incomingVInfinity = arrivalLocal.v;
    const traversal = rotateTraversalToIncoming(
      hyperbolicTraversal(flybyPeriapsisRatio * moon.radius, vectorMagnitude(incomingVInfinity), moon.mu, moon.soi, 1),
      incomingVInfinity
    );
    const flybyStart = makeState(arrivalLocal.r, arrivalLocal.v);
    const outboundEnd = transformFrameWithOrigin(flybyStart, moonAtArrival.r, moonAtArrival.v, "fromFrame");
    segments.push(withIntegrationDt(makeSegment(
      "translunar_coast",
      "geocentric",
      centralMu,
      earthDepartureEnd,
      outboundEnd,
      transfer.transferTime,
      0,
      translunarCoast.points
    ), translunarCoast));
    pushEvent(events, segmentEndTime(segments), "Moon SOI crossing");

    const flybyStartTime = segmentEndTime(segments);
    segments.push({
      ...makeSegment(
        "moon_flyby",
        "moon-centric",
        moon.mu,
        flybyStart,
        traversal.endState,
        traversal.duration,
        0,
        [flybyStart.r, ...traversal.points.slice(1)]
      ),
      periapsis: flybyPeriapsisRatio * moon.radius,
      analyticalDeflection: traversal.analyticalDeflection,
      propagatedDeflection: traversal.propagatedDeflection,
      integrator: traversal.integrator
    });
    pushEvent(events, flybyStartTime + traversal.duration / 2, "flyby periapsis");

    const returnStartAbsTime = t0 + segmentEndTime(segments);
    const moonAtReturnStart = circularOrbitState(moon.orbitRadius, centralMu, returnStartAbsTime, moonPhase0);
    let returnStart = transformFrameWithOrigin(traversal.endState, moonAtReturnStart.r, moonAtReturnStart.v, "fromFrame");
    let returnCrossing = propagateUntilRadiusCrossing(returnStart, centralMu, originParkingRadius);
    if (!returnCrossing.crossed) {
      const unbentDuringEncounter = propagateForDuration(
        translunarCoast.endState,
        centralMu,
        traversal.duration,
        closedOrbitDt(transfer.periapsis, transfer.apoapsis, centralMu).dt
      );
      const fallbackStart = unbentDuringEncounter.endState;
      returnCrossing = propagateUntilRadiusCrossing(fallbackStart, centralMu, originParkingRadius);
      returnStart = fallbackStart;
      returnCrossing.fallbackReason =
        "full lunar flyby did not cross the origin parking radius; used unbent post-encounter conic for loose-return marker";
      const flybyEndForReturn = transformFrameWithOrigin(returnStart, moonAtReturnStart.r, moonAtReturnStart.v, "toFrame");
      const flybySegment = segments[segments.length - 1];
      flybySegment.endState = cloneState(flybyEndForReturn);
      flybySegment.points[flybySegment.points.length - 1] = flybyEndForReturn.r;
    }
    const returnDuration = returnCrossing.duration;
    const returnEnd = returnCrossing.endState;
    segments.push(withIntegrationDt(makeSegment(
      "translunar_return",
      "geocentric",
      centralMu,
      returnStart,
      returnEnd,
      returnDuration,
      0,
      returnCrossing.points
    ), returnCrossing));
    const earthArrivalEnd = lowOrbitState(originParkingRadius, origin.mu, 0);
    const earthArrivalSegment = makeEarthArrivalSegment(returnEnd, earthArrivalEnd, origin.mu, {
      returnPropagationNote: returnCrossing.fallbackReason
    });
    segments.push(earthArrivalSegment);
    pushEvent(events, segmentEndTime(segments), "Earth arrival");

    return {
      segments,
      totalDeltaV: segments.reduce((sum, segment) => sum + segment.deltaV, 0),
      totalDuration: segmentEndTime(segments),
      returnWaitDuration: 0,
      returnAngleMiss: signedAngleBetween([originParkingRadius, 0], returnEnd.r),
      events
    };
  }

  const legacyCaptureStart = transformFrameWithOrigin(translunarCoast.endState, moonAtArrival.r, moonAtArrival.v, "toFrame");
  const moonEntry = propagateUntilMovingSoiEntry(
    earthDepartureEnd,
    centralMu,
    transfer.transferTime,
    moon,
    moonPhase0,
    t0
  );
  const moonArrivalStart = transformFrameWithOrigin(
    moonEntry.endState,
    moonEntry.bodyState.r,
    moonEntry.bodyState.v,
    "toFrame"
  );
  const moonArrivalTraversal = hyperbolicHalfTraversal(
    moonParkingRadius,
    vectorMagnitude(legacyCaptureStart.v),
    moon.mu,
    moon.soi,
    "arrival",
    moonArrivalStart.v
  );
  const translunarEnd = transformFrameWithOrigin(
    moonArrivalTraversal.startState,
    moonEntry.bodyState.r,
    moonEntry.bodyState.v,
    "fromFrame"
  );
  const translunarPoints = moonEntry.points.slice();
  translunarPoints[translunarPoints.length - 1] = translunarEnd.r;
  const moonParkingStart = makeState(
    moonArrivalTraversal.endState.r,
    circularVelocityAt(moonArrivalTraversal.endState.r, moon.mu)
  );
  segments.push(makeSegment(
    "translunar_coast",
    "geocentric",
    centralMu,
    earthDepartureEnd,
    translunarEnd,
    moonEntry.duration,
    0,
    translunarPoints
  ));
  pushEvent(events, segmentEndTime(segments), "Moon SOI crossing");

  const moonArrivalSegment = withIntegrationDt(makeSegment(
    "moon_arrival",
    "moon-centric",
    moon.mu,
    moonArrivalStart,
    moonArrivalTraversal.endState,
    moonArrivalTraversal.duration,
    0,
    moonArrivalTraversal.points
  ), moonArrivalTraversal);
  moonArrivalSegment.periapsis = moonParkingRadius;
  moonArrivalSegment.vInfinity = vectorMagnitude(legacyCaptureStart.v);
  moonArrivalSegment.integrator = moonArrivalTraversal.integrator;
  segments.push(moonArrivalSegment);

  segments.push(makeSegment(
    "loi_capture",
    "moon-centric",
    moon.mu,
    moonArrivalTraversal.endState,
    moonParkingStart,
    0,
    escapeBurn(moonParkingRadius, vectorMagnitude(legacyCaptureStart.v), moon.mu),
    sampleLine(moonArrivalTraversal.endState.r, moonParkingStart.r, 2)
  ));
  pushEvent(events, segmentEndTime(segments), "LOI capture burn");

  const moonParkingStartPhase = vectorAngle(moonParkingStart.r);
  segments.push(makeSegment(
    "moon_orbit",
    "moon-centric",
    moon.mu,
    moonParkingStart,
    moonParkingStart,
    0,
    0,
    sampleCircularArc(moonParkingRadius, moon.mu, 0, moonParkingStartPhase)
  ));

  let waitStartState = moonParkingStart;
  if (missionType === "touch_return") {
    const surfaceState = { r: [moon.radius, 0], v: [0, 0] };
    const tax = CONSTANTS.surfaceDeltaV.moon;
    segments.push(makeSegment(
      "descent",
      "moon-centric",
      moon.mu,
      waitStartState,
      surfaceState,
      0,
      tax / 2,
      sampleLine(waitStartState.r, surfaceState.r, 2)
    ));
    pushEvent(events, segmentEndTime(segments), "descent burn");
    segments.push(makeSegment(
      "surface_dwell",
      "moon-centric",
      moon.mu,
      surfaceState,
      surfaceState,
      surfaceDwellDuration,
      0,
      sampleLine(surfaceState.r, surfaceState.r, 2)
    ));
    segments.push(makeSegment(
      "ascent",
      "moon-centric",
      moon.mu,
      surfaceState,
      moonParkingStart,
      0,
      tax / 2,
      sampleLine(surfaceState.r, moonParkingStart.r, 2)
    ));
    pushEvent(events, segmentEndTime(segments), "ascent burn");
    waitStartState = moonParkingStart;
  }

  const returnWaitDuration = 0;
  const moonWaitStartPhase = vectorAngle(waitStartState.r);
  const moonWaitEndOrbit = circularOrbitState(moonParkingRadius, moon.mu, returnWaitDuration, moonWaitStartPhase);
  segments.push(makeSegment(
    "moon_wait",
    "moon-centric",
    moon.mu,
    waitStartState,
    moonWaitEndOrbit,
    returnWaitDuration,
    0,
    sampleCircularArc(moonParkingRadius, moon.mu, returnWaitDuration, moonWaitStartPhase)
  ));
  pushEvent(events, segmentEndTime(segments), "return window opens");

  const returnLaunchAbsTime = t0 + segmentEndTime(segments);
  const moonAtReturnLaunch = circularOrbitState(moon.orbitRadius, centralMu, returnLaunchAbsTime, moonPhase0);
  const returnDepartureState = rotateState(
    hohmannTransferState(moon.orbitRadius, originParkingRadius, centralMu, "departure"),
    vectorAngle(moonAtReturnLaunch.r)
  );
  const returnVInfinityMoon = subtractVector(returnDepartureState.v, moonAtReturnLaunch.v);
  const moonDepartureTraversal = hyperbolicHalfTraversal(
    moonParkingRadius,
    vectorMagnitude(returnVInfinityMoon),
    moon.mu,
    moon.soi,
    "departure",
    returnVInfinityMoon
  );
  const moonDepartureExit = makeState(moonDepartureTraversal.endState.r, returnVInfinityMoon);
  const departureEnd = moonDepartureTraversal.startState;
  const teiDeltaV = escapeBurn(moonParkingRadius, vectorMagnitude(returnVInfinityMoon), moon.mu);
  segments.push(makeSegment(
    "tei_departure",
    "moon-centric",
    moon.mu,
    moonWaitEndOrbit,
    departureEnd,
    0,
    teiDeltaV,
    sampleLine(moonWaitEndOrbit.r, departureEnd.r, 2)
  ));
  pushEvent(events, segmentEndTime(segments), "TEI departure burn");

  const moonDepartureSegment = withIntegrationDt(makeSegment(
    "moon_departure",
    "moon-centric",
    moon.mu,
    moonDepartureTraversal.startState,
    moonDepartureExit,
    moonDepartureTraversal.duration,
    0,
    moonDepartureTraversal.points
  ), moonDepartureTraversal);
  moonDepartureSegment.periapsis = moonParkingRadius;
  moonDepartureSegment.vInfinity = vectorMagnitude(returnVInfinityMoon);
  moonDepartureSegment.integrator = moonDepartureTraversal.integrator;
  segments.push(moonDepartureSegment);
  pushEvent(events, segmentEndTime(segments), "Moon SOI exit");

  const returnStartAbsTime = t0 + segmentEndTime(segments);
  const moonAtReturnExit = circularOrbitState(moon.orbitRadius, centralMu, returnStartAbsTime, moonPhase0);
  const returnStart = transformFrameWithOrigin(moonDepartureExit, moonAtReturnExit.r, moonAtReturnExit.v, "fromFrame");
  const returnCrossing = propagateUntilRadiusCrossing(returnStart, centralMu, originParkingRadius);
  const returnEnd = returnCrossing.endState;
  segments.push(withIntegrationDt(makeSegment(
    "translunar_return",
    "geocentric",
    centralMu,
    returnStart,
    returnEnd,
    returnCrossing.duration,
    0,
    returnCrossing.points
  ), returnCrossing));
  const earthArrivalEnd = lowOrbitState(originParkingRadius, origin.mu, 0);
  const earthArrivalSegment = makeEarthArrivalSegment(returnEnd, earthArrivalEnd, origin.mu, {
    markResidualGap: true,
    returnPropagationNote: returnCrossing.crossed ? undefined : returnCrossing.reason
  });
  segments.push(earthArrivalSegment);
  pushEvent(events, segmentEndTime(segments), "Earth arrival");

  return {
    segments,
    totalDeltaV: segments.reduce((sum, segment) => sum + segment.deltaV, 0),
    totalDuration: segmentEndTime(segments),
    returnWaitDuration,
    returnAngleMiss: signedAngleBetween([originParkingRadius, 0], returnEnd.r),
    events
  };
}

export function planMission(originBody, targetBody, missionType, options = {}) {
  assertMissionBody("originBody", originBody, ["earth"]);
  assertMissionBody("targetBody", targetBody, ["mars", "venus", "moon"]);
  if (!["flyby", "orbit_return", "touch_return"].includes(missionType)) {
    throw new RangeError("missionType must be 'flyby', 'orbit_return', or 'touch_return'");
  }
  const opts = assertMissionOptions(options);

  if (targetBody === "moon") {
    return planMoonMission(originBody, missionType, opts);
  }
  return planInterplanetaryMission(originBody, targetBody, missionType, opts);
}
