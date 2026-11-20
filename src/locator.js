'use strict';

/**
 * Cross-platform locator for Google Antigravity Desktop installations.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Resolve candidate `resources/app.asar` paths for the current OS.
 * @returns {string[]}
 */
function getCandidatePaths() {
  const candidates = [];
  const home = os.homedir();

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    candidates.push(
      path.join(localAppData, 'Programs', 'antigravity', 'resources', 'app.asar'),
      path.join(localAppData, 'Programs', 'Antigravity', 'resources', 'app.asar'),
      path.join(localAppData, 'Programs', 'antigravity-insiders', 'resources', 'app.asar'),
      path.join(programFiles, 'Antigravity', 'resources', 'app.asar'),
      path.join(programFilesX86, 'Antigravity', 'resources', 'app.asar')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Antigravity.app/Contents/Resources/app.asar',
      path.join(home, 'Applications', 'Antigravity.app', 'Contents', 'Resources', 'app.asar'),
      '/Applications/Antigravity Insiders.app/Contents/Resources/app.asar',
      path.join(home, 'Applications', 'Antigravity Insiders.app', 'Contents', 'Resources', 'app.asar')
    );
  } else {
    candidates.push(
      '/opt/Antigravity/resources/app.asar',
      '/opt/antigravity/resources/app.asar',
      '/usr/lib/antigravity/resources/app.asar',
      '/usr/share/antigravity/resources/app.asar',
      path.join(home, '.local', 'share', 'antigravity', 'resources', 'app.asar'),
      path.join(home, 'Applications', 'antigravity', 'resources', 'app.asar')
    );
  }

  return [...new Set(candidates)];
}

/**
 * Normalize a user-provided target path (app directory, resources dir, .app bundle, or app.asar file)
 * into an absolute path pointing to `app.asar`.
 * @param {string} targetPath
 * @returns {string}
 */
function resolveAsarPath(targetPath) {
  const resolved = path.resolve(targetPath);

  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return resolved;
  }

  const probes = [
    path.join(resolved, 'app.asar'),
    path.join(resolved, 'resources', 'app.asar'),
    path.join(resolved, 'Contents', 'Resources', 'app.asar'),
  ];

  for (const probe of probes) {
    if (fs.existsSync(probe) && fs.statSync(probe).isFile()) {
      return probe;
    }
  }

  throw new Error(
    `Could not find app.asar under "${targetPath}". Please pass the Antigravity install directory or exact app.asar path.`
  );
}

/**
 * Locate the Antigravity `app.asar` path, using explicit `--target` if provided,
 * otherwise scanning platform-standard installation locations.
 * @param {string | undefined} customTarget
 * @returns {string}
 */
function locateAntigravityAsar(customTarget) {
  if (customTarget) {
    return resolveAsarPath(customTarget);
  }

  if (process.env.ANTIGRAVITY_ASAR_PATH) {
    return resolveAsarPath(process.env.ANTIGRAVITY_ASAR_PATH);
  }

  const candidates = getCandidatePaths();
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  throw new Error(
    [
      'Antigravity installation not found automatically.',
      'Checked paths:',
      ...candidates.map((p) => `  - ${p}`),
      'Tip: Pass --target "<path-to-antigravity-or-app.asar>" manually.',
    ].join('\n')
  );
}

/**
 * Locate the Antigravity executable adjacent to `resources/app.asar`, if present.
 * @param {string} asarPath
 * @returns {string | null}
 */
function locateAppBundleRoot(asarPath) {
  const resourcesDir = path.dirname(asarPath);
  if (process.platform === 'darwin') {
    const contentsDir = path.dirname(resourcesDir);
    const appDir = path.dirname(contentsDir);
    return appDir.endsWith('.app') ? appDir : null;
  }
  return path.dirname(resourcesDir);
}

module.exports = {
  getCandidatePaths,
  resolveAsarPath,
  locateAntigravityAsar,
  locateAppBundleRoot,
};
