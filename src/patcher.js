'use strict';

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

function loadDictionaries() {
  const menuDict = JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, 'menu.json'), 'utf8'));
  const uiDict = JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, 'ui.json'), 'utf8'));
  const settingsDict = JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, 'settings.json'), 'utf8'));
  const patternsDict = JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, 'patterns.json'), 'utf8'));

  if (!menuDict.exact || typeof menuDict.exact !== 'object') {
    throw new Error('locales/zh-CN/menu.json 缺少 exact 字段');
  }
  if (!uiDict.exact || typeof uiDict.exact !== 'object') {
    throw new Error('locales/zh-CN/ui.json 缺少 exact 字段');
  }
  if (!settingsDict.exact || typeof settingsDict.exact !== 'object') {
    throw new Error('locales/zh-CN/settings.json 缺少 exact 字段');
  }
  if (!Array.isArray(patternsDict.patterns)) {
    throw new Error('locales/zh-CN/patterns.json 缺少 patterns 数组');
  }

  const mergedExact = { ...uiDict.exact, ...settingsDict.exact };
  const mergedControls = { ...(uiDict.controls || {}) };
  const mergedPatterns = [...patternsDict.patterns];

  let customLoaded = false;
  if (fs.existsSync(USER_CUSTOM_DICT_PATH)) {
    const custom = JSON.parse(fs.readFileSync(USER_CUSTOM_DICT_PATH, 'utf8'));
    if (custom.menu && typeof custom.menu === 'object') {
      Object.assign(menuDict.exact, custom.menu);
    }
    if (custom.ui && typeof custom.ui === 'object') {
      Object.assign(mergedExact, custom.ui);
    }
    if (custom.controls && typeof custom.controls === 'object') {
      Object.assign(mergedControls, custom.controls);
    }
    if (Array.isArray(custom.patterns)) {
      mergedPatterns.push(...custom.patterns);
    }
    customLoaded = true;
  }

  for (const [label, list] of [
    ['menu.json', menuDict.patterns || []],
    ['patterns.json', mergedPatterns],
  ]) {
    for (const item of list) {
      if (typeof item.regex !== 'string' || typeof item.replace !== 'string') {
        throw new Error(`${label} 中存在非法正则项: ${JSON.stringify(item)}`);
      }
      new RegExp(item.regex, item.flags || '');
    }
  }

  return {
    menuDict,
    rendererDict: {
      exact: mergedExact,
      controls: mergedControls,
      patterns: mergedPatterns,
    },
    stats: {
      menuExactCount: Object.keys(menuDict.exact).length,
      menuPatternCount: (menuDict.patterns || []).length,
      uiExactCount: Object.keys(mergedExact).length,
      uiControlCount: Object.keys(mergedControls).length,
      uiPatternCount: mergedPatterns.length,
      customLoaded,
    },
  };
}

function inspectAsarBuffer(rawBuffer) {
  const parsed = parseAsar(rawBuffer);
  const pkgBuf = readFileFromAsar(parsed, 'package.json');
  const mainBuf = readFileFromAsar(parsed, 'dist/main.js');
  const preloadBuf = readFileFromAsar(parsed, 'dist/preload.js');
  const metaBuf = readFileFromAsar(parsed, META_ASAR_PATH);

  if (!pkgBuf || !mainBuf || !preloadBuf) {
    throw new Error('目标 app.asar 不是有效的 Antigravity 桌面端包（缺少 package.json / dist/main.js / dist/preload.js）');
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

function stripMarkers(source) {
  const startIdx = source.indexOf(PATCH_MARKER_START);
  if (startIdx === -1) return source;
  const endIdx = source.indexOf(PATCH_MARKER_END, startIdx);
  if (endIdx === -1) return source;
  return source.slice(0, startIdx) + source.slice(endIdx + PATCH_MARKER_END.length);
}

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

function injectPreloadJs(originalPreloadJs, rendererDict) {
  const clean = stripMarkers(originalPreloadJs);
  return clean + buildPreloadSnippet(rendererDict);
}

function buildPatchedAsarBuffer(cleanAsarBuf) {
  const dicts = loadDictionaries();
  const parsed = parseAsar(cleanAsarBuf);
  const info = inspectAsarBuffer(cleanAsarBuf);

  const origMainBuf = readFileFromAsar(parsed, 'dist/main.js');
  const origPreloadBuf = readFileFromAsar(parsed, 'dist/preload.js');
  if (!origMainBuf || !origPreloadBuf) {
    throw new Error('app.asar 中缺少 dist/main.js 或 dist/preload.js');
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

function atomicWriteFile(targetPath, dataBuffer) {
  const tmpPath = `${targetPath}.zh-cn.tmp`;
  try {
    fs.writeFileSync(tmpPath, dataBuffer);
    try {
      fs.renameSync(tmpPath, targetPath);
    } catch (renameErr) {
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
    } catch {}
    if (err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
      const wrapped = new Error(
        `无法写入 ${targetPath} (${err.code})，请先完全退出 Antigravity（含托盘图标）后重试。`
      );
      wrapped.code = err.code;
      throw wrapped;
    }
    throw err;
  }
}

function installPatch(asarPath) {
  const backupPath = getBackupPath(asarPath);
  const currentBuf = fs.readFileSync(asarPath);
  const currentInfo = inspectAsarBuffer(currentBuf);

  let cleanBaseBuf;
  let backupAction;

  if (!currentInfo.patched) {
    // Official unpatched app.asar (fresh install or post-update): refresh backup first.
    atomicWriteFile(backupPath, currentBuf);
    cleanBaseBuf = currentBuf;
    backupAction = 'created-or-refreshed';
  } else {
    if (!fs.existsSync(backupPath)) {
      throw new Error(
        `当前 app.asar 已打过补丁，但未找到原版备份 ${backupPath}，请先恢复官方 app.asar。`
      );
    }
    const backupBuf = fs.readFileSync(backupPath);
    const backupInfo = inspectAsarBuffer(backupBuf);
    if (backupInfo.patched) {
      throw new Error(`备份文件 ${backupPath} 并非原版，已中止操作。`);
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

function restoreBackup(asarPath) {
  const backupPath = getBackupPath(asarPath);
  if (!fs.existsSync(backupPath)) {
    throw new Error(`未找到原版备份：${backupPath}`);
  }

  const backupBuf = fs.readFileSync(backupPath);
  const verification = verifyAsarBuffer(backupBuf);
  const info = inspectAsarBuffer(backupBuf);
  if (info.patched) {
    throw new Error(`备份文件 ${backupPath} 并非原版，已中止还原。`);
  }

  atomicWriteFile(asarPath, backupBuf);
  fs.unlinkSync(backupPath);

  return {
    asarPath,
    restoredAppVersion: info.appVersion,
    verification,
  };
}

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
