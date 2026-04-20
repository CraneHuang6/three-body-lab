import fs from 'node:fs';
import path from 'node:path';

describe('vite config for packaged app', () => {
  it('uses a relative base so assets resolve under file://', () => {
    const configPath = path.resolve(process.cwd(), 'vite.config.js');
    const source = fs.readFileSync(configPath, 'utf8');

    expect(source).toMatch(/base:\s*['"]\.\/['"]/);
  });
});
