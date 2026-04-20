import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LabMode } from '../src/modes/LabMode.jsx';
import { SCENARIOS } from '../src/lib/simulation.jsx';

describe('LabMode preset UI', () => {
  it('renders eight story presets as visible quick-switch controls', () => {
    const html = renderToStaticMarkup(
      <LabMode onBack={() => {}} onSwitchMode={() => {}} />,
    );

    expect(html).toContain('八大天象默认参数');
    expect(html).toContain('辉光范围');
    expect(html).toContain('lab-stage-actions');
    expect(html).toContain('全屏');
    expect(html).toContain('重置参数');
    expect(html).toContain('三体星温度');
    expect(html).not.toContain('质量档');
    expect(html).not.toContain('STAR α');
    expect(html).not.toContain('PLANET');
    for (const scenario of SCENARIOS) {
      expect(html).toContain(scenario.name);
    }
  });
});
