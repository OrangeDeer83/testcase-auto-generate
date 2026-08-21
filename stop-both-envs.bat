@echo off
setlocal enabledelayedexpansion

echo Stopping Testcase Auto Generate dev environments...
echo.

for %%P in (8000 5173 18002 5175) do (
    set FOUND=0
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P " ^| findstr "LISTENING"') do (
        echo   [stop] port %%P  ^(pid %%A^)
        taskkill /PID %%A /T /F >nul 2>&1
        set FOUND=1
    )
    if "!FOUND!"=="0" echo   [skip] port %%P not running
)

echo.
echo Done.
timeout /t 3 /nobreak >nul
endlocal
