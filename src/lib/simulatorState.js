import { PLANET_M, SCENARIOS } from './simulation.jsx';

const DEFAULT_BODY_COLOR = '#ffffff';
const DEFAULT_PLANET_COLOR = '#58f2ff';
const GLOW_MIN = 0;
const GLOW_MAX = 1;

const BODY_PRESETS = [
  {
    id: 'body-0',
    label: 'α',
    type: 'star',
    color: DEFAULT_BODY_COLOR,
    physics: { m: 1.16, x: -1.3, y: 0.2, vx: 0.08, vy: 0.42 },
    visual: { color: DEFAULT_BODY_COLOR, glow: GLOW_MIN, trail: 1.0, visible: true },
  },
  {
    id: 'body-1',
    label: 'β',
    type: 'star',
    color: DEFAULT_BODY_COLOR,
    physics: { m: 0.92, x: 1.1, y: -0.25, vx: -0.1, vy: -0.4 },
    visual: { color: DEFAULT_BODY_COLOR, glow: GLOW_MIN, trail: 0.95, visible: true },
  },
  {
    id: 'body-2',
    label: 'γ',
    type: 'star',
    color: DEFAULT_BODY_COLOR,
    physics: { m: 0.86, x: 0.2, y: 1.85, vx: -0.16, vy: -0.12 },
    visual: { color: DEFAULT_BODY_COLOR, glow: GLOW_MIN, trail: 1.1, visible: true },
  },
  {
    id: 'body-3',
    label: '三体星',
    type: 'planet',
    color: DEFAULT_PLANET_COLOR,
    physics: { m: PLANET_M * 1600, x: 0.2, y: -0.1, vx: 0.62, vy: 0.1 },
    visual: { color: DEFAULT_PLANET_COLOR, glow: GLOW_MIN, trail: 1.18, visible: true },
  },
];

function cloneBody(body) {
  return {
    ...body,
    physics: { ...body.physics },
    visual: { ...body.visual },
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mapScenarioBody(body, idx) {
  const preset = BODY_PRESETS[idx];
  const isPlanet = idx === 3;
  return {
    id: preset.id,
    label: preset.label,
    type: preset.type,
    physics: {
      m: body.m,
      x: body.x,
      y: body.y,
      vx: body.vx,
      vy: body.vy,
    },
    visual: {
      color: preset.visual.color,
      glow: preset.visual.glow,
      trail: preset.visual.trail,
      visible: true,
    },
    constraints: isPlanet
      ? { massMin: PLANET_M * 0.2, massMax: 0.009, pos: 3.5, velocity: 1.8 }
      : { massMin: 0.35, massMax: 1.8, pos: 3.5, velocity: 1.2 },
  };
}

function withConstraints(body) {
  const constraints = body.type === 'planet'
    ? { massMin: PLANET_M * 0.2, massMax: 0.009, pos: 3.5, velocity: 1.8 }
    : { massMin: 0.35, massMax: 1.8, pos: 3.5, velocity: 1.2 };

  return {
    ...cloneBody(body),
    constraints,
  };
}

function createDefaultSimulatorState() {
  return {
    bodies: BODY_PRESETS.map(withConstraints),
    qualityProfile: 'balanced',
    simConfig: {
      duration: 18,
      simSpeed: 1,
      noStarCollisions: false,
    },
    meta: {
      sourceScenarioId: null,
      name: '默认模拟',
    },
  };
}

function applyStoryScenarioToSimulatorState(scenarioId) {
  const scenario = SCENARIOS.find((item) => item.id === scenarioId);
  if (!scenario) return createDefaultSimulatorState();

  return {
    bodies: scenario.bodies.slice(0, 4).map(mapScenarioBody),
    qualityProfile: 'balanced',
    simConfig: {
      duration: Math.max(14, scenario.duration + 4),
      simSpeed: scenario.simSpeed || 1,
      noStarCollisions: !!scenario.noStarCollisions,
      shatter: scenario.shatter || null,
      extraBodies: scenario.bodies.slice(4).map((b) => ({ ...b })),
    },
    meta: {
      sourceScenarioId: scenario.id,
      name: scenario.name,
    },
  };
}

function randomizeSimulatorState(state, seed = Date.now()) {
  const rand = mulberry32(seed);
  return {
    ...state,
    bodies: state.bodies.map((body) => {
      const { constraints } = body;
      const massSpan = constraints.massMax - constraints.massMin;
      return {
        ...cloneBody(body),
        constraints,
        physics: {
          m: Number((constraints.massMin + massSpan * (0.18 + rand() * 0.82)).toFixed(6)),
          x: Number(((rand() * 2 - 1) * constraints.pos).toFixed(3)),
          y: Number(((rand() * 2 - 1) * constraints.pos).toFixed(3)),
          vx: Number(((rand() * 2 - 1) * constraints.velocity).toFixed(3)),
          vy: Number(((rand() * 2 - 1) * constraints.velocity).toFixed(3)),
        },
        visual: {
          ...body.visual,
          glow: GLOW_MIN,
          trail: Number((0.4 + rand() * 1.4).toFixed(2)),
        },
      };
    }),
  };
}

const STORY_PRESET_OPTIONS = SCENARIOS.map((scenario) => ({
  id: scenario.id,
  name: scenario.name,
  kicker: scenario.kicker,
  tagline: scenario.tagline,
}));

export {
  BODY_PRESETS,
  DEFAULT_BODY_COLOR,
  DEFAULT_PLANET_COLOR,
  GLOW_MAX,
  GLOW_MIN,
  STORY_PRESET_OPTIONS,
  applyStoryScenarioToSimulatorState,
  createDefaultSimulatorState,
  randomizeSimulatorState,
};
