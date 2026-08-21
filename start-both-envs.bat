@echo off
setlocal

set MAIN_DIR=D:\CHENGWEI.LIU\ai_application\Testcase_Auto_Generate
set DEV_DIR=D:\CHENGWEI.LIU\ai_application\Testcase_Auto_Generate-dev
set LOG_DIR=%MAIN_DIR%\logs

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo ============================================
echo   Testcase Auto Generate - Start Both Envs
echo   (servers run hidden in background, no console windows)
echo ============================================
echo.

rem ---- Main env backend (uvicorn, 0.0.0.0:8000) ----
netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo [skip]  Main-Backend  port 8000 already listening
) else (
    echo [start] Main-Backend  port 8000   - log: logs\main-backend.log
    powershell -NoProfile -Command "Start-Process cmd.exe -WindowStyle Hidden -ArgumentList '/c cd /d %MAIN_DIR%\backend && call .venv\Scripts\activate.bat && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 >> %LOG_DIR%\main-backend.log 2>&1'"
)

rem ---- Main env frontend (vite, 5173) ----
netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo [skip]  Main-Frontend port 5173 already listening
) else (
    echo [start] Main-Frontend port 5173   - log: logs\main-frontend.log
    powershell -NoProfile -Command "Start-Process cmd.exe -WindowStyle Hidden -ArgumentList '/c cd /d %MAIN_DIR%\frontend && npm run dev >> %LOG_DIR%\main-frontend.log 2>&1'"
)

rem ---- Dev/test env backend (uvicorn, 18002) ----
netstat -ano | findstr ":18002 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo [skip]  Dev-Backend   port 18002 already listening
) else (
    echo [start] Dev-Backend   port 18002  - log: logs\dev-backend.log
    powershell -NoProfile -Command "Start-Process cmd.exe -WindowStyle Hidden -ArgumentList '/c cd /d %DEV_DIR%\backend && call .venv\Scripts\activate.bat && set CORS_ORIGINS=http://localhost:5175,http://localhost:5173 && uvicorn app.main:app --reload --port 18002 >> %LOG_DIR%\dev-backend.log 2>&1'"
)

rem ---- Dev/test env frontend (vite, 5175) ----
netstat -ano | findstr ":5175 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo [skip]  Dev-Frontend  port 5175 already listening
) else (
    echo [start] Dev-Frontend  port 5175   - log: logs\dev-frontend.log
    powershell -NoProfile -Command "Start-Process cmd.exe -WindowStyle Hidden -ArgumentList '/c cd /d %DEV_DIR%\frontend && set PORT=5175 && npm run dev >> %LOG_DIR%\dev-frontend.log 2>&1'"
)

echo.
echo Done. No console windows - servers keep running hidden in the background.
echo Logs:      %LOG_DIR%\*.log
echo To stop:   run stop-both-envs.bat
echo Main env:  http://localhost:5173   (or http://10.197.162.131:5173)
echo Dev env:   http://localhost:5175
echo.
echo This window closes automatically in a few seconds...
timeout /t 4 /nobreak >nul
endlocal
