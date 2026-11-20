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

if exist "%CLI_JS%" goto :check_running
echo [错误] 未找到核心文件: %CLI_JS%
pause
exit /b 1

:check_running
tasklist /FI "IMAGENAME eq Antigravity.exe" 2>nul | find /I "Antigravity.exe" >nul
if errorlevel 1 goto :find_node

echo [提示] 检测到 Antigravity 正在运行，还原前需要先关闭它。
echo.
set "CLOSE_CHOICE=Y"
set /p "CLOSE_CHOICE=是否自动关闭 Antigravity 后继续？[Y/N，默认 Y]: "
if /I "%CLOSE_CHOICE%"=="N" goto :manual_close

taskkill /F /IM Antigravity.exe >nul 2>&1
taskkill /F /IM language_server.exe >nul 2>&1
timeout /t 2 /nobreak >nul
goto :find_node

:manual_close
echo 请先手动完全退出 Antigravity，再重新双击本脚本。
pause
exit /b 0

:find_node
set "NODE_CMD="
set "USE_ELECTRON_NODE=0"
where node >nul 2>&1
if not errorlevel 1 (
    set "NODE_CMD=node"
    goto :run_restore
)

if exist "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" (
    set "NODE_CMD=%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe"
    set "USE_ELECTRON_NODE=1"
    goto :run_restore
)
if exist "%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe" (
    set "NODE_CMD=%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe"
    set "USE_ELECTRON_NODE=1"
    goto :run_restore
)
if exist "%ProgramFiles%\Antigravity\Antigravity.exe" (
    set "NODE_CMD=%ProgramFiles%\Antigravity\Antigravity.exe"
    set "USE_ELECTRON_NODE=1"
    goto :run_restore
)

echo [错误] 未检测到 Node.js 或 Antigravity.exe。
pause
exit /b 1

:run_restore
if "%USE_ELECTRON_NODE%"=="1" goto :run_with_electron
"%NODE_CMD%" "%CLI_JS%" restore %*
set "EXIT_CODE=%ERRORLEVEL%"
goto :done

:run_with_electron
set "ELECTRON_RUN_AS_NODE=1"
set "LOG_FILE=%TEMP%\antigravity-zh-cn-restore.log"
"%NODE_CMD%" "%CLI_JS%" restore %* > "%LOG_FILE%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"
if exist "%LOG_FILE%" type "%LOG_FILE%"
del /f /q "%LOG_FILE%" >nul 2>&1

:done
echo.
pause
exit /b %EXIT_CODE%
