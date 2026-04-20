import fs from 'node:fs';
import path from 'node:path';

describe('fullscreen button wiring', () => {
  it('renders fullscreen controls in story and lab modes', () => {
    const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    const labSource = fs.readFileSync(path.resolve(process.cwd(), 'src/modes/LabMode.jsx'), 'utf8');

    expect(appSource).toContain('FullscreenToggleButton');
    expect(labSource).toContain('FullscreenToggleButton');
    expect(appSource).toContain('frame-fullscreen-button');
    expect(labSource).toContain('frame-fullscreen-button');
  });
});
