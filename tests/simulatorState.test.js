import {
  createDefaultSimulatorState,
  applyStoryScenarioToSimulatorState,
  randomizeSimulatorState,
} from '../src/lib/simulatorState.js';
import { createSimulationCache } from '../src/lib/simulation.jsx';

describe('simulatorState', () => {
  it('creates a four-body editable simulator state with physics and visual controls', () => {
    const state = createDefaultSimulatorState();

    expect(state.bodies).toHaveLength(4);
    expect(state.bodies[0]).toMatchObject({
      id: 'body-0',
      label: 'α',
    });
    expect(state.bodies[1].label).toBe('β');
    expect(state.bodies[2].label).toBe('γ');
    expect(state.bodies[3].label).toBe('三体星');
    expect(state.bodies[3].physics.m).toBeGreaterThan(0);
    expect(state.bodies[3].visual).toMatchObject({
      visible: true,
    });
    for (const body of state.bodies.slice(0, 3)) {
      expect(body.visual.glow).toBe(0);
      expect(body.visual.color).toBe('#ffffff');
    }
    expect(state.bodies[3].visual.glow).toBe(0);
    expect(state.bodies[3].visual.color).toBe('#58f2ff');
  });

  it('can seed the simulator state from a story scenario without sharing references', () => {
    const seeded = applyStoryScenarioToSimulatorState('twin_suns');
    const initialMass = seeded.bodies[0].physics.m;

    expect(seeded.meta.name).toBe('双日凌空');
    seeded.bodies[0].physics.m = 9.99;

    const again = applyStoryScenarioToSimulatorState('twin_suns');
    expect(again.bodies[0].physics.m).toBe(initialMass);
    expect(again.meta.sourceScenarioId).toBe('twin_suns');
  });

  it('randomizes only editable ranges and keeps quality/profile metadata intact', () => {
    const state = createDefaultSimulatorState();
    const random = randomizeSimulatorState(state, 42);

    expect(random.qualityProfile).toBe(state.qualityProfile);
    expect(random.bodies).toHaveLength(4);
    for (const body of random.bodies) {
      expect(body.physics.m).toBeGreaterThan(0);
      expect(body.physics.x).toBeGreaterThanOrEqual(-3.5);
      expect(body.physics.x).toBeLessThanOrEqual(3.5);
      expect(body.visual.glow).toBe(0);
    }
  });

  it('uses simulator naming for the default preset metadata', () => {
    const state = createDefaultSimulatorState();

    expect(state.meta.name).toBe('默认模拟');
  });

  it('avoids star-star collisions in the initial default simulator window', () => {
    const state = createDefaultSimulatorState();
    const cache = createSimulationCache({
      bodies: state.bodies.map((body) => ({ ...body.physics })),
      duration: state.simConfig.duration,
      simSpeed: state.simConfig.simSpeed,
      noStarCollisions: state.simConfig.noStarCollisions,
      shatter: state.simConfig.shatter || null,
    });

    const starCollisions = cache.collisions.filter((event) => !event.shatter);
    expect(starCollisions).toHaveLength(0);
  });
});
