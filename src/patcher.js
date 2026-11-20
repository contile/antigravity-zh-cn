'use strict';

/**
 * Core installer / restorer / status checker for antigravity-zh-cn.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseAsar, readFileFromAsar, patchAsarBuffer, verifyAsarBuffer } = require('./asar');

const ROOT_DIR = path.resolve(__dirname, '..');
const LOCALE_DIR = path.join(ROOT_DIR, 'locales', 'zh-CN');
const RUNTIME_DIR = path.join(__dirname, 'runtime');
const USER_CUSTOM_DICT_PATH = path.join(os.homedir(), '.antigravity-zh-cn', 'custom.json');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));

const PATCH_MARKER_START = '/* __ANTIGRAVITY_ZH_CN_START__ */';
const PATCH_MARKER_END = '/* __ANTIGRAVITY_ZH_CN_END__ */';
const META_ASAR_PATH = 'dist/zh-cn-meta.json';

function getBackupPath(asarPath) {
  return `${asarPath}.zh-cn.bak`;
}

/**
 * Load and validate all Chinese locale dictionary files.
 */
function loadDictionaries() {
  const menuPath = path.join(LOCALE_DIR, 'menu.json');
  const uiPath = path.join(LOCALE_DIR, 'ui.json');
  const patternsPath = path.join(LOCALE_DIR, 'patterns.json');

  const menuDict = JSON.parse(fs.readFileSync(menuPath, 'utf8'));
  const uiDict = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
  const patternsDict = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));

  if (!menuDict.exact || typeof menuDict.exact !== 'object') {
    throw new Error('Invalid locales/zh-CN/menu.json: missing "exact" object.');
  }
  if (!uiDict.exact || typeof uiDict.exact !== 'object') {
    throw new Error('Invalid locales/zh-CN/ui.json: missing "exact" object.');
  }
  if (!Array.isArray(patternsDict.patterns)) {
    throw new Error('Invalid locales/zh-CN/patterns.json: missing "patterns" array.');
  }

  let customLoaded = false;
  if (fs.existsSync(USER_CUSTOM_DICT_PATH)) {
    const custom = JSON.parse(fs.readFileSync(USER_CUSTOM_DICT_PATH, 'utf8'));
    if (custom.menu && typeof custom.menu === 'object') {
      Object.assign(menuDict.exact, custom.menu);
    }
    if (custom.ui && typeof custom.ui === 'object') {
      Object.assign(uiDict.exact, custom.ui);
    }
    if (Array.isArray(custom.patterns)) {
      patternsDict.patterns.push(...custom.patterns);
    }
    customLoaded = true;
  }

  // Validate all regex patterns compile cleanly
  for (const [label, list] of [
    ['menu.json', menuDict.patterns || []],
    ['patterns.json', patternsDict.patterns],
  ]) {
    for (const item of list) {
      if (typeof item.regex !== 'string' || typeof item.replace !== 'string') {
        throw new Error(`Invalid pattern entry in ${label}: ${JSON.stringify(item)}`);
      }
      new RegExp(item.regex, item.flags || '');
    }
  }

  return {
    menuDict,
    uiDict,
    patternsDict,
    customLoaded,
    rendererDict: {
      exact: uiDict.exact,
      patterns: patternsDict.patterns,
    },
    stats: {
      menuExactCount: Object.keys(menuDict.exact).length,
      menuPatternCount: (menuDict.patterns || []).length,
      uiExactCount: Object.keys(uiDict.exact).length,
      uiPatternCount: patternsDict.patterns.length,
      customLoaded,
    },
  };
}

/**
 * Inspect an ASAR archive buffer to read Antigravity metadata and patch status.
 * @param {Buffer} rawBuffer
 */
function inspectAsarBuffer(rawBuffer) {
  const parsed = parseAsar(rawBuffer);
  const pkgBuf = readFileFromAsar(parsed, 'package.json');
  const mainBuf = readFileFromAsar(parsed, 'dist/main.js');
  const preloadBuf = readFileFromAsar(parsed, 'dist/preload.js');
  const metaBuf = readFileFromAsar(parsed, META_ASAR_PATH);

  if (!pkgBuf || !mainBuf || !preloadBuf) {
    throw new Error(
      'This app.asar does not appear to be an Antigravity Desktop archive (missing package.json, dist/main.js, or dist/preload.js).'
    );
  }

  const appPkg = JSON.parse(pkgBuf.toString('utf8'));
  const mainText = mainBuf.toString('utf8');
  const preloadText = preloadBuf.toString('utf8');
  const patched =
    Boolean(metaBuf) ||
    mainText.includes(PATCH_MARKER_START) ||
    preloadText.includes(PATCH_MARKER_START);

  let patchMeta = null;
  if (metaBuf) {
    try {
      patchMeta = JSON.parse(metaBuf.toString('utf8'));
    } catch {
      patchMeta = null;
    }
  }

  return {
    appName: appPkg.productName || appPkg.name || 'Antigravity',
    appVersion: appPkg.version || 'unknown',
    patched,
    patchMeta,
  };
}

/**
 * Strip any previous injected snippet between markers (safety guard).
 */
function stripMarkers(source) {
  const startIdx = source.indexOf(PATCH_MARKER_START);
  if (startIdx === -1) return source;
  const endIdx = source.indexOf(PATCH_MARKER_END, startIdx);
  if (endIdx === -1) return source;
  return source.slice(0, startIdx) + source.slice(endIdx + PATCH_MARKER_END.length);
}

/**
 * Inject main-process localization require line right after `"use strict";`.
 */
function injectMainJs(originalMainJs) {
  const clean = stripMarkers(originalMainJs);
  const snippet = [
    PATCH_MARKER_START,
    `try { require('./zh-cn-main.js'); } catch (e) { console.error('[antigravity-zh-cn]', e); }`,
    PATCH_MARKER_END,
  ].join('\n');

  const strictMatch = clean.match(/^(['"]use strict['"];?\r?\n)/);
  if (strictMatch) {
    return strictMatch[1] + snippet + '\n' + clean.slice(strictMatch[1].length);
  }
  return snippet + '\n' + clean;
}

/**
 * Build a completely self-contained preload snippet (works in Electron sandboxed preloads).
 */
function buildPreloadSnippet(rendererDict) {
  const preloadRuntimeSrc = fs
    .readFileSync(path.join(RUNTIME_DIR, 'preload-hook.js'), 'utf8')
    .replace(/^['"]use strict['"];?\r?\n/, '');

  const dictJson = JSON.stringify(rendererDict);

  return [
    '',
    PATCH_MARKER_START,
    '(function __antigravityZhCnPreload() {',
    '  try {',
    '    const module = undefined;',
    preloadRuntimeSrc,
    `    const __DICT__ = ${dictJson};`,
    '    installDomLocalization(__DICT__);',
    '  } catch (e) {',
    "    console.error('[antigravity-zh-cn] Preload hook failed:', e);",
    '  }',
    '})();',
    PATCH_MARKER_END,
    '',
  ].join('\n');
}

/**
 * Inject renderer DOM localization snippet at the end of `dist/preload.js`.
 */
function injectPreloadJs(originalPreloadJs, rendererDict) {
  const clean = stripMarkers(originalPreloadJs);
  return clean + buildPreloadSnippet(rendererDict);
}

/**
 * Produce a patched ASAR buffer from a clean base ASAR buffer (pure in-memory, testable).
 * @param {Buffer} cleanAsarBuf
 */
function buildPatchedAsarBuffer(cleanAsarBuf) {
  const dicts = loadDictionaries();
  const parsed = parseAsar(cleanAsarBuf);
  const info = inspectAsarBuffer(cleanAsarBuf);

  const origMainBuf = readFileFromAsar(parsed, 'dist/main.js');
  const origPreloadBuf = readFileFromAsar(parsed, 'dist/preload.js');
  if (!origMainBuf || !origPreloadBuf) {
    throw new Error('Missing dist/main.js or dist/preload.js inside app.asar.');
  }

  const mainHookBuf = fs.readFileSync(path.join(RUNTIME_DIR, 'main-hook.js'));
  const menuDictBuf = Buffer.from(JSON.stringify(dicts.menuDict, null, 2), 'utf8');

  const patchedMain = injectMainJs(origMainBuf.toString('utf8'));
  const patchedPreload = injectPreloadJs(origPreloadBuf.toString('utf8'), dicts.rendererDict);

  const meta = {
    tool: PKG.name,
    toolVersion: PKG.version,
    targetAppName: info.appName,
    targetAppVersion: info.appVersion,
    patchedAt: new Date().toISOString(),
    stats: dicts.stats,
  };

  const overrides = new Map([
    ['dist/main.js', Buffer.from(patchedMain, 'utf8')],
    ['dist/preload.js', Buffer.from(patchedPreload, 'utf8')],
    ['dist/zh-cn-main.js', mainHookBuf],
    ['dist/zh-cn-menu.json', menuDictBuf],
    [META_ASAR_PATH, Buffer.from(JSON.stringify(meta, null, 2), 'utf8')],
  ]);

  const patchedBuf = patchAsarBuffer(cleanAsarBuf, overrides);
  const verification = verifyAsarBuffer(patchedBuf);

  return {
    buffer: patchedBuf,
    meta,
    verification,
  };
}

/**
 * Replace a file on disk atomically via a temp sibling file, with friendly lock errors.
 */
function atomicWriteFile(targetPath, dataBuffer) {
  const tmpPath = `${targetPath}.zh-cn.tmp`;
  try {
    fs.writeFileSync(tmpPath, dataBuffer);
    try {
      fs.renameSync(tmpPath, targetPath);
    } catch (renameErr) {
      // On Windows, replacing an existing file can sometimes need copyFileSync fallback
      if (renameErr && (renameErr.code === 'EPERM' || renameErr.code === 'EEXIST')) {
        fs.copyFileSync(tmpPath, targetPath);
        fs.unlinkSync(tmpPath);
      } else {
        throw renameErr;
      }
    }
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup error
    }
    if (err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
      const wrapped = new Error(
        `无法写入 ${targetPath}（错误码：${err.code}）。\n` +
          '请先完全退出 Antigravity（包括系统右下角托盘/菜单栏图标），必要时以管理员权限运行后重试。'
      );
      wrapped.code = err.code;
      throw wrapped;
    }
    throw err;
  }
}

/**
 * Install (or update) the Chinese localization into the specified `app.asar`.
 * @param {string} asarPath
 */
function installPatch(asarPath) {
  const backupPath = getBackupPath(asarPath);
  const currentBuf = fs.readFileSync(asarPath);
  const currentInfo = inspectAsarBuffer(currentBuf);

  let cleanBaseBuf;
  let backupAction;

  if (!currentInfo.patched) {
    // Current app.asar is an unpatched official version (first install or post-update).
    // Always refresh the backup from this clean version.
    atomicWriteFile(backupPath, currentBuf);
    cleanBaseBuf = currentBuf;
    backupAction = 'created-or-refreshed';
  } else {
    // Already patched: re-patch cleanly from the saved backup.
    if (!fs.existsSync(backupPath)) {
      throw new Error(
        `检测到 ${asarPath} 已被汉化，但找不到原版备份文件 ${backupPath}。\n` +
          '为避免重复注入，请先重新安装 Antigravity 或恢复官方 app.asar 后再执行汉化。'
      );
    }
    const backupBuf = fs.readFileSync(backupPath);
    const backupInfo = inspectAsarBuffer(backupBuf);
    if (backupInfo.patched) {
      throw new Error(`备份文件 ${backupPath} 本身已被修改，已中止操作以确保安全。`);
    }
    cleanBaseBuf = backupBuf;
    backupAction = 'reused-existing';
  }

  const { buffer: patchedBuf, meta, verification } = buildPatchedAsarBuffer(cleanBaseBuf);
  atomicWriteFile(asarPath, patchedBuf);

  return {
    asarPath,
    backupPath,
    backupAction,
    meta,
    verification,
  };
}

/**
 * Restore the original unpatched `app.asar` from backup.
 * @param {string} asarPath
 */
function restoreBackup(asarPath) {
  const backupPath = getBackupPath(asarPath);
  if (!fs.existsSync(backupPath)) {
    throw new Error(`未找到备份文件：${backupPath}。当前可能尚未安装过汉化，或备份已被移除。`);
  }

  const backupBuf = fs.readFileSync(backupPath);
  const verification = verifyAsarBuffer(backupBuf);
  const info = inspectAsarBuffer(backupBuf);
  if (info.patched) {
    throw new Error(`备份文件 ${backupPath} 并非原版文件，已中止还原。`);
  }

  atomicWriteFile(asarPath, backupBuf);
  fs.unlinkSync(backupPath);

  return {
    asarPath,
    restoredAppVersion: info.appVersion,
    verification,
  };
}

/**
 * Return current localization status of an `app.asar`.
 * @param {string} asarPath
 */
function getStatus(asarPath) {
  const backupPath = getBackupPath(asarPath);
  const currentBuf = fs.readFileSync(asarPath);
  const info = inspectAsarBuffer(currentBuf);

  return {
    asarPath,
    backupPath,
    hasBackup: fs.existsSync(backupPath),
    ...info,
  };
}

module.exports = {
  PATCH_MARKER_START,
  PATCH_MARKER_END,
  META_ASAR_PATH,
  getBackupPath,
  loadDictionaries,
  inspectAsarBuffer,
  buildPatchedAsarBuffer,
  installPatch,
  restoreBackup,
  getStatus,
};
