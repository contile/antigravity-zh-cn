@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Antigravity 简体中文汉化 - 一键安装

echo ============================================================
echo   Antigravity 简体中文汉化工具 [antigravity-zh-cn]
echo   零依赖 ^| 自动备份 ^| SHA-256 完整校验 ^| 支持一键还原
echo ============================================================
echo.

set "REPO_DIR=%~dp0"
set "CLI_JS=%REPO_DIR%bin\cli.js"

if exist "%CLI_JS%" goto :check_running
echo [错误] 未找到核心文件: %CLI_JS%
echo 请确保完整解压了压缩包后再运行本脚本。
echo.
pause
exit /b 1

:check_running
tasklist /FI "IMAGENAME eq Antigravity.exe" 2>nul | find /I "Antigravity.exe" >nul
if errorlevel 1 goto :find_node

echo [提示] 检测到 Antigravity 正在运行，文件可能被占用。
echo        为确保安全写入，需要先关闭 Antigravity。
echo.
set "CLOSE_CHOICE=Y"
set /p "CLOSE_CHOICE=是否自动关闭 Antigravity 后继续？[Y/N，默认 Y]: "
if /I "%CLOSE_CHOICE%"=="N" goto :manual_close

echo 正在关闭 Antigravity...
taskkill /F /IM Antigravity.exe >nul 2>&1
taskkill /F /IM language_server.exe >nul 2>&1
timeout /t 2 /nobreak >nul
goto :find_node

:manual_close
echo 请先手动完全退出 Antigravity（含右下角托盘图标），再重新双击本脚本。
echo.
pause
exit /b 0

:find_node
set "NODE_CMD="
set "USE_ELECTRON_NODE=0"
where node >nul 2>&1
if not errorlevel 1 (
    set "NODE_CMD=node"
    goto :run_install
)

if exist "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" (
    set "NODE_CMD=%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe"
    set "USE_ELECTRON_NODE=1"
    goto :run_install
)
if exist "%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe" (
    set "NODE_CMD=%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe"
    set "USE_ELECTRON_NODE=1"
    goto :run_install
)
if exist "%ProgramFiles%\Antigravity\Antigravity.exe" (
    set "NODE_CMD=%ProgramFiles%\Antigravity\Antigravity.exe"
    set "USE_ELECTRON_NODE=1"
    goto :run_install
)

echo [错误] 未检测到 Node.js，也未在默认目录找到 Antigravity.exe。
echo 请安装 Node.js [https://nodejs.org] 或使用命令行手动指定路径:
echo   node bin\cli.js install --target "你的 Antigravity 安装目录"
echo.
pause
exit /b 1

:run_install
echo 正在执行中文汉化...
echo.
if "%USE_ELECTRON_NODE%"=="1" goto :run_with_electron
"%NODE_CMD%" "%CLI_JS%" install %*
set "EXIT_CODE=%ERRORLEVEL%"
goto :show_result

:run_with_electron
set "ELECTRON_RUN_AS_NODE=1"
set "LOG_FILE=%TEMP%\antigravity-zh-cn-install.log"
"%NODE_CMD%" "%CLI_JS%" install %* > "%LOG_FILE%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"
if exist "%LOG_FILE%" type "%LOG_FILE%"
del /f /q "%LOG_FILE%" >nul 2>&1

:show_result
echo.
if "%EXIT_CODE%"=="0" goto :success
echo ============================================================
echo   安装未成功，错误码: %EXIT_CODE%，请查看上方提示信息。
echo ============================================================
echo.
pause
exit /b %EXIT_CODE%

:success
echo ============================================================
echo   安装完成！现在可以重新打开 Antigravity 了。
echo ============================================================
echo.
pause
exit /b 0
