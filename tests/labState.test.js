import {
  createDefaultLabState,
  applyStoryScenarioToLab,
  randomizeLabState,
} from '../src/lib/labState.js';

describe('labState', () => {
  it('creates a four-body editable lab state with physics and visual controls', () => {
    const state = createDefaultLabState();

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

  it('can seed the lab state from a story scenario without sharing references', () => {
    const seeded = applyStoryScenarioToLab('twin_suns');
    const initialMass = seeded.bodies[0].physics.m;

    seeded.bodies[0].physics.m = 9.99;

    const again = applyStoryScenarioToLab('twin_suns');
    expect(again.bodies[0].physics.m).toBe(initialMass);
    expect(again.meta.sourceScenarioId).toBe('twin_suns');
  });

  it('randomizes only editable ranges and keeps quality/profile metadata intact', () => {
    const state = createDefaultLabState();
    const random = randomizeLabState(state, 42);

    expect(random.qualityProfile).toBe(state.qualityProfile);
    expect(random.bodies).toHaveLength(4);
    for (const body of random.bodies) {
      expect(body.physics.m).toBeGreaterThan(0);
      expect(body.physics.x).toBeGreaterThanOrEqual(-3.5);
      expect(body.physics.x).toBeLessThanOrEqual(3.5);
      expect(body.visual.glow).toBe(0);
    }
  });
});
