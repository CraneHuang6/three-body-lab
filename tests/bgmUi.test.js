import fs from 'node:fs';
import path from 'node:path';

describe('bgm wiring', () => {
  it('mounts looping BGM from the home screen onward', () => {
    const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');

    expect(appSource).toContain('LoopingBgm');
    expect(appSource).not.toContain('mode === \'story\' || mode === \'simulator\'');
  });

  it('LoopingBgm accepts volume prop', () => {
    const bgmSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/LoopingBgm.jsx'), 'utf8');
    expect(bgmSource).toContain('volume');
    expect(bgmSource).toContain('audio.volume');
  });
});
