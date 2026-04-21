import fs from 'node:fs';
import path from 'node:path';

describe('package build config', () => {
  function loadPackageJson() {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  }

  it('uses an ASCII-safe productName for the packaged executable', () => {
    const pkg = loadPackageJson();

    expect(pkg.build.productName).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('does not force Apple Developer signing for free macOS distribution', () => {
    const pkg = loadPackageJson();

    expect(pkg.build.forceCodeSigning ?? false).toBe(false);
  });

  it('routes macOS packaging through the free-distribution script', () => {
    const pkg = loadPackageJson();

    expect(pkg.scripts.package).toBe('npm run package:mac');
    expect(pkg.scripts['package:mac']).toBe('npm run build && node scripts/package-mac-free.mjs');
    expect(pkg.scripts['package:mac:zip']).toBe('npm run build && node scripts/package-mac-free.mjs');
    expect(pkg.scripts['package:mac:dmg']).toBeUndefined();
  });

  it('limits Windows targets to portable packaging', () => {
    const pkg = loadPackageJson();

    expect(pkg.build.win.target).toEqual(['portable']);
  });

  it('pins macOS and Windows icons to repo-managed build assets', () => {
    const pkg = loadPackageJson();

    expect(pkg.build.mac.icon).toBe('build/app-icon.icns');
    expect(pkg.build.win.icon).toBe('build/app-icon.ico');
  });

  it('defines x64-only Windows packaging scripts', () => {
    const pkg = loadPackageJson();

    expect(pkg.scripts['package:win:x64']).toBe('npm run build && node scripts/package-win.mjs x64');
    expect(pkg.scripts['package:win:arm64']).toBeUndefined();
    expect(pkg.scripts['package:win:all']).toBeUndefined();
    expect(pkg.scripts['package:win']).toBe('npm run package:win:x64');
  });
});
