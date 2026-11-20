@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Antigravity 简体中文汉化 - 一键还原官方英文

echo ============================================================
echo   Antigravity 简体中文汉化工具 - 无损还原官方原版
echo ============================================================
echo.

set "REPO_DIR=%~dp0"
set "CLI_JS=%REPO_DIR%bin\cli.js"

if not exist "%CLI_JS%" (
    echo [错误] 未找到核心文件: %CLI_JS%
    pause
    exit /b 1
)

tasklist /FI "IMAGENAME eq Antigravity.exe" 2>nul | find /I "Antigravity.exe" >nul
if %ERRORLEVEL%==0 (
    echo [提示] 检测到 Antigravity 正在运行，还原前需要先关闭它。
    set /p "CLOSE_CHOICE=是否自动关闭 Antigravity 后继续？(Y/N，默认 Y): "
    if /I "!CLOSE_CHOICE!"=="N" (
        echo 请先手动退出 Antigravity，再重新双击本脚本。
        pause
        exit /b 0
    )
    taskkill /F /IM Antigravity.exe >nul 2>&1
    taskkill /F /IM language_server.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
)

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
            goto :run_restore
        )
    )
)

:run_restore
if "!NODE_CMD!"=="" (
    echo [错误] 未检测到 Node.js 或 Antigravity.exe。
    pause
    exit /b 1
)

if defined ELECTRON_RUN_AS_NODE (
    set "LOG_FILE=%TEMP%\antigravity-zh-cn-restore.log"
    "!NODE_CMD!" "%CLI_JS%" restore %* > "!LOG_FILE!" 2>&1
    set "EXIT_CODE=!ERRORLEVEL!"
    type "!LOG_FILE!"
    del /f /q "!LOG_FILE!" >nul 2>&1
) else (
    "!NODE_CMD!" "%CLI_JS%" restore %*
    set "EXIT_CODE=!ERRORLEVEL!"
)

echo.
pause
exit /b %EXIT_CODE%
