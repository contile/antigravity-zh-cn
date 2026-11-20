#!/usr/bin/env node
'use strict';

// Ensure .asar files are treated as regular binary files even when running under ELECTRON_RUN_AS_NODE=1.
process.noAsar = true;

const path = require('path');
const fs = require('fs');
const { locateAntigravityAsar, locateAppBundleRoot } = require('../src/locator');
const { installPatch, restoreBackup, getStatus, loadDictionaries } = require('../src/patcher');

const PKG = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));

function printHelp() {
  console.log(`
Antigravity 简体中文汉化工具 (antigravity-zh-cn v${PKG.version})

用法:
  node bin/cli.js <command> [options]

命令:
  install         安装或更新简体中文汉化（自动备份原版 app.asar）
  restore         无损还原为官方原版英文界面
  status          检查当前 Antigravity 安装路径、版本与汉化状态
  validate-dict   校验中文词库 JSON 格式与正则表达式合法性

选项:
  --target <path> 手动指定 Antigravity 安装目录或 app.asar 文件路径
  -v, --version   显示版本号
  -h, --help      显示帮助信息

示例:
  node bin/cli.js install
  node bin/cli.js restore
  node bin/cli.js status
  node bin/cli.js install --target "C:\\Users\\You\\AppData\\Local\\Programs\\antigravity"

环境变量:
  ANTIGRAVITY_ASAR_PATH  指定 app.asar 路径（等效于 --target）
  ANTIGRAVITY_ZH_CN=0    启动 Antigravity 时临时禁用汉化（不修改文件）
`);
}

function parseArgs(argv) {
  let command = null;
  let target = undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      return { command: 'help' };
    }
    if (arg === '-v' || arg === '--version') {
      return { command: 'version' };
    }
    if (arg === '--target' || arg === '-t') {
      target = argv[++i];
      if (!target) {
        throw new Error('选项 --target 缺少路径参数。');
      }
      continue;
    }
    if (arg.startsWith('--target=')) {
      target = arg.slice('--target='.length);
      continue;
    }
    if (!command && !arg.startsWith('-')) {
      command = arg;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  return { command: command || 'help', target };
}

function main() {
  const { command, target } = parseArgs(process.argv.slice(2));

  if (command === 'help') {
    printHelp();
    return;
  }

  if (command === 'version') {
    console.log(`${PKG.name} v${PKG.version}`);
    return;
  }

  if (command === 'validate-dict') {
    const { stats } = loadDictionaries();
    console.log('[OK] 词库校验通过');
    console.log(`  - 菜单/弹窗: ${stats.menuExactCount} 条精确 + ${stats.menuPatternCount} 条规则`);
    console.log(
      `  - 界面/设置: ${stats.uiExactCount} 条短语 + ${stats.uiControlCount} 条控件词 + ${stats.uiPatternCount} 条规则`
    );
    return;
  }

  const asarPath = locateAntigravityAsar(target);

  if (command === 'status') {
    const status = getStatus(asarPath);
    console.log(`目标文件: ${status.asarPath}`);
    console.log(`应用名称: ${status.appName}`);
    console.log(`应用版本: ${status.appVersion}`);
    console.log(`汉化状态: ${status.patched ? '已安装简体中文汉化' : '官方原版（未汉化）'}`);
    console.log(`原版备份: ${status.hasBackup ? `存在 (${status.backupPath})` : '无'}`);
    if (status.patchMeta) {
      console.log(`补丁版本: v${status.patchMeta.toolVersion} (${status.patchMeta.patchedAt})`);
    }
    return;
  }

  if (command === 'install') {
    console.log(`定位到 Antigravity: ${asarPath}`);
    const result = installPatch(asarPath);
    console.log('');
    console.log('[OK] Antigravity 简体中文汉化安装成功！');
    console.log(`  - 目标版本: ${result.meta.targetAppName} v${result.meta.targetAppVersion}`);
    console.log(
      `  - 词条数量: 菜单 ${result.meta.stats.menuExactCount}+${result.meta.stats.menuPatternCount}，界面 ${result.meta.stats.uiExactCount}+${result.meta.stats.uiControlCount}+${result.meta.stats.uiPatternCount}`
    );
    console.log(
      `  - 完整校验: 已通过 ${result.verification.checkedIntegrity}/${result.verification.fileCount} 个文件 SHA-256 校验`
    );
    console.log(`  - 原版备份: ${result.backupPath}`);
    if (process.platform === 'darwin') {
      const appBundle = locateAppBundleRoot(asarPath);
      if (appBundle) {
        console.log('');
        console.log('[macOS 提示] 如重新打开时提示应用已损坏或闪退，请执行自签名命令:');
        console.log(`  codesign --force --deep --sign - "${appBundle}"`);
      }
    }
    console.log('');
    console.log('现在可以重新启动 Antigravity 体验中文界面。');
    return;
  }

  if (command === 'restore') {
    console.log(`定位到 Antigravity: ${asarPath}`);
    const result = restoreBackup(asarPath);
    console.log('');
    console.log('[OK] 已无损还原为官方原版 Antigravity！');
    console.log(`  - 还原版本: v${result.restoredAppVersion}`);
    console.log(
      `  - 完整校验: 已通过 ${result.verification.checkedIntegrity}/${result.verification.fileCount} 个文件 SHA-256 校验`
    );
    return;
  }

  throw new Error(`未知命令: "${command}"。运行 --help 查看支持的命令。`);
}

try {
  main();
} catch (err) {
  console.error('');
  console.error(`[ERROR] ${err.message || err}`);
  process.exit(1);
}
