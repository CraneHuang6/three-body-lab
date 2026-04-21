import {
  Easing,
  Sprite,
  TextSprite,
  interpolate,
  useTime,
  useSprite,
} from '../lib/animations.jsx';
import {
  SCENARIOS,
  getCollisions,
  getTrail,
  luminosity,
  sampleScenario,
  starRadius,
} from '../lib/simulation.jsx';

// scene.jsx — 三体 · 七种天象
// Seven special scenarios from the Trisolarian worldview, played back-to-back.
// Uses: Stage, Sprite, useTime, interpolate, Easing from animations.jsx
// Uses: SCENARIOS, sampleScenario, getTrail, getCollisions from simulation.jsx

const W = 1280;
const H = 800;
const CX = W / 2;
const CY = H / 2 + 20;
const WORLD_SCALE = 180;

const FG = '#f2f0ea';
const FG_DIM = 'rgba(242,240,234,0.55)';
const FG_FAINT = 'rgba(242,240,234,0.25)';
const BG = '#0a0a0a';
const PLANET_HIGHLIGHT = '#35e6ff';

const BODY_NAMES = ['α', 'β', 'γ', '三体星'];
const PLANET_IDX = 3;
const TOTAL_SCENARIOS = SCENARIOS.length;
const SCENARIO_SERIES_TITLE = TOTAL_SCENARIOS === 8 ? '三体世界　·　八大天象' : `三体世界　·　${TOTAL_SCENARIOS}大天象`;
const INTRO_TITLE = TOTAL_SCENARIOS === 8 ? '三体世界八大天象' : `三体世界${TOTAL_SCENARIOS}大天象`;

const sx = (x) => CX + x * WORLD_SCALE;
const sy = (y) => CY - y * WORLD_SCALE;

// ── Timing ─────────────────────────────────────────────────────────────────
const INTRO_DUR = 6.0;
const OUTRO_DUR = 6.5;
const INTER_DUR = 1.2; // beat between scenarios
// scenario durations come from simulation.jsx

// ── Temperature model ──────────────────────────────────────────────────────
// Star surface T ≈ 5800 · m^0.55 (K). Planet equilibrium T from Σ L/d².
// Calibrated so a solar twin at 1 AU gives 280 K ≈ 7 °C.
function starSurfaceTempK(m) {
  return 5800 * Math.pow(Math.max(0.05, m), 0.55);
}
const PLANET_TEMP_K = 280;
function equilibriumTempK(selfIdx, snap) {
  let flux = 0;
  for (let j = 0; j < snap.length; j++) {
    if (j === selfIdx) continue;
    if (!snap[j].alive) continue;
    if (snap[j].m < 0.01) continue; // only stars radiate
    const dx = snap[j].x - snap[selfIdx].x;
    const dy = snap[j].y - snap[selfIdx].y;
    const d2 = dx * dx + dy * dy + 0.02;
    flux += luminosity(snap[j].m) / d2;
  }
  if (flux <= 0) return 3;
  return PLANET_TEMP_K * Math.pow(flux, 0.25);
}
// Sum of L/d² — the planet's incoming flux, unitless.
function incomingFlux(selfIdx, snap) {
  let flux = 0;
  for (let j = 0; j < snap.length; j++) {
    if (j === selfIdx) continue;
    if (!snap[j].alive) continue;
    if (snap[j].m < 0.01) continue;
    const dx = snap[j].x - snap[selfIdx].x;
    const dy = snap[j].y - snap[selfIdx].y;
    const d2 = dx * dx + dy * dy + 0.02;
    flux += luminosity(snap[j].m) / d2;
  }
  return flux;
}
// Net tidal force magnitude on the planet from all stars: Σ 2GM/r³
function tidalAccel(selfIdx, snap) {
  let t = 0;
  for (let j = 0; j < snap.length; j++) {
    if (j === selfIdx) continue;
    if (!snap[j].alive) continue;
    if (snap[j].m < 0.01) continue;
    const dx = snap[j].x - snap[selfIdx].x;
    const dy = snap[j].y - snap[selfIdx].y;
    const d = Math.sqrt(dx * dx + dy * dy + 0.01);
    t += (2 * snap[j].m) / (d * d * d);
  }
  return t;
}

function tempToColor(T_K) {
  const t = Math.max(0, Math.min(1, (Math.log10(Math.max(T_K, 10)) - 1.4) / 2.3));
  const L = 0.93;
  const C = 0.045 * (0.6 + Math.abs(t - 0.5) * 0.8);
  const h = interpolate(t, [0, 0.5, 1], [240, 90, 70]);
  return `oklch(${L} ${C} ${h})`;
}
function fmtTempC(T_K) {
  const C = T_K - 273.15;
  const int = Math.round(C);
  // Thin-space thousands separator for readability: 1 670 °C.
  const s = Math.abs(int) >= 1000
    ? String(int).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009')
    : String(int);
  return s + ' °C';
}
function fmtTempDeltaC(dK) {
  const d = dK;
  const abs = Math.abs(d);
  if (abs >= 10000) return (d / 1000).toFixed(1) + ' k°C';
  if (abs >= 1000)  return (d / 1000).toFixed(2) + ' k°C';
  return Math.round(d) + ' °C';
}

// ── Trail ──────────────────────────────────────────────────────────────────
function Trail({ scenarioId, simTime, bodyIdx, maxLen = 500 }) {
  if (scenarioId === 'static_fly' && bodyIdx === 2) return null;
  const trail = getTrail(scenarioId, simTime, bodyIdx, maxLen);
  if (trail.length < 2) return null;
  const segs = [];
  for (let i = 1; i < trail.length; i++) {
    const t = i / trail.length;
    const op = Math.pow(t, 1.8) * 0.9;
    const w = 0.3 + t * 1.6;
    segs.push(
      <line
        key={i}
        x1={sx(trail[i - 1].x)} y1={sy(trail[i - 1].y)}
        x2={sx(trail[i].x)}     y2={sy(trail[i].y)}
        stroke={FG} strokeOpacity={op} strokeWidth={w} strokeLinecap="round"
      />
    );
  }
  return <g>{segs}</g>;
}

function remapStaticFlyBody(simTime, bodyIdx, snap, body) {
  if (bodyIdx !== 2) return body;
  const planet = snap[PLANET_IDX];
  if (!planet) return body;
  const yOffset = interpolate(
    [0, 1.15, 2.45, 4.2],
    [0, 2.55, 0.02, -0.78],
    [Easing.easeOutCubic, Easing.easeInCubic, Easing.easeInCubic]
  )(simTime);
  const xOffset = interpolate(
    [0, 1.15, 2.45, 4.2],
    [0, -0.08, 0.06, 0.18],
    [Easing.easeOutCubic, Easing.easeInOutCubic, Easing.easeInCubic]
  )(simTime);
  return {
    ...body,
    x: body.x + xOffset,
    y: body.y + yOffset,
  };
}

// ── Body rendering ─────────────────────────────────────────────────────────
// Size in px scales with star radius in sim units (via starRadius()).
// The planet always renders at r=3 for visibility, except during 大撕裂
// where it can be shattered.
function Body({ scenarioId, simTime, bodyIdx, dimmedIfDistantFromIdx = null }) {
  const snap = sampleScenario(scenarioId, simTime);
  const rawSelf = snap[bodyIdx];
  const self = scenarioId === 'static_fly'
    ? remapStaticFlyBody(simTime, bodyIdx, snap, rawSelf)
    : rawSelf;
  if (!self || !self.alive) return null;
  const isPlanet = bodyIdx === PLANET_IDX;
  const r = isPlanet ? 3 : Math.max(4, starRadius(self.m) * WORLD_SCALE * 0.8);
  let opacity = 1;
  let glowOp = 1;
  const T = isPlanet
    ? equilibriumTempK(bodyIdx, snap)
    : starSurfaceTempK(self.m);
  const tint = isPlanet ? PLANET_HIGHLIGHT : '#ffffff';
  const px = sx(self.x), py = sy(self.y);
  const label = BODY_NAMES[bodyIdx];

  return (
    <g opacity={opacity}>
      {isPlanet ? (
        <>
          <circle cx={px} cy={py} r={r + 7} fill={PLANET_HIGHLIGHT} opacity={0.18} />
          <circle cx={px} cy={py} r={r + 4} fill="none" stroke={PLANET_HIGHLIGHT} strokeOpacity={0.8} strokeWidth={1.1} />
          <circle cx={px} cy={py} r={r} fill={tint} />
        </>
      ) : (
        <>
          <circle cx={px} cy={py} r={r * 2.4} fill={tint} opacity={glowOp || 0.1} />
          <circle cx={px} cy={py} r={r} fill={tint} />
        </>
      )}
      {isPlanet ? (
        <text
          x={px + r + 8} y={py - 2}
          fill={FG_DIM} fontSize={11} fontFamily="var(--font-hud)"
          style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.12em' }}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

// ── Deterministic PRNG for stable debris ───────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Collision effects (flash, shockwave, debris) ──────────────────────────
function CollisionEffects({ scenarioId, simTime }) {
  const events = getCollisions(scenarioId);
  if (!events || !events.length) return null;
  const out = [];
  for (let e = 0; e < events.length; e++) {
    const ev = events[e];
    const age = simTime - ev.t;
    if (age < 0 || age > 3.0) continue;
    const cx = sx(ev.x), cy = sy(ev.y);
    const mT = ev.mA + ev.mB;
    const energy = Math.min(1, mT * ev.vrel * 0.9);

    if (age < 0.18) {
      const a = 1 - age / 0.18;
      out.push(<circle key={`f${e}`} cx={cx} cy={cy} r={30 + 180 * (1 - a)} fill={FG} opacity={a * 0.35} />);
      out.push(<circle key={`fc${e}`} cx={cx} cy={cy} r={6 + 30 * (1 - a)} fill={FG} opacity={a * 0.9} />);
    }
    if (age < 1.4) {
      const p = age / 1.4;
      const r = 20 + 260 * Easing.easeOutCubic(p);
      const op = (1 - p) * 0.55;
      out.push(<circle key={`r${e}`} cx={cx} cy={cy} r={r} fill="none" stroke={FG} strokeOpacity={op} strokeWidth={1.2} />);
    }
    const rnd = mulberry32(1337 + e * 97);
    const N = 22 + Math.floor(energy * 18);
    const MAX_AGE = 2.6;
    if (age < MAX_AGE) {
      for (let k = 0; k < N; k++) {
        const theta = rnd() * Math.PI * 2;
        const speed = (120 + rnd() * 220) * (0.7 + energy * 0.6);
        const ca = Math.cos(theta), sa = Math.sin(theta);
        const drag = Math.exp(-age * 0.35);
        const dist = speed * age * (0.6 + 0.4 * drag);
        const x = cx + ca * dist;
        const y = cy + sa * dist;
        const lifeT = age / MAX_AGE;
        const op = Math.max(0, (1 - lifeT) ** 1.4);
        const size = (1.2 + rnd() * 2.2) * (1 - lifeT * 0.4);
        const tailLen = 6 + speed * 0.012 * (1 - lifeT);
        const tx = x - ca * tailLen;
        const ty = y - sa * tailLen;
        out.push(<line key={`d${e}-${k}t`} x1={tx} y1={ty} x2={x} y2={y} stroke={FG} strokeOpacity={op * 0.55} strokeWidth={size * 0.6} strokeLinecap="round" />);
        out.push(<circle key={`d${e}-${k}`} cx={x} cy={y} r={size} fill={FG} opacity={op} />);
      }
    }
  }
  return <g>{out}</g>;
}

// ── Persistent temperature readout (always visible during scenarios) ──────
// Sits at the bottom-right of the stage. Shows planet equilibrium temp in °C
// and tints with a color derived from the same temperature scale used for
// the stars. This is the "throughline" metric — every scenario has one.
function TempReadout({ scenarioId, simTime }) {
  const snap = sampleScenario(scenarioId, simTime);
  const p = snap[PLANET_IDX];
  if (!p || !p.alive) return null;
  const T = equilibriumTempK(PLANET_IDX, snap);
  const C = T - 273.15;
  const tint = tempToColor(T);

  // Format: integer °C, no k-units — always in °C so the scale stays honest.
  // Very hot temperatures will show e.g. "1 620 °C" with a thin space.
  const absC = Math.abs(C);
  let body;
  if (absC >= 1000) {
    const int = Math.round(C);
    const s = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
    body = s;
  } else {
    body = String(Math.round(C));
  }

  // Qualitative descriptor.
  let label;
  if (T < 150)      label = '极寒 / 冻结';
  else if (T < 240) label = '冰期';
  else if (T < 290) label = '寒冷';
  else if (T < 320) label = '宜居';
  else if (T < 400) label = '炎热';
  else if (T < 700) label = '高温 / 失控';
  else if (T < 1500) label = '熔融';
  else              label = '等离子';

  return (
    <div style={{
      position: 'absolute',
      right: 40, bottom: 74,
      width: 280,
      padding: '16px 18px',
      background: 'rgba(14,14,14,0.7)',
      border: '1px solid rgba(242,240,234,0.18)',
      fontFamily: 'var(--font-hud)',
      color: FG,
      pointerEvents: 'none',
    }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.22em', color: FG_DIM,
        marginBottom: 10,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <span>三体星 · 平衡温度</span>
        <span style={{ color: FG_FAINT, fontSize: 9 }}>°C</span>
      </div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>
        <span style={{ fontSize: 44, color: tint, letterSpacing: '0.01em', fontWeight: 300 }}>
          {body}
        </span>
        <span style={{ fontSize: 18, color: tint, opacity: 0.8 }}>°C</span>
      </div>
      <div style={{
        marginTop: 10,
        fontSize: 10.5, color: FG_DIM,
        letterSpacing: '0.1em',
      }}>
        {label}
      </div>
      {/* Temperature bar: symmetric log-ish scale around habitable band. */}
      <TempBar T={T} tint={tint} />
    </div>
  );
}

function TempBar({ T, tint }) {
  // Map log10(T[K]) from 1.4 (≈25 K) to 3.7 (≈5000 K) across 0..1.
  const t = Math.max(0, Math.min(1, (Math.log10(Math.max(T, 10)) - 1.4) / 2.3));
  // Habitable band: 250 – 320 K → log10 ≈ 2.40 – 2.51.
  const habLo = (Math.log10(250) - 1.4) / 2.3;
  const habHi = (Math.log10(320) - 1.4) / 2.3;
  return (
    <div style={{
      marginTop: 12, height: 4,
      background: 'rgba(242,240,234,0.1)',
      position: 'relative',
    }}>
      {/* habitable band marker */}
      <div style={{
        position: 'absolute',
        left: `${habLo * 100}%`,
        width: `${(habHi - habLo) * 100}%`,
        top: -1, bottom: -1,
        background: 'rgba(242,240,234,0.22)',
      }}/>
      {/* current temp indicator */}
      <div style={{
        position: 'absolute',
        left: `calc(${t * 100}% - 1px)`,
        top: -3, bottom: -3, width: 2,
        background: tint,
        transition: 'left 90ms linear',
      }}/>
    </div>
  );
}

// ── Per-scenario metric HUD ────────────────────────────────────────────────
// Each metric renders a small corner panel appropriate to its scenario.
function MetricHUD({ scenarioId, simTime, metric }) {
  const snap = sampleScenario(scenarioId, simTime);
  const planet = snap[PLANET_IDX];
  if (!planet || !planet.alive) return null;

  // Common container — sits ABOVE the persistent temperature card.
  const boxStyle = {
    position: 'absolute',
    right: 40, bottom: 210,
    width: 280,
    padding: '14px 16px',
    background: 'rgba(14,14,14,0.55)',
    border: '1px solid rgba(242,240,234,0.16)',
    fontFamily: 'var(--font-hud)',
    color: FG,
    pointerEvents: 'none',
  };
  const kickerStyle = { fontSize: 10, letterSpacing: '0.22em', color: FG_DIM, marginBottom: 8 };
  const bigStyle = { fontSize: 26, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums', color: FG, lineHeight: 1.1 };
  const subStyle = { fontSize: 10.5, color: FG_FAINT, marginTop: 6, letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' };

  if (metric === 'flux') {
    const f = incomingFlux(PLANET_IDX, snap);
    return (
      <div style={boxStyle}>
        <div style={kickerStyle}>三体星 · 辐射通量</div>
        <div style={bigStyle}>
          {f >= 100 ? f.toFixed(0) : f.toFixed(2)} ×
        </div>
        <div style={subStyle}>
          相当地球辐照的 {f >= 10 ? f.toFixed(1) : f.toFixed(2)} 倍
        </div>
      </div>
    );
  }

  if (metric === 'temperature_cold' || metric === 'temperature' || metric === 'flux_hot' || metric === 'flux_melt') {
    // These cases are fully covered by the persistent TempReadout now.
    return null;
  }

  if (metric === 'flux_ratio_distant') {
    // How much of the planet's flux comes from the CLOSEST star vs the farthest?
    // γ is the "flying star" — show its contribution ratio.
    const fluxes = [];
    for (let j = 0; j < 3; j++) {
      const s = snap[j];
      if (!s.alive) { fluxes.push(0); continue; }
      const dx = s.x - planet.x, dy = s.y - planet.y;
      fluxes.push(luminosity(s.m) / (dx*dx + dy*dy + 0.02));
    }
    const total = fluxes.reduce((a,b) => a+b, 0);
    // γ (idx 2) is the distant one in this scenario.
    const gammaRatio = total > 0 ? fluxes[2] / total : 0;
    return (
      <div style={boxStyle}>
        <div style={kickerStyle}>γ 星 · 辐照占比</div>
        <div style={bigStyle}>{(gammaRatio * 100).toFixed(2)} %</div>
        <div style={subStyle}>
          γ 在三体星天空中只相当一颗亮星
        </div>
      </div>
    );
  }

  if (metric === 'approach') {
    // γ's closing velocity vs apparent angular speed against the binary.
    const gamma = snap[2];
    const dx = gamma.x - planet.x, dy = gamma.y - planet.y;
    const d = Math.hypot(dx, dy);
    const vRad = ((gamma.vx - planet.vx) * dx + (gamma.vy - planet.vy) * dy) / (d + 1e-6);
    const vrel = { x: gamma.vx - planet.vx, y: gamma.vy - planet.vy };
    // tangential component
    const vTan = Math.abs((-vrel.x * dy + vrel.y * dx) / (d + 1e-6));
    const angSpeed = vTan / (d + 1e-6); // rad per sim-time
    return (
      <div style={boxStyle}>
        <div style={kickerStyle}>γ 星 · 视运动</div>
        <div style={bigStyle}>{angSpeed.toFixed(4)} <span style={{fontSize: 14, color: FG_DIM}}>rad/t</span></div>
        <div style={subStyle}>
          视速度 ≈ 0 · 径向闭合 {(-vRad).toFixed(2)} · 距离 {d.toFixed(2)}
        </div>
      </div>
    );
  }

  if (metric === 'tide') {
    const t = tidalAccel(PLANET_IDX, snap);
    const critical = 40; // visual threshold
    return (
      <div style={boxStyle}>
        <div style={kickerStyle}>三体星 · 潮汐强度</div>
        <div style={{...bigStyle, color: t > critical ? '#f2c08a' : FG}}>
          {t < 1 ? t.toFixed(3) : t.toFixed(2)}
        </div>
        <div style={subStyle}>
          2GM/r³ · {t > critical ? '逼近洛希极限' : '正常'}
        </div>
        {/* Bar */}
        <div style={{
          marginTop: 10, height: 3,
          background: 'rgba(242,240,234,0.1)', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            width: `${Math.min(100, (t / critical) * 60)}%`,
            background: t > critical ? '#f2c08a' : FG,
            transition: 'width 80ms linear',
          }}/>
          <div style={{
            position: 'absolute', left: '60%', top: -3, bottom: -3, width: 1,
            background: 'rgba(242,240,234,0.3)',
          }}/>
        </div>
      </div>
    );
  }

  if (metric === 'torn') {
    const p = snap[PLANET_IDX];
    const shattered = !p.alive;
    // Count surviving fragments (indices 4..11 in 大撕裂 bodies array).
    let fragAlive = 0;
    for (let i = 4; i < snap.length; i++) {
      if (snap[i] && snap[i].alive) fragAlive++;
    }
    const t = shattered ? 0 : tidalAccel(PLANET_IDX, snap);
    const ROCHE = 60;
    const frac = Math.min(1, t / ROCHE);
    return (
      <div style={boxStyle}>
        <div style={kickerStyle}>{shattered ? '三体星 · 残骸' : '潮汐 / 洛希极限'}</div>
        <div style={{...bigStyle, color: (shattered || frac >= 1) ? '#e88c6a' : FG}}>
          {shattered ? `${fragAlive}` : `${(frac * 100).toFixed(0)} %`}
        </div>
        <div style={subStyle}>
          {shattered ? '碎片 · 重新分配给三颗恒星' : (frac >= 1 ? '超过阈值 · 三体星解体' : '潮汐力接近临界')}
        </div>
        {!shattered && (
          <div style={{
            marginTop: 10, height: 3,
            background: 'rgba(242,240,234,0.1)', position: 'relative',
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              width: `${frac * 100}%`,
              background: frac >= 1 ? '#e88c6a' : FG,
              transition: 'width 80ms linear',
            }}/>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ── Special-effect overlays ────────────────────────────────────────────────
// Per-scenario extra visuals that go on top of the base simulation view.

// Freeze — ice-crust rings around the planet when deeply cold (三颗飞星).
function FreezeOverlay({ scenarioId, simTime }) {
  const snap = sampleScenario(scenarioId, simTime);
  const p = snap[PLANET_IDX];
  if (!p || !p.alive) return null;
  const T = equilibriumTempK(PLANET_IDX, snap);
  if (T > 220) return null;
  const frost = Math.max(0, Math.min(1, (220 - T) / 180));
  const px = sx(p.x), py = sy(p.y);
  // Six-pointed ice crystal spikes around the planet
  const spikes = [];
  const N = 6;
  const len = 12 + frost * 14;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + simTime * 0.1;
    const x1 = px + Math.cos(a) * 6;
    const y1 = py + Math.sin(a) * 6;
    const x2 = px + Math.cos(a) * (6 + len);
    const y2 = py + Math.sin(a) * (6 + len);
    spikes.push(
      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="#cde8ff" strokeOpacity={frost * 0.8} strokeWidth={0.9} strokeLinecap="round" />
    );
  }
  return (
    <g>
      <circle cx={px} cy={py} r={9} fill="none" stroke="#cde8ff" strokeOpacity={frost * 0.4} strokeWidth={0.6} />
      {spikes}
    </g>
  );
}

// Melt — corona flares around stars when they're close & hot (三日凌空, 双日凌空).
function MeltOverlay({ scenarioId, simTime }) {
  const snap = sampleScenario(scenarioId, simTime);
  const p = snap[PLANET_IDX];
  if (!p || !p.alive) return null;
  const T = equilibriumTempK(PLANET_IDX, snap);
  if (T < 400) return null;
  const heat = Math.max(0, Math.min(1, (T - 400) / 2000));
  const px = sx(p.x), py = sy(p.y);
  // Heat-shimmer ring
  const rings = [];
  const rnd = mulberry32(Math.floor(simTime * 10));
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 14 + i * 6 + Math.sin(simTime * 3 + i) * 2;
    rings.push(
      <circle key={i} cx={px} cy={py} r={r}
        fill="none" stroke="#f2c08a" strokeOpacity={heat * 0.35 * (1 - i * 0.3)} strokeWidth={0.7} />
    );
  }
  return <g>{rings}</g>;
}

// Syzygy line — bright line through aligned stars + planet.
function SyzygyOverlay({ scenarioId, simTime }) {
  const snap = sampleScenario(scenarioId, simTime);
  const stars = [snap[0], snap[1], snap[2]].filter(b => b.alive);
  if (stars.length < 3) return null;
  // Fit a line (least-squares) through stars + planet, compute residual.
  const pts = [...stars, snap[PLANET_IDX]].filter(b => b.alive);
  if (pts.length < 3) return null;
  // Compute principal axis via covariance
  let mx = 0, my = 0;
  for (const p of pts) { mx += p.x; my += p.y; }
  mx /= pts.length; my /= pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const dx = p.x - mx, dy = p.y - my;
    sxx += dx*dx; syy += dy*dy; sxy += dx*dy;
  }
  // Angle of major axis
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ca = Math.cos(theta), sa = Math.sin(theta);
  // Residual (perpendicular spread)
  let resid = 0;
  for (const p of pts) {
    const dx = p.x - mx, dy = p.y - my;
    const perp = -dx * sa + dy * ca;
    resid += perp * perp;
  }
  resid = Math.sqrt(resid / pts.length);
  // Closer to 0 = more aligned. Visualize when resid < 0.5.
  const alignment = Math.max(0, 1 - resid / 0.5);
  if (alignment < 0.1) return null;
  const LEN = 3.2; // sim units along axis
  const x1 = sx(mx - ca * LEN), y1 = sy(my - sa * LEN);
  const x2 = sx(mx + ca * LEN), y2 = sy(my + sa * LEN);
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={FG} strokeOpacity={alignment * 0.55} strokeWidth={0.8} strokeDasharray="6 4" />
    </g>
  );
}

// Tear — planet shatters when tidal force crosses threshold (大撕裂).
// Renders:
//   • pre-shatter: elongated warning glyph on the planet (stretch + hairline fractures)
//   • post-shatter: 8 real fragment bodies with trails, evolving under the
//     three stars' gravity (simulated — not a particle effect).
function TearOverlay({ scenarioId, simTime }) {
  const snap = sampleScenario(scenarioId, simTime);
  const p = snap[PLANET_IDX];
  const shattered = !p.alive;

  // ── Post-shatter: render fragments (bodyIdx 4..11) with trails ──────────
  if (shattered) {
    const FRAG_IDX = [4, 5, 6, 7, 8, 9, 10, 11];
    return (
      <g>
        {FRAG_IDX.map(i => (
          <FragmentTrail key={`ft${i}`} scenarioId={scenarioId} simTime={simTime} bodyIdx={i} />
        ))}
        {FRAG_IDX.map(i => {
          const b = snap[i];
          if (!b || !b.alive) return null;
          return (
            <g key={`fb${i}`}>
              <circle cx={sx(b.x)} cy={sy(b.y)} r={2.6}
                fill={PLANET_HIGHLIGHT} opacity={0.95} />
              <circle cx={sx(b.x)} cy={sy(b.y)} r={5}
                fill={PLANET_HIGHLIGHT} opacity={0.18} />
            </g>
          );
        })}
      </g>
    );
  }

  // ── Pre-shatter warning glyph on the intact planet ──────────────────────
  const tide = tidalAccel(PLANET_IDX, snap);
  const ROCHE = 60;
  if (tide < ROCHE * 0.5) return null;

  // Principal tide direction (toward nearest massive star).
  let bestStar = 0, bestStrength = 0;
  for (let j = 0; j < 3; j++) {
    if (!snap[j].alive) continue;
    const dx = snap[j].x - p.x, dy = snap[j].y - p.y;
    const d = Math.hypot(dx, dy) + 1e-6;
    const s = snap[j].m / (d * d * d);
    if (s > bestStrength) { bestStrength = s; bestStar = j; }
  }
  const near = snap[bestStar];
  const ddx = near.x - p.x, ddy = near.y - p.y;
  const dd = Math.hypot(ddx, ddy) + 1e-6;
  const ux = ddx / dd, uy = ddy / dd;

  const px = sx(p.x), py = sy(p.y);
  const strain = Math.min(1.2, (tide - ROCHE * 0.5) / (ROCHE * 0.5));
  const elongation = 1 + strain * 2.2;
  const out = [];
  out.push(
    <ellipse key="el" cx={px} cy={py}
      rx={3 + elongation * 2.2} ry={2.6}
      transform={`rotate(${Math.atan2(uy, ux) * 180 / Math.PI} ${px} ${py})`}
      fill="#e88c6a" opacity={0.35 + strain * 0.3} />
  );
  const rnd = mulberry32(Math.floor(simTime * 20));
  for (let k = 0; k < 3; k++) {
    const off = (rnd() - 0.5) * 5;
    const L = (6 + elongation * 5) * (0.6 + rnd() * 0.6);
    const x1 = px - ux * L * 0.5 + (-uy) * off;
    const y1 = py - uy * L * 0.5 + ( ux) * off;
    const x2 = px + ux * L * 0.5 + (-uy) * off;
    const y2 = py + uy * L * 0.5 + ( ux) * off;
    out.push(
      <line key={`fr${k}`} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="#f2c08a" strokeOpacity={0.5} strokeWidth={0.5} />
    );
  }
  return <g>{out}</g>;
}

// Small trail renderer for fragment bodies (starts from shatter moment, so
// we can reuse getTrail — it naturally clips to alive frames).
function FragmentTrail({ scenarioId, simTime, bodyIdx }) {
  const pts = getTrail(scenarioId, simTime, bodyIdx, 260);
  if (pts.length < 2) return null;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)} ${sy(p.y)}`).join(' ');
  return (
    <path d={d} stroke={PLANET_HIGHLIGHT} strokeOpacity={0.35} strokeWidth={0.8} fill="none" />
  );
}

// ── FactCard ───────────────────────────────────────────────────────────────
function FactCard({ kicker, title, body, x, y, width = 360 }) {
  const { localTime, duration } = useSprite();
  const entry = 0.6, exit = 0.6;
  const hold = duration - entry - exit;
  let op = 1, ty = 0;
  if (localTime < entry) {
    const t = Easing.easeOutCubic(localTime / entry);
    op = t; ty = (1 - t) * 10;
  } else if (localTime > entry + hold) {
    const t = Easing.easeInCubic((localTime - entry - hold) / exit);
    op = 1 - t; ty = -t * 6;
  }
  return (
    <div style={{
      position: 'absolute', left: x, top: y, width,
      opacity: op, transform: `translateY(${ty}px)`,
      fontFamily: 'var(--font-hud)', color: FG, pointerEvents: 'none',
    }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.22em', color: FG_DIM,
        marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ width: 18, height: 1, background: FG_DIM, display: 'inline-block' }}/>
        {kicker}
      </div>
      {title && (
        <div style={{
          fontSize: 28, fontWeight: 500, lineHeight: 1.35,
          letterSpacing: '0.01em', marginBottom: 12,
        }}>{title}</div>
      )}
      {body && (
        <div style={{
          fontSize: 14, lineHeight: 1.75, letterSpacing: '0.02em',
          color: 'rgba(242,240,234,0.75)', textWrap: 'pretty',
        }}>{body}</div>
      )}
    </div>
  );
}

// ── Scenario HUD ───────────────────────────────────────────────────────────
function ScenarioHUD({ idx, name, kicker, tagline, simTime }) {
  return (
    <>
      <div style={{
        position: 'absolute', left: 40, top: 32,
        fontFamily: 'var(--font-hud)', color: FG,
        fontSize: 11, letterSpacing: '0.22em',
      }}>
        <div style={{ color: FG_DIM, marginBottom: 6 }}>{SCENARIO_SERIES_TITLE}</div>
        <div style={{ fontSize: 22, letterSpacing: '0.12em', fontWeight: 500, display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ color: FG_DIM, fontSize: 14, letterSpacing: '0.08em' }}>{kicker}</span>
          <span>{name}</span>
        </div>
        <div style={{ marginTop: 8, color: FG_DIM, fontSize: 12, letterSpacing: '0.04em' }}>
          {tagline}
        </div>
      </div>
      <div style={{
        position: 'absolute', right: 40, top: 32,
        fontFamily: 'var(--font-hud)', color: FG_DIM,
        fontSize: 11, letterSpacing: '0.22em', textAlign: 'right',
      }}>
        <div style={{ marginBottom: 6 }}>仿真时间</div>
        <div style={{ fontSize: 22, color: FG, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em' }}>
          t = {simTime.toFixed(2)}
        </div>
      </div>
      {/* Step indicator */}
      <div style={{
        position: 'absolute', left: 40, bottom: 36,
        display: 'flex', gap: 10,
        fontFamily: 'var(--font-hud)', color: FG_DIM,
        fontSize: 11, letterSpacing: '0.18em',
      }}>
        {Array.from({ length: TOTAL_SCENARIOS }).map((_, i) => (
          <div key={i} style={{
            width: 22, height: 2,
            background: i < idx ? FG_DIM : i === idx ? FG : FG_FAINT,
            opacity: i === idx ? 1 : 0.6,
          }}/>
        ))}
        <div style={{ marginLeft: 12, color: FG_DIM, fontVariantNumeric: 'tabular-nums' }}>
          {String(idx + 1).padStart(2, '0')} / {String(TOTAL_SCENARIOS).padStart(2, '0')}
        </div>
      </div>
    </>
  );
}

// ── Single scenario scene ──────────────────────────────────────────────────
function ScenarioScene({ idx, scenario, startT, factSchedule }) {
  const time = useTime();
  const localT = time - startT;
  const durT = scenario.duration;
  const simSpeed = scenario.simSpeed || 1.2;
  const simTime = Math.max(0, localT) * simSpeed;
  if (localT < 0 || localT > durT) return null;

  const fadeIn  = Math.min(1, localT / 0.6);
  const fadeOut = Math.min(1, (durT - localT) / 0.8);
  const opacity = Math.max(0, Math.min(fadeIn, fadeOut));

  const id = scenario.id;
  // For the "飞星" scenarios, bodies get dimmed based on distance from the
  // planet so distant stars genuinely look like bright points.
  const applyBrightnessDim = (id === 'fly_star' || id === 'three_fly' || id === 'static_fly');

  return (
    <div data-screen-label={`0${idx + 1} ${scenario.name}`} style={{ position: 'absolute', inset: 0, opacity }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <Trail scenarioId={id} simTime={simTime} bodyIdx={0} />
        <Trail scenarioId={id} simTime={simTime} bodyIdx={1} />
        <Trail scenarioId={id} simTime={simTime} bodyIdx={2} />
        <Trail scenarioId={id} simTime={simTime} bodyIdx={3} />
        <CollisionEffects scenarioId={id} simTime={simTime} />
        {/* Scenario-specific overlays that sit UNDER bodies */}
        {id === 'syzygy' && <SyzygyOverlay scenarioId={id} simTime={simTime} />}
        {/* Bodies */}
        <Body scenarioId={id} simTime={simTime} bodyIdx={0}
          dimmedIfDistantFromIdx={applyBrightnessDim ? PLANET_IDX : null} />
        <Body scenarioId={id} simTime={simTime} bodyIdx={1}
          dimmedIfDistantFromIdx={applyBrightnessDim ? PLANET_IDX : null} />
        <Body scenarioId={id} simTime={simTime} bodyIdx={2}
          dimmedIfDistantFromIdx={applyBrightnessDim ? PLANET_IDX : null} />
        <Body scenarioId={id} simTime={simTime} bodyIdx={3} />
        {/* Scenario-specific overlays that sit OVER bodies */}
        {id === 'three_fly' && <FreezeOverlay scenarioId={id} simTime={simTime} />}
        {(id === 'twin_suns' || id === 'tri_suns') && <MeltOverlay scenarioId={id} simTime={simTime} />}
        {id === 'great_tear' && <TearOverlay scenarioId={id} simTime={simTime} />}
      </svg>

      <MetricHUD scenarioId={id} simTime={simTime} metric={scenario.metric} />
      <TempReadout scenarioId={id} simTime={simTime} />

      <ScenarioHUD
        idx={idx}
        name={scenario.name}
        kicker={scenario.kicker}
        tagline={scenario.tagline}
        simTime={simTime}
      />

      {factSchedule && factSchedule.map((f, i) => (
        <Sprite key={i} start={startT + f.at} end={startT + f.at + f.dur}>
          <FactCard
            kicker={f.kicker}
            title={f.title}
            body={f.body}
            x={f.x} y={f.y}
            width={f.width || 380}
          />
        </Sprite>
      ))}
    </div>
  );
}

// ── Intro & outro ──────────────────────────────────────────────────────────
function IntroScene() {
  const time = useTime();
  if (time > INTRO_DUR + 0.2) return null;
  const fadeOut = Math.max(0, Math.min(1, (INTRO_DUR - time) / 0.8));
  return (
    <div style={{
      position: 'absolute', inset: 0, opacity: fadeOut,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-hud)', color: FG,
    }}>
      <Sprite start={0} end={INTRO_DUR}>
        {({ localTime }) => {
          const t1 = Math.min(1, localTime / 0.8);
          const t2 = Math.min(1, Math.max(0, (localTime - 0.4) / 1.0));
          const t3 = Math.min(1, Math.max(0, (localTime - 1.6) / 1.2));
          const t4 = Math.min(1, Math.max(0, (localTime - 3.0) / 1.4));
          return (
            <>
              <div style={{
                fontSize: 74, fontWeight: 400,
                letterSpacing: '0.06em', lineHeight: 1.04,
                opacity: t2,
                transform: `translateY(${(1 - t2) * 16 - 44}px)`,
              }}>
                {INTRO_TITLE}
              </div>
              <div style={{
                marginTop: 54, fontSize: 17,
                color: 'rgba(242,240,234,0.6)',
                maxWidth: 760, textAlign: 'center', lineHeight: 2.0,
                letterSpacing: '0.045em',
                opacity: t3,
                transform: `translateY(${(1 - t3) * 8 + 6}px)`,
              }}>
                在三体世界里，太阳明天是否会升起，谁也不知道。
                <br/>
                它会短暂进入<em style={{ color: FG, fontStyle: 'normal' }}>恒纪元</em>，又再次跌回<em style={{ color: FG, fontStyle: 'normal' }}>乱纪元</em>，在秩序与失序之间反复震荡。
              </div>
              <div style={{
                marginTop: 72,
                display: 'flex', gap: 30, flexWrap: 'wrap', justifyContent: 'center',
                maxWidth: 860,
                opacity: t4,
                transform: `translateY(${(1 - t4) * 8 + 18}px)`,
              }}>
                {SCENARIOS.map((s, i) => (
                  <div key={s.id} style={{
                    fontSize: 12,
                    color: 'rgba(242,240,234,0.72)',
                    letterSpacing: '0.16em',
                    display: 'flex', alignItems: 'baseline', gap: 8,
                  }}>
                    <span style={{ color: FG_FAINT, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {s.name}
                  </div>
                ))}
              </div>
            </>
          );
        }}
      </Sprite>
    </div>
  );
}

function OutroScene({ startT }) {
  const time = useTime();
  const localT = time - startT;
  if (localT < 0 || localT > OUTRO_DUR + 0.1) return null;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Sprite start={startT + 0.0} end={startT + OUTRO_DUR}>
        {({ localTime }) => {
          const t1 = Math.min(1, localTime / 0.8);
          const t2 = Math.min(1, Math.max(0, (localTime - 0.6) / 1.0));
          const t3 = Math.min(1, Math.max(0, (localTime - 2.0) / 1.2));
          const fadeOut = Math.max(0, Math.min(1, (OUTRO_DUR - localTime) / 0.8));
          return (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-hud)', color: FG,
              textAlign: 'center', padding: '0 80px',
              opacity: fadeOut,
            }}>
              <div style={{
                fontSize: 11, letterSpacing: '0.28em', color: FG_DIM,
                marginBottom: 28, opacity: t1,
                transform: `translateY(${(1 - t1) * 8}px)`,
              }}>结语</div>
              <div style={{
                fontSize: 52, fontWeight: 400, letterSpacing: '0.02em',
                lineHeight: 1.3, maxWidth: 960,
                opacity: t2,
                transform: `translateY(${(1 - t2) * 14}px)`,
              }}>
                给岁月以文明，<br/>
                而不是给文明以岁月。
              </div>
              <div style={{
                marginTop: 36, fontSize: 13,
                color: FG_FAINT,
                letterSpacing: '0.22em',
                opacity: t3,
                transform: `translateY(${(1 - t3) * 8}px)`,
              }}>
                阿然 ｜ AI 瞎折腾　·　2026 年 4 月 18 日
              </div>
            </div>
          );
        }}
      </Sprite>
    </div>
  );
}

// ── Fact schedules per scenario ────────────────────────────────────────────
// Keep copy sparse; let the simulation breathe.

const FACTS = {
  stable_era: [
    {
      at: 0.6, dur: 4.8,
      kicker: '第一大天象 / 恒纪元',
      title: '三体星暂时拥有一个稳定的太阳。',
      body: '此时三体星主要围绕一颗近处恒星运行，另外两颗恒星只是在远方缓慢漂移。农时、昼夜与气候终于短暂变得可预期。',
      x: 60, y: 560, width: 420,
    },
    {
      at: 4.8, dur: 2.8,
      kicker: '物理解读',
      title: '稳定，只是暂时的恩赐。',
      body: '当一颗恒星主导引力与辐照时，世界就会进入恒纪元。但在三体系统里，这种秩序无法永久维持，下一次扰动迟早会到来。',
      x: 820, y: 120, width: 420,
    },
  ],
  fly_star: [
    {
      at: 0.6, dur: 5.0,
      kicker: '第二大天象 / 飞星',
      title: '三颗恒星里，有一颗飞远了。',
      body: '三体星绕着一对紧密的双星运行，另一颗恒星远在天边。从三体星上看，它不再是太阳——只是一颗比金星更亮的亮星。',
      x: 60, y: 560, width: 400,
    },
    {
      at: 6.5, dur: 4.5,
      kicker: '物理解读',
      title: '光随距离平方衰减。',
      body: '距离翻倍，辐照落到四分之一。γ 虽亮，却几乎不给三体星供暖——它在历法里被记作「飞星」。',
      x: 820, y: 120, width: 400,
    },
  ],
  three_fly: [
    {
      at: 0.6, dur: 4.5,
      kicker: '第三大天象 / 三颗飞星',
      title: '三颗恒星同时远离。',
      body: '系统动量向外，三体星被抛在了一片黑色里。所有光源都变成了遥远的亮点。',
      x: 60, y: 560, width: 400,
    },
    {
      at: 6.0, dur: 4.5,
      kicker: '物理解读',
      title: '辐射通量骤降，全球冻结。',
      body: '当 Σ L/r² → 0，平衡温度接近宇宙微波背景。大气液化、海洋结冰——这是恒纪元最冷的极端。',
      x: 820, y: 120, width: 400,
    },
  ],
  static_fly: [
    {
      at: 0.6, dur: 4.5,
      kicker: '第四大天象 / 飞星不动',
      title: '天上一颗星，突然停住了。',
      body: 'γ 相对三体星的视角速度接近零——它的运动几乎完全指向我们。',
      x: 60, y: 560, width: 400,
    },
    {
      at: 5.5, dur: 5.0,
      kicker: '危险信号',
      title: '这不是静止。是直撞。',
      body: '当恒星的切向视速度≈0 而径向闭合速度很大，意味着近距离掠过甚至碰撞即将发生——古代三体人视其为凶兆。',
      x: 820, y: 120, width: 400,
    },
  ],
  twin_suns: [
    {
      at: 0.6, dur: 4.5,
      kicker: '第五大天象 / 双日凌空',
      title: '两颗太阳同时登台。',
      body: '它们悬在三体星两侧，三体星同时接受两份辐照——热负荷陡增，大气失控。',
      x: 60, y: 560, width: 400,
    },
    {
      at: 5.5, dur: 4.0,
      kicker: '物理解读',
      title: '辐射通量 × 2。',
      body: '只要两颗恒星都不太远，三体星就会进入「双日凌空」的高温状态。',
      x: 820, y: 120, width: 400,
    },
  ],
  tri_suns: [
    {
      at: 0.6, dur: 4.5,
      kicker: '第六大天象 / 三日凌空',
      title: '三颗太阳，同时在天上。',
      body: '三体星被三份辐照同时烤着——这是乱纪元中最致命的天象之一。',
      x: 60, y: 560, width: 400,
    },
    {
      at: 5.5, dur: 4.0,
      kicker: '物理解读',
      title: '表面熔融。',
      body: '岩石开始流动，海洋蒸发成等离子。文明在此前必须脱水、埋藏、等待。',
      x: 820, y: 120, width: 400,
    },
  ],
  syzygy: [
    {
      at: 0.6, dur: 4.5,
      kicker: '第七大天象 / 三日连珠',
      title: '三颗恒星与三体星近乎共线。',
      body: '引力不再四散，而是沿着一根轴叠加——潮汐力骤然上升。',
      x: 60, y: 560, width: 420,
    },
    {
      at: 6.5, dur: 4.5,
      kicker: '物理解读',
      title: '潮汐 ∝ 2GM/r³。',
      body: '距离的三次方放大了近处恒星的影响。连珠时刻，三体星地壳与海洋同时响应——这是地震与海啸的窗口。',
      x: 820, y: 120, width: 400,
    },
  ],
  great_tear: [
    {
      at: 0.6, dur: 4.5,
      kicker: '第八大天象 / 大撕裂',
      title: '一颗恒星太近了。',
      body: '当潮汐力超过三体星自身的束缚——洛希极限——三体星将被拉成长条，最终碎裂。',
      x: 60, y: 560, width: 420,
    },
    {
      at: 5.5, dur: 5.0,
      kicker: '终章',
      title: '这是对三体世界的最终警告。',
      body: '在三颗恒星主导的相空间里，只要一次恰好的近距掠过，任何尺度的结构都可能被扯开。',
      x: 820, y: 120, width: 400,
    },
  ],
};

// ── Top-level scene ────────────────────────────────────────────────────────
function ThreeBodyScene() {
  const time = useTime();

  // Build a flat schedule: intro, [scenario + INTER_DUR]×7, outro.
  let cursor = INTRO_DUR;
  const scheduled = SCENARIOS.map((sc) => {
    const startT = cursor;
    cursor += sc.duration + INTER_DUR;
    return { scenario: sc, startT };
  });
  const outroStart = cursor;

  return (
    <>
      <BackgroundGrid />
      <IntroScene />
      {scheduled.map((s, i) => (
        <ScenarioScene
          key={s.scenario.id}
          idx={i}
          scenario={s.scenario}
          startT={s.startT}
          factSchedule={FACTS[s.scenario.id] || []}
        />
      ))}
      <OutroScene startT={outroStart} />
    </>
  );
}

// Compute total duration up-front so the Stage knows it.
function computeTotalDuration() {
  let t = INTRO_DUR;
  for (const s of SCENARIOS) t += s.duration + INTER_DUR;
  t += OUTRO_DUR;
  return t;
}

function BackgroundGrid() {
  const dots = [];
  const step = 80;
  for (let x = step; x < W; x += step) {
    for (let y = step; y < H; y += step) {
      dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={0.8} fill={FG} opacity={0.04} />);
    }
  }
  return (
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
      {dots}
      <line x1={CX - 12} y1={CY} x2={CX + 12} y2={CY} stroke={FG} strokeOpacity={0.12} strokeWidth={1} />
      <line x1={CX} y1={CY - 12} x2={CX} y2={CY + 12} stroke={FG} strokeOpacity={0.12} strokeWidth={1} />
    </svg>
  );
}

const TOTAL_DURATION = computeTotalDuration();
const STAGE_W = W;
const STAGE_H = H;
const BG_COLOR = BG;
const SCENARIO_INTRO_DUR = INTRO_DUR;
const SCENARIO_INTER_DUR = INTER_DUR;

export {
  BG_COLOR,
  SCENARIO_INTER_DUR,
  SCENARIO_INTRO_DUR,
  STAGE_H,
  STAGE_W,
  TOTAL_DURATION,
  ThreeBodyScene,
};
