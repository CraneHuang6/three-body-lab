import fs from 'node:fs';
import path from 'node:path';

describe('bgm wiring', () => {
  it('mounts looping BGM for story and lab modes', () => {
    const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');

    expect(appSource).toContain('LoopingBgm');
    expect(appSource).toContain('mode === \'story\' || mode === \'lab\'');
  });
});
