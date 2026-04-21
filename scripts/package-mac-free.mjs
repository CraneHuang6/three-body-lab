import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VALID_ARCHS = new Set(['arm64', 'x64']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function resolveArch(rawArch) {
  const arch = rawArch ?? process.env.THREEBODY_MAC_ARCH ?? process.arch;
  if (!VALID_ARCHS.has(arch)) {
    fail(`Unsupported macOS arch "${arch}". Use arm64 or x64.`);
  }
  return arch;
}

function resolveProjectDir() {
  return path.resolve(process.env.THREEBODY_PROJECT_DIR ?? path.join(__dirname, '..'));
}

function resolveReleaseRoot(projectDir) {
  return path.resolve(process.env.THREEBODY_RELEASE_DIR ?? path.join(projectDir, 'release'));
}

function resolveElectronDistArg() {
  if (!process.env.THREEBODY_ELECTRON_DIST_DIR) return null;
  return `-c.electronDist=${path.resolve(process.env.THREEBODY_ELECTRON_DIST_DIR)}`;
}

function builderCliPath(projectDir) {
  return path.join(projectDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
}

function loadPackageJson(projectDir) {
  const packageJsonPath = path.join(projectDir, 'package.json');
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function spawnOrFail(command, args, options) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function buildUnpackedApp(projectDir, outputDir, arch, electronDistArg) {
  const args = [
    builderCliPath(projectDir),
    '--mac',
    'dir',
    `--${arch}`,
    '-c.mac.identity=null',
    '-c.forceCodeSigning=false',
    `-c.directories.output=${outputDir}`,
    '--publish=never',
  ];

  if (electronDistArg) args.push(electronDistArg);

  spawnOrFail(process.execPath, args, {
    cwd: projectDir,
    env: process.env,
  });
}

function findAppBundle(outputDir) {
  const entries = fs.readdirSync(outputDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith('.app')) {
      return path.join(outputDir, entry.name);
    }
  }
  fail(`No .app bundle found in ${outputDir}`);
}

function adHocSign(appPath) {
  spawnOrFail('codesign', ['--force', '--deep', '--sign', '-', appPath], {});
  spawnOrFail('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {});
}

function packageZip(appPath, zipPath) {
  fs.rmSync(zipPath, { force: true });
  spawnOrFail('ditto', ['-c', '-k', '--keepParent', appPath, zipPath], {});
}

function main() {
  if (process.platform !== 'darwin') {
    fail('Free macOS app packaging must run on macOS.');
  }

  const arch = resolveArch(process.argv[2]);
  const projectDir = resolveProjectDir();
  const releaseRoot = resolveReleaseRoot(projectDir);
  const electronDistArg = resolveElectronDistArg();
  const pkg = loadPackageJson(projectDir);
  const productName = pkg.build?.productName ?? 'ThreeBodyLab';
  const version = pkg.version;
  const outputDir = path.join(releaseRoot, `mac-${arch}`);
  const zipPath = path.join(releaseRoot, `${productName}-${version}-mac-${arch}.zip`);

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(releaseRoot, { recursive: true });

  console.log(`\n==> package free macOS app (${arch})`);
  console.log(`project dir: ${projectDir}`);
  console.log(`output dir: ${outputDir}`);
  console.log(`zip path: ${zipPath}`);

  buildUnpackedApp(projectDir, releaseRoot, arch, electronDistArg);
  const appPath = findAppBundle(outputDir);
  adHocSign(appPath);
  packageZip(appPath, zipPath);
}

main();
