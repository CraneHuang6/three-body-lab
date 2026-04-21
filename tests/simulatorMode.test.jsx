import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as SimulatorModeModule from '../src/modes/SimulatorMode.jsx';
import { SCENARIOS } from '../src/lib/simulation.jsx';

describe('SimulatorMode preset UI', () => {
  it('renders eight story presets as visible quick-switch controls', () => {
    const html = renderToStaticMarkup(
      <SimulatorModeModule.SimulatorMode
        onBack={() => {}}
        onSwitchMode={() => {}}
        volume={0.55}
        onVolumeChange={() => {}}
      />,
    );

    expect(html).toContain('八大天象默认参数');
    expect(html).toContain('辉光范围');
    expect(html).toContain('simulator-stage-actions');
    expect(html).toContain('全屏');
    expect(html).toContain('重置参数');
    expect(html).toContain('三体星温度');
    expect(html).toContain('自由模拟器');
    expect(html).toContain('四体模拟可视化');
    expect(html).not.toContain('质量档');
    expect(html).not.toContain('STAR α');
    expect(html).not.toContain('PLANET');
    for (const scenario of SCENARIOS) {
      expect(html).toContain(scenario.name);
    }
  });

  it('includes auto-reset overlay class in component source', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/modes/SimulatorMode.jsx'), 'utf8');
    expect(source).toContain('simulator-reset-overlay');
  });

  it('exposes a planet finale render helper that renders the finale layer marker', () => {
    expect(typeof SimulatorModeModule.PlanetFinaleEffects).toBe('function');

    const markup = renderToStaticMarkup(
      <SimulatorModeModule.PlanetFinaleEffects
        finale={{
          startTime: 0,
          origin: { x: 0, y: 0 },
          fragments: [],
        }}
        simTime={0.5}
        cameraCenter={{ x: 0, y: 0 }}
      />,
    );

    expect(markup).toContain('planet-finale');
  });
});
