@echo off
REM launch.cmd -- true one-click entry point. Double-click this file.
REM Double-clicking a .ps1 opens it in an editor by default on Windows, so this
REM tiny shim invokes PowerShell with an execution-policy bypass for the session
REM (does not change any machine policy) and hands off to launch.ps1 next to it.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" %*
endlocal
