import { describe, expect, it } from 'vitest';
import * as SimulatorModeModule from '../src/modes/SimulatorMode.jsx';
import { createDefaultSimulatorState } from '../src/lib/simulatorState.js';
import {
  createSimulationCache,
  extendSimulationCache,
  sampleSimulationCache,
  starRadius,
} from '../src/lib/simulation.jsx';

describe('simulator playback rules', () => {
  it('default simulator keeps all four bodies alive near the end of the initial cache', () => {
    const state = createDefaultSimulatorState();
    const cache = createSimulationCache({
      bodies: state.bodies.map((body) => ({ ...body.physics })),
      duration: state.simConfig.duration,
      simSpeed: state.simConfig.simSpeed,
      noStarCollisions: state.simConfig.noStarCollisions,
      shatter: state.simConfig.shatter || null,
    });

    const snapshot = sampleSimulationCache(cache, 17.9);
    expect(snapshot.filter((body) => body.alive)).toHaveLength(4);
  });

  it('keeps advancing playback time after the configured duration', () => {
    expect(typeof SimulatorModeModule.advanceSimulatorTime).toBe('function');
    expect(SimulatorModeModule.advanceSimulatorTime(17.9, 0.3, 18)).toBeCloseTo(18.2, 6);
  });

  it('can extend an existing simulation cache forward from its tail state', () => {
    const state = createDefaultSimulatorState();
    const cache = createSimulationCache({
      bodies: state.bodies.map((body) => ({ ...body.physics })),
      duration: state.simConfig.duration,
      simSpeed: state.simConfig.simSpeed,
      noStarCollisions: state.simConfig.noStarCollisions,
      shatter: state.simConfig.shatter || null,
    });

    expect(typeof extendSimulationCache).toBe('function');

    const extended = extendSimulationCache(cache, {
      extendBySeconds: 2,
      noStarCollisions: state.simConfig.noStarCollisions,
      shatter: state.simConfig.shatter || null,
    });

    expect(extended.steps).toBeGreaterThan(cache.steps);
    expect(extended.snapshots[cache.steps - 1]).toEqual(cache.snapshots[cache.steps - 1]);
    expect(extended.snapshots[cache.steps]).toBeDefined();
    expect(extended.snapshots[cache.steps]).not.toEqual(cache.snapshots[cache.steps - 1]);
  });

  it('auto-reset only starts when no bodies remain alive', () => {
    expect(typeof SimulatorModeModule.shouldAutoResetSimulation).toBe('function');
    expect(SimulatorModeModule.shouldAutoResetSimulation(2)).toBe(false);
    expect(SimulatorModeModule.shouldAutoResetSimulation(1)).toBe(false);
    expect(SimulatorModeModule.shouldAutoResetSimulation(0)).toBe(true);
  });

  it('starts a planet finale when the planet is destroyed instead of resetting immediately', () => {
    expect(typeof SimulatorModeModule.shouldStartPlanetFinale).toBe('function');
    expect(SimulatorModeModule.shouldStartPlanetFinale({ alive: false }, false)).toBe(true);
    expect(SimulatorModeModule.shouldStartPlanetFinale({ alive: true }, false)).toBe(false);
    expect(SimulatorModeModule.shouldStartPlanetFinale({ alive: false }, true)).toBe(false);
  });

  it('enters finale immediately when the planet is destroyed before simTime reaches 2 seconds', () => {
    expect(typeof SimulatorModeModule.resolveSimulatorPlaybackTransition).toBe('function');

    expect(SimulatorModeModule.resolveSimulatorPlaybackTransition({
      simTime: 1.25,
      playing: true,
      aliveCount: 3,
      planet: { alive: false, x: 0.4, y: -0.3 },
      planetFinale: null,
      hasAutoReset: false,
      presentationInterrupted: false,
    })).toEqual({
      type: 'startPlanetFinale',
      origin: { x: 0.4, y: -0.3 },
    });
  });

  it('only resets after the planet finale duration has elapsed', () => {
    expect(typeof SimulatorModeModule.shouldCompletePlanetFinale).toBe('function');
    expect(SimulatorModeModule.shouldCompletePlanetFinale(1.999, 2)).toBe(false);
    expect(SimulatorModeModule.shouldCompletePlanetFinale(2, 2)).toBe(true);
    expect(SimulatorModeModule.shouldCompletePlanetFinale(2.001, 2)).toBe(true);
  });

  it('does not reset while the planet finale is still in progress', () => {
    expect(typeof SimulatorModeModule.resolveSimulatorPlaybackTransition).toBe('function');

    expect(SimulatorModeModule.resolveSimulatorPlaybackTransition({
      simTime: 2.4,
      playing: true,
      aliveCount: 0,
      planet: { alive: false, x: 0.4, y: -0.3 },
      planetFinale: {
        startTime: 1.0,
        origin: { x: 0.4, y: -0.3 },
        fragments: [],
      },
      hasAutoReset: false,
      presentationInterrupted: false,
    })).toEqual({
      type: 'none',
    });
  });

  it('only enters reset after the planet finale has completed', () => {
    expect(typeof SimulatorModeModule.resolveSimulatorPlaybackTransition).toBe('function');

    expect(SimulatorModeModule.resolveSimulatorPlaybackTransition({
      simTime: 3.01,
      playing: true,
      aliveCount: 0,
      planet: { alive: false, x: 0.4, y: -0.3 },
      planetFinale: {
        startTime: 1.0,
        origin: { x: 0.4, y: -0.3 },
        fragments: [],
      },
      hasAutoReset: false,
      presentationInterrupted: false,
    })).toEqual({
      type: 'startReset',
    });
  });

  it('creates five large planet finale fragments', () => {
    expect(typeof SimulatorModeModule.createPlanetFinaleFragments).toBe('function');
    expect(typeof SimulatorModeModule.getSimulatorGlyphMetrics).toBe('function');

    const fragmentMetrics = SimulatorModeModule.getSimulatorGlyphMetrics({
      bodyType: 'fragment',
      mass: 1,
      glow: 0,
    });

    const fragments = SimulatorModeModule.createPlanetFinaleFragments({
      x: 0.3,
      y: -0.2,
      seed: 314,
    });
    expect(fragments).toHaveLength(5);
    for (const fragment of fragments) {
      expect(fragment.size).toBeGreaterThan(fragmentMetrics.radius);
    }
  });

  it('uses story-mode star radius but keeps glow disabled when the slider is at zero', () => {
    expect(typeof SimulatorModeModule.getSimulatorGlyphMetrics).toBe('function');

    const metrics = SimulatorModeModule.getSimulatorGlyphMetrics({
      bodyType: 'star',
      mass: 1,
      glow: 0,
    });

    expect(metrics.radius).toBeCloseTo(Math.max(4, starRadius(1) * 180 * 0.8), 6);
    expect(metrics.haloOpacity).toBe(0);
  });

  it('eases the camera center toward the planet instead of snapping instantly', () => {
    expect(typeof SimulatorModeModule.advanceCameraCenter).toBe('function');
    expect(
      SimulatorModeModule.advanceCameraCenter(
        { x: 0, y: 0 },
        { x: 2, y: -1 },
      ),
    ).toEqual({
      x: 0.16,
      y: -0.08,
    });
  });

  it('projects world coordinates relative to the camera center', () => {
    expect(typeof SimulatorModeModule.projectSimX).toBe('function');
    expect(typeof SimulatorModeModule.projectSimY).toBe('function');

    expect(SimulatorModeModule.projectSimX(2.5, 2.5)).toBeCloseTo(640, 6);
    expect(SimulatorModeModule.projectSimY(-1.25, -1.25)).toBeCloseTo(400, 6);
  });
});
