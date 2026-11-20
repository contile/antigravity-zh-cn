# antigravity-zh-cn

[![CI](https://github.com/contile/antigravity-zh-cn/actions/workflows/ci.yml/badge.svg)](https://github.com/contile/antigravity-zh-cn/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/contile/antigravity-zh-cn)](https://github.com/contile/antigravity-zh-cn/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Google Antigravity 桌面端（2.0+）的简体中文汉化补丁，支持 Windows / macOS / Linux。

基于实机前端资源提取词库，直接对 `app.asar` 做增量修改并重算 SHA-256 校验，不改可执行文件、无第三方依赖，自带原版备份和一键还原。

## 覆盖范围

- **主进程外壳**：应用顶部菜单、系统托盘（含运行中智能体计数）、右键菜单、WSL 菜单、原生退出/错误弹窗
- **主界面与侧边栏**：对话列表、项目/工作区、工作树与 Git 提交、搜索、输入框提示、快捷键面板
- **设置与权限**：常规、外观、模型配额、终端沙箱、沙箱外命令、文件/网络/GitHub 权限策略及各项说明文案
- **扩展与工具面板**：产物 (Artifacts)、子智能体、后台任务、终端、内置浏览器、MCP 服务器、插件市场、自动化/定时任务、语音模式、远程控制与 SSH

## 使用方法

> 执行前请先退出 Antigravity（Windows 脚本也会自动检测并提示关闭）。

### Windows

1. 在 [Releases](https://github.com/contile/antigravity-zh-cn/releases) 下载压缩包并解压（或 `git clone https://github.com/contile/antigravity-zh-cn.git`）。
2. 双击运行根目录下的 **`一键安装中文汉化.bat`**。
3. 重新打开 Antigravity 即可。

未安装 Node.js 也可以直接运行——脚本在找不到全局 `node` 时会自动调用 Antigravity 内置的 Electron Node 运行时。

需要恢复英文原版时，双击 **`一键还原官方英文.bat`**。

### macOS / Linux

```bash
git clone https://github.com/contile/antigravity-zh-cn.git
cd antigravity-zh-cn

# 安装汉化（macOS 会自动执行 ad-hoc 重签名）
bash scripts/install.sh

# 还原官方原版
bash scripts/restore.sh
```

### 命令行用法

```bash
node bin/cli.js install          # 安装或更新词库
node bin/cli.js restore          # 还原原版 app.asar
node bin/cli.js status           # 查看当前安装路径、版本与补丁状态
node bin/cli.js validate-dict    # 校验词库 JSON 与正则
node bin/cli.js install --target "D:\Apps\Antigravity"  # 手动指定路径
```

## 工作方式

1. **增量修补 `app.asar`**：直接读写 ASAR 头部和目标文件块，不动 `node_modules`，写入前对全包做 SHA-256 校验；原版文件备份在同目录 `app.asar.zh-cn.bak`。官方自动更新覆盖 `app.asar` 后，重新跑一次安装即可自动刷新备份并重新打补丁。
2. **主进程菜单代理**：拦截 `Menu` / `Tray` / `dialog` 接口替换显示文案，并用 `Proxy` 在菜单回调中保留原始英文 `label`，避免影响官方检查更新和 WSL 子菜单的内部查找逻辑。
3. **沙箱渲染层翻译**：内联注入到 `dist/preload.js`（兼容 `sandbox: true`），仅在本地 Hub 源（`127.0.0.1` / `localhost` / `plugin:`）生效。严格跳过代码块、编辑器、终端、图标字体、文件树、用户消息和 AI 回复正文；短单词仅在按钮/标签/菜单等控件上下文替换，防止误伤正文。

## 进阶选项

### 自定义词库

在用户目录下新建 `~/.antigravity-zh-cn/custom.json`（Windows 为 `C:\Users\<用户名>\.antigravity-zh-cn\custom.json`），重新运行一次安装即可合并生效，更新仓库不覆盖：

```json
{
  "menu": {
    "Check for Updates": "检查新版本"
  },
  "ui": {
    "New Feature": "新功能"
  },
  "patterns": [
    {
      "regex": "^(\\d+)\\s+items?\\s+selected$",
      "flags": "i",
      "replace": "已选 $1 项"
    }
  ]
}
```

### 临时用英文启动

不还原文件，单次以英文启动：

```powershell
# Windows PowerShell
$env:ANTIGRAVITY_ZH_CN="0"; & "$env:LOCALAPPDATA\Programs\antigravity\Antigravity.exe"
```

```bash
# macOS
ANTIGRAVITY_ZH_CN=0 /Applications/Antigravity.app/Contents/MacOS/Antigravity
```

### 排查漏翻词条

带环境变量 `ANTIGRAVITY_ZH_CN_DEBUG=1` 启动后，在 DevTools 控制台里可以看到 `[antigravity-zh-cn][untranslated]` 输出，方便补充词库。

## 常见问题

- **Antigravity 更新后变回英文**：正常现象，更新会覆盖 `app.asar`，重新运行安装脚本即可。
- **Windows 提示无法写入 / `EBUSY`**：Antigravity 还在后台（可能在右下角托盘里），彻底退出后重试。
- **macOS 提示应用损坏或闪退**：手动执行一次 `codesign --force --deep --sign - "/Applications/Antigravity.app"`。

## 参与维护

发现漏翻、错译或新版本文案变动，欢迎提 Issue 或直接改 `locales/zh-CN/` 提 PR，提交前跑一下 `npm run validate-dict && npm test` 即可，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

[MIT](LICENSE)
