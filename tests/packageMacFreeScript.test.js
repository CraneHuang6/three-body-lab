import fs from 'node:fs';
import path from 'node:path';

describe('free macOS packaging script', () => {
  function loadScript() {
    return fs.readFileSync(path.resolve(process.cwd(), 'scripts/package-mac-free.mjs'), 'utf8');
  }

  it('packages an unpacked app, ad-hoc signs it, and zips it for distribution', () => {
    const script = loadScript();

    expect(script).toContain("'dir'");
    expect(script).toContain("'codesign'");
    expect(script).toContain("'--sign', '-'");
    expect(script).toContain("'ditto'");
    expect(script).toContain('--keepParent');
  });
});
