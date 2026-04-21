import React from 'react';
import {
  PLANET_M,
  createSimulationCache,
  extendSimulationCache,
  getTrailFromCache,
  luminosity,
  sampleSimulationCache,
  storyStarHaloRadiusPx,
  storyStarRadiusPx,
} from '../lib/simulation.jsx';
import {
  applyStoryScenarioToSimulatorState,
  createDefaultSimulatorState,
  randomizeSimulatorState,
  STORY_PRESET_OPTIONS,
} from '../lib/simulatorState.js';
import { FullscreenToggleButton } from '../components/FullscreenToggleButton.jsx';
import { VolumeControl } from '../components/VolumeControl.jsx';

const WIDTH = 1280;
const HEIGHT = 800;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const WORLD_SCALE = 160;

const qualityMap = {
  balanced: {
    trailLen: 220,
    particleFactor: 1,
    nebulaOpacity: 0.45,
  },
  high: {
    trailLen: 340,
    particleFactor: 1.5,
    nebulaOpacity: 0.68,
  },
};

const CACHE_EXTENSION_THRESHOLD_SECONDS = 2;
const CACHE_EXTENSION_CHUNK_SECONDS = 12;
const CAMERA_FOLLOW_LERP = 0.08;
const PLANET_FINALE_DURATION_SECONDS = 2;
const PLANET_FINALE_FRAGMENT_COUNT = 5;
const PLANET_FINALE_SPEED_MIN = 0.28;
const PLANET_FINALE_SPEED_SPAN = 0.18;
const PLANET_FINALE_SIZE_MIN = 7;
const PLANET_FINALE_SIZE_SPAN = 4;
const PLANET_FINALE_ROTATION_RANGE_DEG = 70;
const PLANET_FINALE_HUE_SHIFT_RANGE = 24;

const panelFont = '"IBM Plex Sans", "Helvetica Neue", "PingFang SC", sans-serif';
const monoFont = '"IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace';

function projectSimX(x, cameraX = 0) {
  return CENTER_X + (x - cameraX) * WORLD_SCALE;
}

function projectSimY(y, cameraY = 0) {
  return CENTER_Y - (y - cameraY) * WORLD_SCALE;
}

function advanceCameraCenter(prev, target, followLerp = CAMERA_FOLLOW_LERP) {
  return {
    x: prev.x + ((target.x - prev.x) * followLerp),
    y: prev.y + ((target.y - prev.y) * followLerp),
  };
}

function formatMass(body) {
  if (body.type === 'planet') {
    return `${(body.physics.m / PLANET_M).toFixed(0)}× 行星基准`;
  }
  return `${body.physics.m.toFixed(2)} M`;
}

function equilibriumTempK(snap) {
  const planet = snap[3];
  if (!planet?.alive) return null;

  let flux = 0;
  for (let index = 0; index < 3; index++) {
    const star = snap[index];
    if (!star?.alive) continue;
    const dx = star.x - planet.x;
    const dy = star.y - planet.y;
    flux += luminosity(star.m) / (dx * dx + dy * dy + 0.02);
  }

  if (flux <= 0) return 3;
  return 280 * Math.pow(flux, 0.25);
}

function formatTempC(tempK) {
  if (tempK == null) return '--';
  const tempC = Math.round(tempK - 273.15);
  if (Math.abs(tempC) >= 1000) {
    return `${String(tempC).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009')} °C`;
  }
  return `${tempC} °C`;
}

function useAnimationTime({ duration, playing, resetKey }) {
  const [time, setTime] = React.useState(0);
  const rafRef = React.useRef(null);
  const lastRef = React.useRef(null);

  React.useEffect(() => {
    setTime(0);
    lastRef.current = null;
  }, [resetKey]);

  React.useEffect(() => {
    if (!playing) {
      lastRef.current = null;
      return undefined;
    }

    const frame = (ts) => {
      if (lastRef.current == null) lastRef.current = ts;
      const dt = (ts - lastRef.current) / 1000;
      lastRef.current = ts;
      setTime((prev) => advanceSimulatorTime(prev, dt, duration));
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
    };
  }, [duration, playing]);

  return [time, setTime];
}

function advanceSimulatorTime(prev, dt, duration) {
  return prev + dt;
}

function shouldAutoResetSimulation(aliveCount) {
  return aliveCount === 0;
}

function shouldStartPlanetFinale(planet, finaleActive) {
  return !!planet && !planet.alive && !finaleActive;
}

function shouldCompletePlanetFinale(elapsed, duration = PLANET_FINALE_DURATION_SECONDS) {
  return elapsed >= duration;
}

function resolveSimulatorPlaybackTransition({
  simTime,
  playing,
  aliveCount,
  planet,
  planetFinale,
  hasAutoReset,
  presentationInterrupted,
}) {
  if (presentationInterrupted || !playing) {
    return { type: 'none' };
  }

  if (planetFinale) {
    const elapsed = simTime - planetFinale.startTime;
    if (shouldCompletePlanetFinale(elapsed)) {
      return { type: 'startReset' };
    }
    return { type: 'none' };
  }

  if (shouldStartPlanetFinale(planet, false)) {
    return {
      type: 'startPlanetFinale',
      origin: { x: planet.x, y: planet.y },
    };
  }

  if (shouldAutoResetSimulation(aliveCount) && !hasAutoReset) {
    return { type: 'startReset' };
  }

  return { type: 'none' };
}

function createDeterministicRandom(seed) {
  let value = seed >>> 0;

  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createPlanetFinaleFragments({ x, y, seed = 314, eventId = 'planet-finale' }) {
  // x/y are world coordinates; seed keeps repeated playback within one event stable,
  // and eventId keeps fragment keys unique across separate finale events.
  const nextRand = createDeterministicRandom(seed);
  return Array.from({ length: PLANET_FINALE_FRAGMENT_COUNT }, (_, index) => {
    const angle = ((index + 0.5) / PLANET_FINALE_FRAGMENT_COUNT) * Math.PI * 2;
    const speed = PLANET_FINALE_SPEED_MIN + (nextRand() * PLANET_FINALE_SPEED_SPAN);
    const rotation = (nextRand() - 0.5) * PLANET_FINALE_ROTATION_RANGE_DEG;

    return {
      id: `${eventId}-${index}`,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: PLANET_FINALE_SIZE_MIN + (nextRand() * PLANET_FINALE_SIZE_SPAN),
      rotation,
      hueShift: (nextRand() - 0.5) * PLANET_FINALE_HUE_SHIFT_RANGE,
    };
  });
}

function getSimulatorGlyphMetrics({ bodyType, mass, glow }) {
  if (bodyType === 'planet') {
    const radius = 5 + glow * 1.8;
    return {
      radius,
      haloRadius: radius * (1.15 + glow * 1.9),
      haloOpacity: glow <= 0 ? 0 : 0.08 + glow * 0.42,
    };
  }

  if (bodyType === 'fragment') {
    const radius = 2.6 + glow * 1.5;
    return {
      radius,
      haloRadius: radius * (1.4 + glow * 2.2),
      haloOpacity: glow <= 0 ? 0 : 0.12 + glow * 0.55,
    };
  }

  const radius = storyStarRadiusPx(mass);
  const baseHaloRadius = storyStarHaloRadiusPx(radius);
  const boostedHaloRadius = radius * (1.2 + glow * 2.5);
  return {
    radius,
    haloRadius: Math.max(baseHaloRadius, boostedHaloRadius),
    haloOpacity: glow <= 0 ? 0 : Math.min(1, 0.3 + glow * 0.5),
  };
}

function CollisionEffects({ collisions, simTime, qualityProfile, colors, cameraCenter }) {
  const profile = qualityMap[qualityProfile];
  const out = [];

  for (let index = 0; index < collisions.length; index++) {
    const event = collisions[index];
    const age = simTime - event.t;
    if (age < 0 || age > 2.6) continue;

    const cx = projectSimX(event.x, cameraCenter.x);
    const cy = projectSimY(event.y, cameraCenter.y);
    const baseColor = colors[event.survivor] || '#f2f0ea';
    const flashOpacity = Math.max(0, 1 - age / 0.16);
    const shockProgress = Math.min(1, age / 1.5);
    const shockRadius = 24 + 240 * shockProgress;
    const count = Math.round((18 + Math.min(18, event.mA * 12)) * profile.particleFactor);

    out.push(
      <circle
        key={`flash-${index}`}
        cx={cx}
        cy={cy}
        r={18 + age * 120}
        fill={baseColor}
        opacity={flashOpacity * 0.45}
      />,
    );
    out.push(
      <circle
        key={`shock-${index}`}
        cx={cx}
        cy={cy}
        r={shockRadius}
        fill="none"
        stroke={baseColor}
        strokeOpacity={(1 - shockProgress) * 0.45}
        strokeWidth={1.5}
      />,
    );

    for (let particle = 0; particle < count; particle++) {
      const angle = ((particle / count) * Math.PI * 2) + index * 0.17;
      const speed = 18 + (particle % 7) * 12;
      const dist = age * speed * 10;
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      const tail = 10 + speed * 0.5;
      const opacity = Math.max(0, 1 - age / 2.6);
      out.push(
        <line
          key={`particle-${index}-${particle}`}
          x1={x - Math.cos(angle) * tail}
          y1={y - Math.sin(angle) * tail}
          x2={x}
          y2={y}
          stroke={baseColor}
          strokeOpacity={opacity * 0.6}
          strokeWidth={1.2}
          strokeLinecap="round"
        />,
      );
    }
  }

  return <g>{out}</g>;
}

function PlanetFinaleEffects({ finale, simTime, cameraCenter }) {
  if (!finale) return null;

  const elapsed = Math.max(0, simTime - finale.startTime);
  const blastOpacity = Math.max(0, 1 - elapsed / 0.22);
  const shockProgress = Math.min(1, elapsed / PLANET_FINALE_DURATION_SECONDS);
  const cx = projectSimX(finale.origin.x, cameraCenter.x);
  const cy = projectSimY(finale.origin.y, cameraCenter.y);

  return (
    <g className="planet-finale-overlay" data-layer="planet-finale">
      <circle
        cx={cx}
        cy={cy}
        r={34 + elapsed * 240}
        fill="#ffe0bf"
        opacity={blastOpacity * 0.38}
      />
      <circle
        cx={cx}
        cy={cy}
        r={42 + shockProgress * 220}
        fill="none"
        stroke="#ffbf86"
        strokeOpacity={(1 - shockProgress) * 0.72}
        strokeWidth={2.4}
      />
      <circle
        cx={cx}
        cy={cy}
        r={18 + shockProgress * 140}
        fill="none"
        stroke="#fff4e7"
        strokeOpacity={(1 - shockProgress) * 0.44}
        strokeWidth={1.3}
      />
      {finale.fragments.map((fragment) => {
        const fx = fragment.x + fragment.vx * elapsed * 12;
        const fy = fragment.y + fragment.vy * elapsed * 12;
        const fragmentX = projectSimX(fx, cameraCenter.x);
        const fragmentY = projectSimY(fy, cameraCenter.y);
        return (
          <g key={fragment.id} transform={`translate(${fragmentX} ${fragmentY}) rotate(${fragment.rotation + elapsed * 180})`}>
            <circle
              r={fragment.size * 1.85}
              fill="#ffb36b"
              opacity={0.16}
            />
            <path
              d={`M ${fragment.size * -0.9} ${fragment.size * -0.35} L ${fragment.size * 0.2} ${fragment.size * -1.1} L ${fragment.size} 0 L ${fragment.size * -0.1} ${fragment.size} L ${fragment.size * -1.05} ${fragment.size * 0.35} Z`}
              fill="#ffd7b0"
              fillOpacity="0.92"
              stroke="#fff5e8"
              strokeOpacity="0.5"
              strokeWidth="0.8"
            />
          </g>
        );
      })}
    </g>
  );
}

function BodyTrail({ cache, simTime, bodyIndex, color, qualityProfile, trailScale, cameraCenter }) {
  const trail = getTrailFromCache(
    cache,
    simTime,
    bodyIndex,
    Math.round(qualityMap[qualityProfile].trailLen * trailScale),
  );

  if (trail.length < 2) return null;

  return (
    <g>
      {trail.slice(1).map((point, index) => {
        const prev = trail[index];
        const opacity = Math.pow((index + 1) / trail.length, 1.8) * 0.85;
        return (
          <line
            key={`${bodyIndex}-${index}`}
            x1={projectSimX(prev.x, cameraCenter.x)}
            y1={projectSimY(prev.y, cameraCenter.y)}
            x2={projectSimX(point.x, cameraCenter.x)}
            y2={projectSimY(point.y, cameraCenter.y)}
            stroke={color}
            strokeOpacity={opacity}
            strokeWidth={0.5 + opacity * 1.8}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

function BodyGlyph({ body, snap, index, cameraCenter }) {
  if (!snap?.alive || !body.visual.visible) return null;

  const isFragment = body.type === 'fragment';
  const { radius, haloRadius, haloOpacity } = getSimulatorGlyphMetrics({
    bodyType: body.type,
    mass: snap.m,
    glow: body.visual.glow,
  });

  return (
    <g>
      <circle
        cx={projectSimX(snap.x, cameraCenter.x)}
        cy={projectSimY(snap.y, cameraCenter.y)}
        r={haloRadius}
        fill={body.visual.color}
        opacity={haloOpacity}
      />
      <circle
        cx={projectSimX(snap.x, cameraCenter.x)}
        cy={projectSimY(snap.y, cameraCenter.y)}
        r={radius}
        fill={body.visual.color}
      />
      {!isFragment && (
        <text
          x={projectSimX(snap.x, cameraCenter.x) + radius + 8}
          y={projectSimY(snap.y, cameraCenter.y) - 4}
          fill="rgba(242,240,234,0.65)"
          fontSize="11"
          fontFamily={monoFont}
          letterSpacing="0.16em"
        >
          {body.label}
        </text>
      )}
    </g>
  );
}

function Slider({ label, value, min, max, step, onChange, renderValue = (input) => input }) {
  return (
    <label className="simulator-slider">
      <div className="simulator-slider__meta">
        <span>{label}</span>
        <strong>{renderValue(value)}</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function BodyControlCard({ body, onPhysicsChange, onVisualChange }) {
  return (
    <section className="body-card">
      <header className="body-card__header">
        <div>
          <p>{body.type === 'planet' ? '三体星控制' : '恒星控制'}</p>
          <h3>{body.label}</h3>
        </div>
        <span className="body-card__mass">{formatMass(body)}</span>
      </header>

      <div className="body-card__grid">
        <Slider
          label="质量"
          value={body.physics.m}
          min={body.constraints.massMin}
          max={body.constraints.massMax}
          step={body.type === 'planet' ? 0.000001 : 0.01}
          onChange={(value) => onPhysicsChange('m', value)}
          renderValue={(value) => value.toFixed(body.type === 'planet' ? 6 : 2)}
        />
        <Slider
          label="初始 X"
          value={body.physics.x}
          min={-body.constraints.pos}
          max={body.constraints.pos}
          step={0.01}
          onChange={(value) => onPhysicsChange('x', value)}
          renderValue={(value) => value.toFixed(2)}
        />
        <Slider
          label="初始 Y"
          value={body.physics.y}
          min={-body.constraints.pos}
          max={body.constraints.pos}
          step={0.01}
          onChange={(value) => onPhysicsChange('y', value)}
          renderValue={(value) => value.toFixed(2)}
        />
        <Slider
          label="初始 Vx"
          value={body.physics.vx}
          min={-body.constraints.velocity}
          max={body.constraints.velocity}
          step={0.01}
          onChange={(value) => onPhysicsChange('vx', value)}
          renderValue={(value) => value.toFixed(2)}
        />
        <Slider
          label="初始 Vy"
          value={body.physics.vy}
          min={-body.constraints.velocity}
          max={body.constraints.velocity}
          step={0.01}
          onChange={(value) => onPhysicsChange('vy', value)}
          renderValue={(value) => value.toFixed(2)}
        />
        <div className="body-card__visual">
          <span>颜色</span>
          <input
            type="color"
            value={body.visual.color}
            onChange={(event) => onVisualChange('color', event.target.value)}
          />
        </div>
        <Slider
          label="辉光范围"
          value={body.visual.glow}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => onVisualChange('glow', value)}
          renderValue={(value) => (value === 0 ? '关闭' : value.toFixed(2))}
        />
        <Slider
          label="尾迹"
          value={body.visual.trail}
          min={0.3}
          max={1.8}
          step={0.01}
          onChange={(value) => onVisualChange('trail', value)}
          renderValue={(value) => value.toFixed(2)}
        />
        <label className="body-card__toggle">
          <input
            type="checkbox"
            checked={body.visual.visible}
            onChange={(event) => onVisualChange('visible', event.target.checked)}
          />
          <span>显示天体</span>
        </label>
      </div>
    </section>
  );
}

function PresetQuickSwitch({ selectedPreset, onSelect }) {
  return (
    <section className="preset-panel">
      <div className="preset-panel__header">
        <span className="eyebrow">STORY PRESETS</span>
        <h3>八大天象默认参数</h3>
        <p>直接切到任意一种天象的默认初始条件，方便在模拟器里快速比较。</p>
      </div>
      <div className="preset-grid">
        <button
          type="button"
          className={selectedPreset === 'default' ? 'preset-card is-active' : 'preset-card'}
          onClick={() => onSelect('default')}
        >
          <span className="preset-card__eyebrow">SIMULATOR DEFAULT</span>
          <strong>默认模拟</strong>
          <span>四体自由模拟的基础起点。</span>
        </button>

        {STORY_PRESET_OPTIONS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={selectedPreset === preset.id ? 'preset-card is-active' : 'preset-card'}
            onClick={() => onSelect(preset.id)}
          >
            <span className="preset-card__eyebrow">{preset.kicker}</span>
            <strong>{preset.name}</strong>
            <span>{preset.tagline}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function SimulatorMode({ onBack, onSwitchMode, volume, onVolumeChange }) {
  const canvasFullscreenRef = React.useRef(null);
  const [simulatorState, setSimulatorState] = React.useState(() => createDefaultSimulatorState());
  const [playing, setPlaying] = React.useState(true);
  const [selectedPreset, setSelectedPreset] = React.useState('default');
  const [surfaceSize, setSurfaceSize] = React.useState({ width: WIDTH, height: HEIGHT });
  const [autoResetCounter, setAutoResetCounter] = React.useState(0);
  const hasAutoResetRef = React.useRef(false);
  const presentationInterruptPendingRef = React.useRef(false);
  const [showResetOverlay, setShowResetOverlay] = React.useState(false);
  const [isResetOverlayFading, setIsResetOverlayFading] = React.useState(false);
  const [planetFinale, setPlanetFinale] = React.useState(null);
  const [cameraCenter, setCameraCenter] = React.useState({ x: 0, y: 0 });
  const clearResetPresentation = React.useCallback(() => {
    presentationInterruptPendingRef.current = true;
    hasAutoResetRef.current = false;
    setPlanetFinale(null);
    setShowResetOverlay(false);
    setIsResetOverlayFading(false);
  }, []);

  const physicsKey = React.useMemo(
    () => JSON.stringify(simulatorState.bodies.map((body) => body.physics)),
    [simulatorState.bodies],
  );

  const cacheConfig = React.useMemo(() => ({
    bodies: [
      ...simulatorState.bodies.map((body) => ({
        ...body.physics,
      })),
      ...(simulatorState.simConfig.extraBodies || []),
    ],
    duration: simulatorState.simConfig.duration,
    simSpeed: simulatorState.simConfig.simSpeed,
    noStarCollisions: simulatorState.simConfig.noStarCollisions,
    shatter: simulatorState.simConfig.shatter || null,
  }), [physicsKey, simulatorState.simConfig.duration, simulatorState.simConfig.noStarCollisions, simulatorState.simConfig.simSpeed, simulatorState.simConfig.shatter, simulatorState.simConfig.extraBodies, autoResetCounter]);

  const [cache, setCache] = React.useState(() => createSimulationCache(cacheConfig));

  React.useEffect(() => {
    setCache(createSimulationCache(cacheConfig));
  }, [cacheConfig]);

  const [simTime, setSimTime] = useAnimationTime({
    duration: simulatorState.simConfig.duration,
    playing,
    resetKey: physicsKey,
  });

  const snapshot = sampleSimulationCache(cache, simTime);
  const aliveCount = snapshot.filter((b) => b.alive).length;
  const cacheEndTime = cache.steps * cache.dt;
  const planet = snapshot[3];

  React.useEffect(() => {
    if (cacheEndTime - simTime > CACHE_EXTENSION_THRESHOLD_SECONDS) return;

    setCache((prev) => {
      const prevEndTime = prev.steps * prev.dt;
      if (prevEndTime - simTime > CACHE_EXTENSION_THRESHOLD_SECONDS) {
        return prev;
      }
      return extendSimulationCache(prev, {
        extendBySeconds: Math.max(
          CACHE_EXTENSION_CHUNK_SECONDS,
          prev.duration,
        ),
      });
    });
  }, [cacheEndTime, simTime]);

  React.useEffect(() => {
    const resetPlanet = simulatorState.bodies[3]?.physics;
    if (!resetPlanet) return;
    setCameraCenter({
      x: resetPlanet.x,
      y: resetPlanet.y,
    });
  }, [physicsKey, autoResetCounter, simulatorState.bodies]);

  React.useEffect(() => {
    if (!planet?.alive) return;
    setCameraCenter((prev) => advanceCameraCenter(prev, {
      x: planet.x,
      y: planet.y,
    }));
  }, [planet?.alive, planet?.x, planet?.y]);

  React.useEffect(() => {
    if (!planetFinale && !showResetOverlay && simTime === 0) {
      presentationInterruptPendingRef.current = false;
    }
  }, [planetFinale, showResetOverlay, simTime]);

  React.useEffect(() => {
    const transition = resolveSimulatorPlaybackTransition({
      simTime,
      playing,
      aliveCount,
      planet,
      planetFinale,
      hasAutoReset: hasAutoResetRef.current,
      presentationInterrupted: presentationInterruptPendingRef.current,
    });

    if (transition.type === 'startPlanetFinale') {
      setPlanetFinale({
        startTime: simTime,
        origin: transition.origin,
        fragments: createPlanetFinaleFragments({
          x: transition.origin.x,
          y: transition.origin.y,
          eventId: `planet-finale-${simTime.toFixed(3)}`,
        }),
      });
      return;
    }

    if (transition.type === 'startReset' && !planetFinale) {
      hasAutoResetRef.current = true;
      setPlaying(false);
      setAutoResetCounter((c) => c + 1);
      setSimTime(0);
      setShowResetOverlay(true);
      setIsResetOverlayFading(false);
    } else if (!shouldAutoResetSimulation(aliveCount)) {
      hasAutoResetRef.current = false;
    }
  }, [aliveCount, planet, planetFinale, playing, setSimTime, simTime]);

  React.useEffect(() => {
    const transition = resolveSimulatorPlaybackTransition({
      simTime,
      playing,
      aliveCount,
      planet,
      planetFinale,
      hasAutoReset: hasAutoResetRef.current,
      presentationInterrupted: presentationInterruptPendingRef.current,
    });

    if (transition.type !== 'startReset' || !planetFinale) return;

    setPlanetFinale(null);
    hasAutoResetRef.current = true;
    setPlaying(false);
    setAutoResetCounter((c) => c + 1);
    setSimTime(0);
    setShowResetOverlay(true);
    setIsResetOverlayFading(false);
  }, [aliveCount, planet, planetFinale, playing, setSimTime, simTime]);

  React.useEffect(() => {
    if (showResetOverlay) {
      const fadeTimer = setTimeout(() => setIsResetOverlayFading(true), 1500);
      const hideTimer = setTimeout(() => {
        setShowResetOverlay(false);
        setIsResetOverlayFading(false);
        setPlaying(true);
      }, 2300);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [showResetOverlay]);

  const renderBodies = React.useMemo(() => {
    const extras = simulatorState.simConfig.extraBodies || [];
    return [
      ...simulatorState.bodies,
      ...extras.map((_, i) => ({
        id: `frag-${i}`,
        label: '',
        type: 'fragment',
        visual: { color: '#35e6ff', glow: 0, trail: 0.3, visible: true },
      })),
    ];
  }, [simulatorState.bodies, simulatorState.simConfig.extraBodies]);

  const colors = renderBodies.map((body) => body.visual.color);
  const planetTemp = React.useMemo(() => equilibriumTempK(snapshot), [snapshot]);

  const totalFlux = React.useMemo(() => {
    const planet = snapshot[3];
    if (!planet?.alive) return 0;
    return snapshot.slice(0, 3).reduce((sum, star, index) => {
      if (!star?.alive) return sum;
      const dx = star.x - planet.x;
      const dy = star.y - planet.y;
      return sum + (luminosity(star.m) / (dx * dx + dy * dy + 0.04));
    }, 0);
  }, [snapshot]);

  const updateBody = React.useCallback((bodyIndex, section, key, value) => {
    if (section === 'physics') {
      clearResetPresentation();
    }
    setSimulatorState((prev) => ({
      ...prev,
      bodies: prev.bodies.map((body, index) => {
        if (index !== bodyIndex) return body;
        return {
          ...body,
          [section]: {
            ...body[section],
            [key]: value,
          },
        };
      }),
    }));
  }, [clearResetPresentation]);

  const applyPreset = React.useCallback((presetId) => {
    setSelectedPreset(presetId);
    clearResetPresentation();
    if (presetId === 'default') {
      setSimulatorState(createDefaultSimulatorState());
      return;
    }
    setSimulatorState(applyStoryScenarioToSimulatorState(presetId));
  }, [clearResetPresentation]);

  const resetParams = React.useCallback(() => {
    setSelectedPreset('default');
    clearResetPresentation();
    setSimulatorState(createDefaultSimulatorState());
    setSimTime(0);
  }, [clearResetPresentation, setSimTime]);

  const randomizeParams = React.useCallback(() => {
    clearResetPresentation();
    setSelectedPreset('default');
    setSimulatorState((prev) => randomizeSimulatorState(prev, 42 + Math.round(simTime * 100)));
  }, [clearResetPresentation, simTime]);

  const resetTime = React.useCallback(() => {
    clearResetPresentation();
    setSimTime(0);
  }, [clearResetPresentation, setSimTime]);

  React.useEffect(() => {
    const element = canvasFullscreenRef.current;
    if (!element) return undefined;

    const aspect = WIDTH / HEIGHT;
    const measure = () => {
      const containerWidth = element.clientWidth;
      const containerHeight = element.clientHeight;

      let width = containerWidth;
      let height = width / aspect;
      if (height > containerHeight) {
        height = containerHeight;
        width = height * aspect;
      }

      setSurfaceSize({
        width: Math.max(0, width),
        height: Math.max(0, height),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <div className="workspace workspace--simulator">
      <header className="app-toolbar">
        <div>
          <span className="eyebrow">自由模拟器</span>
          <h2>四个天体，实时操控</h2>
        </div>
        <div className="toolbar-actions">
          <VolumeControl value={volume} onChange={onVolumeChange} />
          <button className="ghost-button" onClick={onBack}>返回首页</button>
          <button className="ghost-button" onClick={() => onSwitchMode('story')}>切到观演模式</button>
          <FullscreenToggleButton />
        </div>
      </header>

      <div className="simulator-layout">
        <section className="simulator-stage-shell">
          <div className="simulator-stage-frame">
            <div className="simulator-stage-head">
              <div>
                <span className="eyebrow">SIMULATOR FEED</span>
                <h3>{simulatorState.meta.name}</h3>
              </div>
              <div className="simulator-stage-side">
                <div className="simulator-stage-head__stats">
                  <div>
                    <span>时间</span>
                    <strong>{simTime.toFixed(2)}s</strong>
                  </div>
                  <div>
                    <span>总辐照</span>
                    <strong>{totalFlux.toFixed(2)}×</strong>
                  </div>
                <div>
                  <span>三体星温度</span>
                  <strong>{formatTempC(planetTemp)}</strong>
                </div>
              </div>

              <div className="simulator-stage-actions">
                <button className="primary-button" onClick={() => setPlaying((prev) => !prev)}>
                  {playing ? '暂停' : '继续'}
                </button>
                <button className="ghost-button" onClick={resetParams}>重置参数</button>
                <button className="ghost-button" onClick={resetTime}>重置时间</button>
                <button className="ghost-button" onClick={randomizeParams}>
                  随机生成
                </button>
                </div>
              </div>
            </div>

            <div className="simulator-stage-canvas" ref={canvasFullscreenRef}>
              <div
                className="simulator-stage-surface"
                style={{ width: `${surfaceSize.width}px`, height: `${surfaceSize.height}px` }}
              >
              <FullscreenToggleButton targetRef={canvasFullscreenRef} className="frame-fullscreen-button" />
              <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="simulator-svg" role="img" aria-label="四体模拟可视化">
                <defs>
                  <radialGradient id="simulator-nebula-a" cx="30%" cy="30%">
                    <stop offset="0%" stopColor="rgba(56, 93, 255, 0.56)" />
                    <stop offset="100%" stopColor="rgba(56, 93, 255, 0)" />
                  </radialGradient>
                  <radialGradient id="simulator-nebula-b" cx="70%" cy="60%">
                    <stop offset="0%" stopColor="rgba(255, 125, 94, 0.42)" />
                    <stop offset="100%" stopColor="rgba(255, 125, 94, 0)" />
                  </radialGradient>
                </defs>

                <rect width={WIDTH} height={HEIGHT} fill="#06070c" />
                <rect width={WIDTH} height={HEIGHT} fill="url(#simulator-nebula-a)" opacity={qualityMap[simulatorState.qualityProfile].nebulaOpacity} />
                <rect width={WIDTH} height={HEIGHT} fill="url(#simulator-nebula-b)" opacity={qualityMap[simulatorState.qualityProfile].nebulaOpacity * 0.75} />
                {[...Array(120)].map((_, index) => (
                  <circle
                    key={index}
                    cx={(index * 97) % WIDTH}
                    cy={(index * 61) % HEIGHT}
                    r={(index % 3) + 0.6}
                    fill="rgba(255,255,255,0.55)"
                    opacity={0.18 + ((index * 17) % 10) / 40}
                  />
                ))}

                {renderBodies.map((body, index) => (
                  <BodyTrail
                    key={`${body.id}-trail`}
                    cache={cache}
                    simTime={simTime}
                    bodyIndex={index}
                    color={body.visual.color}
                    qualityProfile={simulatorState.qualityProfile}
                    trailScale={body.visual.trail}
                    cameraCenter={cameraCenter}
                  />
                ))}

                <CollisionEffects
                  collisions={cache.collisions}
                  simTime={simTime}
                  qualityProfile={simulatorState.qualityProfile}
                  colors={colors}
                  cameraCenter={cameraCenter}
                />

                <PlanetFinaleEffects
                  finale={planetFinale}
                  simTime={simTime}
                  cameraCenter={cameraCenter}
                />

                {renderBodies.map((body, index) => (
                  <BodyGlyph
                    key={body.id}
                    body={body}
                    snap={snapshot[index]}
                    index={index}
                    cameraCenter={cameraCenter}
                  />
                ))}
              </svg>

              <div className="simulator-overlay-card">
                <span className="eyebrow">碰撞记录</span>
                <strong>{cache.collisions.length}</strong>
                <p>当前这一组初始条件下已计算到的恒星碰撞事件数。</p>
              </div>
              </div>

              {showResetOverlay && (
                <div className={`simulator-reset-overlay${isResetOverlayFading ? ' is-fading' : ''}`}>
                  <p>漫长的时间后，生命和文明将重新启动，再次开启在三体世界中命运莫测地进化……</p>
                </div>
              )}
            </div>
          </div>

        </section>

        <aside className="simulator-control-panel">
          <PresetQuickSwitch selectedPreset={selectedPreset} onSelect={applyPreset} />

          <div className="panel-copy">
            <span className="eyebrow">CONTROL DECK</span>
            <h3>初始条件舱</h3>
            <p>
              质量、位置和速度会重建整场仿真；颜色、辉光和尾迹会即时刷新画面。
              当前版本保留 3 星 + 1 行星的固定类型，只开放每个天体的可编辑初始条件。
            </p>
          </div>

          {simulatorState.bodies.map((body, index) => (
            <BodyControlCard
              key={body.id}
              body={body}
              onPhysicsChange={(key, value) => updateBody(index, 'physics', key, value)}
              onVisualChange={(key, value) => updateBody(index, 'visual', key, value)}
            />
          ))}
        </aside>
      </div>
    </div>
  );
}

export {
  advanceSimulatorTime,
  advanceCameraCenter,
  createPlanetFinaleFragments,
  getSimulatorGlyphMetrics,
  PLANET_FINALE_DURATION_SECONDS,
  PLANET_FINALE_FRAGMENT_COUNT,
  PlanetFinaleEffects,
  projectSimX,
  projectSimY,
  shouldCompletePlanetFinale,
  shouldAutoResetSimulation,
  shouldStartPlanetFinale,
  resolveSimulatorPlaybackTransition,
};
