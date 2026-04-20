// simulation.jsx
// Three-body physics simulation — scenario-based.
//
// Public API:
//   SCENARIOS               — ordered list of scenario definitions (id, name, ...)
//   rebuildScenarios()      — pre-compute all scenario simulations
//   sampleScenario(id, t)   — snapshot at sim time t
//   getTrail(id, t, i)      — trail up to t for body i
//   getCollisions(id)       — collision events array
//   luminosity(m), radiusFor(b), starRadius(m)
//   SIM_DT, SIM_STEPS

const G = 1.0;
const DT = 0.005;

// Stellar radius scales roughly with mass^0.7 on main sequence; we collapse
// into sim units so a 1.0-M star looks ~0.09 sim units across.
function starRadius(m) {
  return 0.06 + 0.05 * Math.min(1.6, Math.pow(Math.max(0.1, m), 0.7));
}
function luminosity(m) {
  return Math.pow(Math.max(0.05, m), 3.5);
}
function radiusFor(b) {
  if (b.m < 0.01) return 0.02;          // planet
  return starRadius(b.m);
}

// Core integrator ---------------------------------------------------------
function simulate(bodies, dt, steps, opts = {}) {
  const softening = opts.softening ?? 0.8;
  const shatterCfg = opts.shatter || null;
  const noStarCollisions = !!opts.noStarCollisions;
  // Accept bodies as-is; extra "fragment" entries (inert) may already be in
  // the list from the scenario definition — they stay alive:false until the
  // shatter hook activates them.
  const state = bodies.map(b => ({ ...b, alive: b.alive !== false }));
  const snapshots = new Array(steps);
  const collisions = [];
  let shattered = false;

  const accel = (st) => {
    const a = st.map(() => ({ ax: 0, ay: 0 }));
    for (let i = 0; i < st.length; i++) {
      if (!st[i].alive) continue;
      for (let j = 0; j < st.length; j++) {
        if (i === j || !st[j].alive) continue;
        const dx = st[j].x - st[i].x;
        const dy = st[j].y - st[i].y;
        const r2 = dx * dx + dy * dy + softening * softening;
        const r = Math.sqrt(r2);
        const f = (G * st[j].m) / (r2 * r);
        a[i].ax += f * dx;
        a[i].ay += f * dy;
      }
    }
    return a;
  };

  let a = accel(state);
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < state.length; i++) {
      if (!state[i].alive) continue;
      state[i].vx += 0.5 * a[i].ax * dt;
      state[i].vy += 0.5 * a[i].ay * dt;
      state[i].x += state[i].vx * dt;
      state[i].y += state[i].vy * dt;
    }
    const aNew = accel(state);
    for (let i = 0; i < state.length; i++) {
      if (!state[i].alive) continue;
      state[i].vx += 0.5 * aNew[i].ax * dt;
      state[i].vy += 0.5 * aNew[i].ay * dt;
    }
    a = aNew;

    // ── Shatter trigger: compute tide on the planet and, once a threshold
    //    is crossed, redistribute the planet's mass into its fragment slots
    //    with a spread along the tidal axis + small tangential kicks.
    if (shatterCfg && !shattered) {
      const pi = shatterCfg.planetIdx;
      const planet = state[pi];
      if (planet && planet.alive) {
        // Principal tide direction: sum of G·M·r/|r|^5 contributions.
        let tideAcc = 0;
        let tx = 0, ty = 0;
        for (let j = 0; j < state.length; j++) {
          if (j === pi) continue;
          if (!state[j].alive) continue;
          if (state[j].m < 0.01) continue; // stars only
          const dx = state[j].x - planet.x;
          const dy = state[j].y - planet.y;
          const d  = Math.sqrt(dx * dx + dy * dy) + 1e-6;
          const k  = (2 * state[j].m) / (d * d * d);
          tideAcc += k;
          // direction bias — nearest heavy star
          const w = state[j].m / (d * d * d);
          tx += (dx / d) * w;
          ty += (dy / d) * w;
        }
        if (tideAcc > shatterCfg.triggerTide) {
          // Normalize tide axis.
          const tl = Math.hypot(tx, ty) + 1e-9;
          const ux = tx / tl, uy = ty / tl;
          // Perpendicular.
          const vx = -uy, vy = ux;
          const frags = shatterCfg.fragmentIdxs;
          const N = frags.length;
          // Planet's mass is redistributed across fragments (uniform).
          const fragM = planet.m / N;
          // Outward spread speed along tidal axis, with small random tangent.
          const BASE_SPREAD = shatterCfg.spreadSpeed ?? 0.9;
          const TAN_KICK    = shatterCfg.tangentialKick ?? 0.25;
          const RADIAL_JITTER = 0.25;
          // Deterministic PRNG so frames are reproducible.
          let seed = (shatterCfg.seed ?? 2025) >>> 0;
          const rnd = () => {
            seed = (seed + 0x6D2B79F5) >>> 0;
            let t = seed;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
          for (let k = 0; k < N; k++) {
            const idx = frags[k];
            const f = state[idx];
            // Fraction along tide axis: evenly spread −1..+1 with jitter.
            const along = ((k + 0.5) / N) * 2 - 1; // −1..+1
            const aJ = along * (1 + (rnd() - 0.5) * RADIAL_JITTER);
            // Small perpendicular offset so trajectories fan out visually.
            const perp = (rnd() - 0.5) * 0.35;
            // Initial position: very close to planet (spawn cluster).
            const rSpawn = 0.02;
            f.x = planet.x + ux * aJ * rSpawn + vx * perp * rSpawn;
            f.y = planet.y + uy * aJ * rSpawn + vy * perp * rSpawn;
            // Velocity = planet velocity + outward kick + tangential kick.
            const outSpeed = BASE_SPREAD * aJ;
            const tanSpeed = (rnd() - 0.5) * 2 * TAN_KICK;
            f.vx = planet.vx + ux * outSpeed + vx * tanSpeed;
            f.vy = planet.vy + uy * outSpeed + vy * tanSpeed;
            f.alive = true;
            // Keep mass tiny so fragments don't perturb the stars.
            f.m = fragM;
          }
          planet.alive = false;
          collisions.push({
            step: s, t: s * dt, shatter: true,
            x: planet.x, y: planet.y,
            vrel: 0, mA: planet.m, mB: 0,
            i: pi, j: pi, survivor: -1, victim: pi,
          });
          shattered = true;
          // Re-seed accelerations for next step.
          a = accel(state);
        }
      }
    }

    // Collision detection (star-star only).
    if (!noStarCollisions) {
    for (let i = 0; i < state.length; i++) {
      if (!state[i].alive) continue;
      if (state[i].m < 0.01) continue; // skip planet / fragments
      for (let j = i + 1; j < state.length; j++) {
        if (!state[j].alive) continue;
        if (state[j].m < 0.01) continue;
        const dx = state[j].x - state[i].x;
        const dy = state[j].y - state[i].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        const rSum = radiusFor(state[i]) + radiusFor(state[j]);
        if (d < rSum) {
          const A = state[i], B = state[j];
          const vrel = Math.sqrt((A.vx - B.vx) ** 2 + (A.vy - B.vy) ** 2);
          const survivor = A.m >= B.m ? i : j;
          const victim   = survivor === i ? j : i;
          const mA = A.m, mB = B.m, mT = mA + mB;
          collisions.push({
            step: s, t: s * dt,
            i, j,
            x: (A.x + B.x) / 2, y: (A.y + B.y) / 2,
            vrel, mA, mB, survivor, victim,
          });
          state[survivor].x = (mA * A.x + mB * B.x) / mT;
          state[survivor].y = (mA * A.y + mB * B.y) / mT;
          state[survivor].vx = (mA * A.vx + mB * B.vx) / mT;
          state[survivor].vy = (mA * A.vy + mB * B.vy) / mT;
          state[survivor].m = mT;
          state[victim].alive = false;
          state[victim].x = state[survivor].x;
          state[victim].y = state[survivor].y;
        }
      }
    }
    } // end if (!noStarCollisions)

    snapshots[s] = state.map(b => ({ x: b.x, y: b.y, alive: b.alive, m: b.m, vx: b.vx, vy: b.vy }));
  }
  return { snapshots, collisions };
}

// Scenarios ---------------------------------------------------------------
// Each scenario defines:
//   id       — stable string ID
//   name     — Chinese display name
//   kicker   — short Chinese subtitle ("第 N 种天象")
//   tagline  — single sentence summary for the scene corner
//   metric   — which live metric the HUD should show:
//              'temperature' | 'flux' | 'tide' | 'angularSpeed' | 'torn'
//   duration — seconds of real-time playback
//   simSpeed — sim seconds per real second (default 1.2)
//   bodies   — 4 bodies: 3 stars + 1 planet (planet last)
//
// Coordinate system: sim units ≈ AU, scaled 180 px/unit on screen.
// Planet mass 3e-6 is fixed; stars are ~0.7–1.4 M_sun.
//
// Each scenario is hand-tuned to land its signature phenomenon within the
// duration. Parameters were chosen by trial; small changes may flip behavior.

const PLANET_M = 3e-6;

function planet(x, y, vx, vy) {
  return { m: PLANET_M, x, y, vx, vy };
}
function star(m, x, y, vx, vy) {
  return { m, x, y, vx, vy };
}
// Inert fragment slot. Not simulated until a scenario's shatter hook
// activates it by setting alive:true and injecting position/velocity.
function fragment() {
  return { m: PLANET_M / 8, x: 0, y: 0, vx: 0, vy: 0, alive: false, isFragment: true };
}

const SCENARIOS = [
  // 1. 恒纪元 — one nearby star dominates; the other two stay far away.
  {
    id: 'stable_era',
    name: '恒纪元',
    kicker: '第一大天象',
    tagline: '三体星暂时围绕一颗恒星稳定运行。',
    metric: 'temperature',
    duration: 8,
    simSpeed: 1.0,
    noStarCollisions: true,
    bodies: [
      star(1.1,  0.0,  0.0,   0.0,  0.0),      // α dominates the local system
      star(0.95, -8.5, 4.8,   0.03, -0.01),    // β stays far away
      star(0.9,  8.2, -5.1,  -0.03,  0.01),    // γ stays far away
      planet(0.9, 0.0, 0.0, 0.75),             // stable orbit around α under softening
    ],
  },

  // 2. 飞星 — one star becomes a distant bright point.
  //    α orbits β close-in; γ is far away and drifting.
  //    Planet orbits α-β pair. γ's contribution is tiny.
  {
    id: 'fly_star',
    name: '飞星',
    kicker: '第二大天象',
    tagline: '一颗恒星远到不再是太阳。',
    metric: 'flux_ratio_distant',
    duration: 12,
    simSpeed: 1.0,
    noStarCollisions: true,
    bodies: [
      star(1.1, -0.35, 0.0,  0.0,  0.55),   // α
      star(1.0,  0.35, 0.0,  0.0, -0.55),   // β  (tight binary with α)
      star(0.9,  3.2,  1.8,  -0.18, 0.02),  // γ  — far away, slow
      planet(0.0,  1.4,  0.85, 0.0),        // planet orbits the binary
    ],
  },

  // 3. 三颗飞星 — all three stars fly outward, planet freezes.
  //    Stars placed on vertices of a triangle with radially outward velocities.
  //    Planet sits near barycenter with low velocity.
  {
    id: 'three_fly',
    name: '三颗飞星',
    kicker: '第三大天象',
    tagline: '三颗恒星一起远去，世界陷入极寒。',
    metric: 'flux',
    duration: 6,
    simSpeed: 1.0,
    noStarCollisions: true,
    bodies: [
      star(1.0,  0.00,  0.80,  0.00,  0.90),   // top, flies outward first
      star(1.0, -0.70, -0.40, -0.75, -0.60),   // lower-left, wide arc then return
      star(1.0,  0.70, -0.40,  0.75, -0.60),   // lower-right, wide arc then return
      planet(0.0, 0.0, 0.0, 0.0),
    ],
  },

  // 4. 飞星不动 — a distant star on a near-radial approach.
  //    Its angular velocity against the sky appears near zero because its
  //    motion is mostly along the line of sight; but it's closing fast.
  //    α-β are a tight binary holding the planet; γ drops straight in.
  {
    id: 'static_fly',
    name: '飞星不动',
    kicker: '第四大天象',
    tagline: '天上一颗星忽然停住了——它其实在直直掉下来。',
    metric: 'approach',
    duration: 4.2,
    simSpeed: 1.0,
    noStarCollisions: true,
    bodies: [
      star(1.1, -2.40,  0.60,  0.00,  0.06),   // α stays far in the background
      star(1.0,  2.40, -0.60,  0.00, -0.06),   // β stays far in the background
      star(0.9,  0.20,  3.10,  0.06, -0.90),   // γ dives nearly straight in, then skims past
      planet(0.04, 0.22, 0.0, 0.0),
    ],
  },

  // 5. 双日凌空 — two stars close to planet, brutal insolation.
  //    α and β on either side of the planet, γ far off-stage.
  {
    id: 'twin_suns',
    name: '双日凌空',
    kicker: '第五大天象',
    tagline: '两颗恒星同时占据天空。',
    metric: 'flux',
    duration: 10,
    simSpeed: 0.8,
    noStarCollisions: true,
    bodies: [
      star(1.1, -0.55,  0.05,  0.0,  0.35),
      star(1.0,  0.55, -0.05,  0.0, -0.35),
      star(0.9, -5.2,  3.4,   0.10, -0.02),   // γ stays far from the center
      planet(0.0, 0.0, 0.15, 0.0),
    ],
  },

  // 6. 三日凌空 — all three close, searing.
  //    Stars form a rough triangle around the planet with low velocities,
  //    so they stay bunched for ~10 s before dispersing.
  {
    id: 'tri_suns',
    name: '三日凌空',
    kicker: '第六大天象',
    tagline: '三颗恒星同时炙烤三体星。',
    metric: 'flux',
    duration: 10,
    simSpeed: 0.8,
    noStarCollisions: true,
    bodies: [
      star(1.0,  0.00,  0.70,  -0.35,  0.00),
      star(1.0, -0.60, -0.35,   0.18,  0.30),
      star(1.0,  0.60, -0.35,   0.17, -0.30),
      planet(0.0, 0.0, 0.08, 0.0),
    ],
  },

  // 7. 三日连珠 — three stars + planet near-collinear.
  //    Setup: all four bodies placed near y=0, arranged left→right along the
  //    x-axis. Stars have tiny perpendicular (y) velocities so they drift
  //    through a near-perfect alignment around the middle of the scene.
  //    Planet sits between the α-β pair with a small vy so it crosses the
  //    axis at the same moment. Tide peaks at alignment.
  {
    id: 'syzygy',
    name: '三日连珠',
    kicker: '第七大天象',
    tagline: '三颗恒星与三体星排成一条线。',
    metric: 'tide',
    duration: 12,
    simSpeed: 0.9,
    noStarCollisions: true,
    bodies: [
      // α at far left, drifting slowly right + tiny up.
      star(1.0, -2.2,  0.04,   0.05, -0.004),
      // β at mid-right, slow drift left + tiny down.
      star(1.0,  0.9, -0.03,  -0.06,  0.003),
      // γ at far right, drifting left.
      star(1.0,  2.4,  0.02,  -0.07, -0.002),
      // Planet between α and β, nearly on axis with small vy so it crosses
      // y=0 around t=3–5 (when stars also line up).
      planet(-0.6, -0.05, 0.00, 0.015),
    ],
  },

  // 8. 大撕裂 — a star makes an extreme close pass; tidal force shreds
  //    the planet. The planet shatters into N fragments which then evolve
  //    under the three stars' gravity (each fragment is a near-massless
  //    test particle). Fragments may end up orbiting different stars.
  {
    id: 'great_tear',
    name: '大撕裂',
    kicker: '第八大天象',
    tagline: '潮汐力撕碎了三体星。',
    metric: 'torn',
    duration: 14,
    simSpeed: 0.9,
    noStarCollisions: true,
    shatter: {
      planetIdx: 3,
      // 8 fragments — slots 4..11 in the bodies array.
      fragmentIdxs: [4, 5, 6, 7, 8, 9, 10, 11],
      triggerTide: 14,   // sim tide units at which shatter triggers
      spreadSpeed: 1.1,  // outward velocity scale along tidal axis
      tangentialKick: 0.45,
      seed: 314,
    },
    bodies: [
      // α and β form a loose pair, orbiting the center of mass.
      star(1.0, -1.5,  0.0,   0.08, -0.22),
      star(1.0,  1.5,  0.0,  -0.08,  0.22),
      // γ is on a hyperbolic flyby — swings in from above, grazes the planet,
      //   exits below. Lower incoming speed keeps it from colliding with α/β.
      star(1.1,  0.0,  2.4,   0.00, -0.80),
      // Planet in a tight orbit around α-β barycenter; γ's flyby pulls it apart.
      planet(0.0, 0.0, 0.30, 0.0),
      // Fragment slots (inert until shatter activates them).
      fragment(), fragment(), fragment(), fragment(),
      fragment(), fragment(), fragment(), fragment(),
    ],
  },
];

// Precomputed sims, indexed by scenario id.
const SIM_CACHE = {};

function createSimulationCache({
  bodies,
  duration = 16,
  simSpeed = 1.0,
  noStarCollisions = false,
  shatter = null,
} = {}) {
  const simT = duration * simSpeed + 0.5;
  const steps = Math.ceil(simT / DT);
  const { snapshots, collisions } = simulate(
    bodies.map((b) => ({ ...b })),
    DT,
    steps,
    {
      shatter,
      noStarCollisions,
    },
  );

  return { snapshots, collisions, steps, dt: DT, simSpeed, duration };
}

function rebuildScenarios() {
  for (const sc of SCENARIOS) {
    SIM_CACHE[sc.id] = createSimulationCache({
      bodies: sc.bodies,
      duration: sc.duration,
      simSpeed: sc.simSpeed || 1.2,
      noStarCollisions: !!sc.noStarCollisions,
      shatter: sc.shatter || null,
    });
  }
}

function _getCache(id) {
  return SIM_CACHE[id];
}

function sampleScenario(id, simTime) {
  const c = _getCache(id);
  if (!c) return [
    { x:0, y:0, alive:true, m:1 },
    { x:0, y:0, alive:true, m:1 },
    { x:0, y:0, alive:true, m:1 },
    { x:0, y:0, alive:true, m:PLANET_M },
  ];
  const idx = Math.max(0, Math.min(c.steps - 1, Math.floor(simTime / c.dt)));
  return c.snapshots[idx];
}

function getTrail(id, simTime, bodyIdx, trailLen = 500) {
  const c = _getCache(id);
  if (!c) return [];
  const idx = Math.max(0, Math.min(c.steps - 1, Math.floor(simTime / c.dt)));
  const start = Math.max(0, idx - trailLen);
  const out = [];
  for (let i = start; i <= idx; i++) {
    const snap = c.snapshots[i][bodyIdx];
    if (!snap.alive) break;
    out.push(snap);
  }
  return out;
}

function getCollisions(id) {
  const c = _getCache(id);
  return c ? c.collisions : [];
}

function sampleSimulationCache(cache, simTime) {
  if (!cache) return [];
  const idx = Math.max(0, Math.min(cache.steps - 1, Math.floor(simTime / cache.dt)));
  return cache.snapshots[idx];
}

function getTrailFromCache(cache, simTime, bodyIdx, trailLen = 500) {
  if (!cache) return [];
  const idx = Math.max(0, Math.min(cache.steps - 1, Math.floor(simTime / cache.dt)));
  const start = Math.max(0, idx - trailLen);
  const out = [];
  for (let i = start; i <= idx; i++) {
    const snap = cache.snapshots[i][bodyIdx];
    if (!snap?.alive) break;
    out.push(snap);
  }
  return out;
}

export {
  DT,
  PLANET_M,
  SCENARIOS,
  SIM_CACHE,
  createSimulationCache,
  getCollisions,
  getTrail,
  getTrailFromCache,
  luminosity,
  radiusFor,
  rebuildScenarios,
  sampleScenario,
  sampleSimulationCache,
  simulate,
  starRadius,
};
