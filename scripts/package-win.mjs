import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VALID_ARCHS = new Set(['x64', 'arm64', 'all']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveArchInput(rawArch) {
  const arch = rawArch ?? 'all';
  if (!VALID_ARCHS.has(arch)) {
    console.error(`Unsupported Windows arch "${arch}". Use x64, arm64, or all.`);
    process.exit(1);
  }
  return arch;
}

function resolveProjectDir() {
  return path.resolve(process.env.THREEBODY_PROJECT_DIR ?? path.join(__dirname, '..'));
}

function resolveReleaseRoot(projectDir) {
  return path.resolve(
    process.env.THREEBODY_RELEASE_DIR ?? path.join(projectDir, 'release', 'win-portable'),
  );
}

function resolveElectronDistArg() {
  if (!process.env.THREEBODY_ELECTRON_DIST_DIR) return null;
  return `-c.electronDist=${path.resolve(process.env.THREEBODY_ELECTRON_DIST_DIR)}`;
}

function builderCliPath(projectDir) {
  return path.join(projectDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
}

function runBuilder(projectDir, arch, releaseRoot, electronDistArg) {
  const outputDir = path.join(releaseRoot, arch);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(releaseRoot, { recursive: true });

  const args = [
    builderCliPath(projectDir),
    '--win',
    'portable',
    `--${arch}`,
    `-c.directories.output=${outputDir}`,
    '--publish=never',
  ];

  if (electronDistArg) args.push(electronDistArg);

  console.log(`\n==> package windows portable (${arch})`);
  console.log(`project dir: ${projectDir}`);
  console.log(`output dir: ${outputDir}`);

  const result = spawnSync(process.execPath, args, {
    cwd: projectDir,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const archInput = resolveArchInput(process.argv[2]);
  const archs = archInput === 'all' ? ['x64', 'arm64'] : [archInput];
  const projectDir = resolveProjectDir();
  const releaseRoot = resolveReleaseRoot(projectDir);
  const electronDistArg = resolveElectronDistArg();

  if (archInput === 'all') {
    fs.rmSync(releaseRoot, { recursive: true, force: true });
  }

  for (const arch of archs) {
    runBuilder(projectDir, arch, releaseRoot, electronDistArg);
  }
}

main();
