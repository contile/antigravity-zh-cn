@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Antigravity 简体中文汉化 - 一键安装

echo ============================================================
echo   Antigravity 简体中文汉化工具 (antigravity-zh-cn)
echo   零依赖 ^| 自动备份 ^| SHA-256 完整校验 ^| 支持一键还原
echo ============================================================
echo.

set "REPO_DIR=%~dp0"
set "CLI_JS=%REPO_DIR%bin\cli.js"

if not exist "%CLI_JS%" (
    echo [错误] 未找到核心文件: %CLI_JS%
    echo 请确保完整解压了压缩包后再运行本脚本。
    echo.
    pause
    exit /b 1
)

:: 1. 检查 Antigravity 是否正在运行
tasklist /FI "IMAGENAME eq Antigravity.exe" 2>nul | find /I "Antigravity.exe" >nul
if %ERRORLEVEL%==0 (
    echo [提示] 检测到 Antigravity 正在运行，文件可能被占用。
    echo        为确保安全写入，需要先关闭 Antigravity。
    echo.
    set /p "CLOSE_CHOICE=是否自动关闭 Antigravity 后继续？(Y/N，默认 Y): "
    if /I "!CLOSE_CHOICE!"=="N" (
        echo 请先手动完全退出 Antigravity（含右下角托盘图标），再重新双击本脚本。
        echo.
        pause
        exit /b 0
    )
    echo 正在关闭 Antigravity...
    taskkill /F /IM Antigravity.exe >nul 2>&1
    taskkill /F /IM language_server.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
)

:: 2. 选择 Node.js 运行时（优先系统 node，否则复用 Antigravity 内置 Electron Node 运行时）
set "NODE_CMD="
where node >nul 2>&1
if %ERRORLEVEL%==0 (
    set "NODE_CMD=node"
)

if "!NODE_CMD!"=="" (
    for %%P in (
        "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe"
        "%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe"
        "%ProgramFiles%\Antigravity\Antigravity.exe"
    ) do (
        if exist %%~P (
            set "ELECTRON_RUN_AS_NODE=1"
            set "NODE_CMD=%%~P"
            goto :run_install
        )
    )
)

:run_install
if "!NODE_CMD!"=="" (
    echo [错误] 未检测到 Node.js，也未在默认目录找到 Antigravity.exe。
    echo 请安装 Node.js (https://nodejs.org) 或使用命令行手动指定路径:
    echo   node bin\cli.js install --target "你的 Antigravity 安装目录"
    echo.
    pause
    exit /b 1
)

echo 正在执行中文汉化...
echo.
if defined ELECTRON_RUN_AS_NODE (
    set "LOG_FILE=%TEMP%\antigravity-zh-cn-install.log"
    "!NODE_CMD!" "%CLI_JS%" install %* > "!LOG_FILE!" 2>&1
    set "EXIT_CODE=!ERRORLEVEL!"
    type "!LOG_FILE!"
    del /f /q "!LOG_FILE!" >nul 2>&1
) else (
    "!NODE_CMD!" "%CLI_JS%" install %*
    set "EXIT_CODE=!ERRORLEVEL!"
)

echo.
if %EXIT_CODE%==0 (
    echo ============================================================
    echo   安装完成！现在可以重新打开 Antigravity 了。
    echo ============================================================
) else (
    echo ============================================================
    echo   安装未成功（错误码: %EXIT_CODE%），请查看上方提示信息。
    echo ============================================================
)
echo.
pause
exit /b %EXIT_CODE%
