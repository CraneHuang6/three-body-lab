import fs from 'node:fs';
import path from 'node:path';

describe('package build config', () => {
  it('uses an ASCII-safe productName for the packaged executable', () => {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    expect(pkg.build.productName).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});
