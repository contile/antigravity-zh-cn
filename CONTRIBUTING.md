# 贡献说明

词库文件都在 `locales/zh-CN/` 下：

- `menu.json`：系统顶部菜单、托盘菜单、右键菜单、原生弹窗
- `ui.json`：主界面短语（`exact`）和单字/单词控件标签（`controls`）
- `settings.json`：设置页标题、选项及说明文案
- `patterns.json`：带数字或动态参数的正则规则（必须以 `^...$` 锚定）

## 定位漏翻词条

带 `ANTIGRAVITY_ZH_CN_DEBUG=1` 启动 Antigravity，打开 DevTools Console 即可看到未命中词库的控件文案：

```powershell
# Windows
$env:ANTIGRAVITY_ZH_CN_DEBUG="1"
& "$env:LOCALAPPDATA\Programs\antigravity\Antigravity.exe"
```

```bash
# macOS
ANTIGRAVITY_ZH_CN_DEBUG=1 /Applications/Antigravity.app/Contents/MacOS/Antigravity
```

## 提交前检查

```bash
npm run validate-dict
npm test
```
