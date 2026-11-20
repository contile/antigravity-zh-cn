# 贡献指南 (Contributing Guide)

欢迎为 **antigravity-zh-cn** 贡献翻译词条、版本适配或功能改进！

## 1. 补充或优化中文词条（最简单）

所有中文词库均位于 `locales/zh-CN/` 目录，采用纯 JSON 格式：

| 文件 | 覆盖范围 |
| :--- | :--- |
| `locales/zh-CN/menu.json` | Electron 顶部应用菜单、系统托盘菜单、右键菜单、原生系统弹窗 |
| `locales/zh-CN/ui.json` | Antigravity 主界面静态文案（侧边栏、设置页、辅助面板、按钮、提示等） |
| `locales/zh-CN/patterns.json` | 带数字或动态变量的正则规则（如 `3 files changed`、`5 minutes ago`） |

### 翻译规范建议

1. **保持技术术语一致性**：如 `Workspace` → `工作区`、`Subagents` → `子智能体`、`Artifacts` → `产物 (Artifacts)`、`Terminal Sandbox` → `终端沙箱`。
2. **保护专有名词**：保留 `Antigravity`、`Git`、`SSH`、`WSL`、`MCP`、`JSON`、`Markdown` 等通用技术专有名词不强行意译。
3. **动态规则务必严格锚定**：`patterns.json` 中的正则必须使用 `^...$` 完整锚定，避免误替换用户代码或对话正文。

## 2. 使用内置漏翻发现模式（Debug Mode）

启动 Antigravity 时设置环境变量 `ANTIGRAVITY_ZH_CN_DEBUG=1`，运行时会在开发者工具（DevTools）Console 中输出尚未匹配词库的短界面英文文案（前缀 `[antigravity-zh-cn][untranslated]`），方便快速定位漏翻词条：

**Windows (PowerShell):**
```powershell
$env:ANTIGRAVITY_ZH_CN_DEBUG="1"
& "$env:LOCALAPPDATA\Programs\antigravity\Antigravity.exe"
```

**macOS / Linux:**
```bash
ANTIGRAVITY_ZH_CN_DEBUG=1 /Applications/Antigravity.app/Contents/MacOS/Antigravity
```

## 3. 提交前本地校验

提交 Pull Request 前，请运行以下两条命令确保词库合法且所有单元测试通过：

```bash
npm run validate-dict
npm test
```

感谢你的每一份贡献！
