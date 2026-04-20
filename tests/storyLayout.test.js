import fs from 'node:fs';
import path from 'node:path';

describe('story layout shell', () => {
  it('anchors the absolute Stage inside story-shell instead of the whole workspace', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles.css');
    const source = fs.readFileSync(cssPath, 'utf8');
    const match = source.match(/\.story-shell\s*\{([^}]*)\}/);

    expect(match?.[1]).toMatch(/position:\s*relative;/);
  });
});
