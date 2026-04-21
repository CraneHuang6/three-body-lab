import fs from 'node:fs';
import path from 'node:path';

describe('release packaging script', () => {
  function loadReleaseScript() {
    return fs.readFileSync(path.resolve(process.cwd(), 'scripts/package-release.sh'), 'utf8');
  }

  it('builds Windows portable artifacts for both x64 and arm64 without NSIS', () => {
    const script = loadReleaseScript();

    expect(script).not.toContain('nsis');
    expect(script).toContain('electron-v31.7.7-win32-x64.zip');
    expect(script).toContain('electron-v31.7.7-win32-arm64.zip');
    expect(script).toContain('release-win-portable/x64');
    expect(script).toContain('release-win-portable/arm64');
  });

  it('uses the free macOS zip packaging path instead of signed dmg packaging', () => {
    const script = loadReleaseScript();

    expect(script).toContain('node scripts/package-mac-free.mjs');
    expect(script).not.toContain('node scripts/require-macos-signing.mjs');
    expect(script).not.toContain('release-mac-dmg');
    expect(script).not.toContain('--mac dmg');
  });
});
