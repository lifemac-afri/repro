@echo off
title RePro [Development Mode]
color 0B

echo ============================================================
echo   RePro - Office Receipt Scanner [DEVELOPMENT MODE]
echo   Product of LIFEMAC Africa
echo ============================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [*] Installing dependencies...
    call npm install
)

echo [*] Starting Vite Frontend and Express Backend concurrently...
echo [*] App will be live at http://localhost:5173
echo.

call npm run dev
pause
