@echo off
title RePro - Office Receipt Scanner
color 0F

echo ============================================================
echo   RePro - Office Receipt Scanner & Processing Management
echo   Product of LIFEMAC Africa
echo ============================================================
echo.

:: Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH.
    echo Please download and install Node.js from: https://nodejs.org/ (LTS recommended)
    echo After installing Node.js, run this file again.
    echo.
    pause
    exit /b 1
)

echo [*] Node.js detected:
node -v
echo.

:: Install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo [*] Installing dependencies for first-time run (this may take a minute)...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

:: Build production bundle if dist is missing
if not exist "dist\" (
    echo [*] Building frontend application assets...
    call npm run build
)

echo.
echo ============================================================
echo   Starting RePro Server at http://localhost:3001
echo   Opening RePro in your web browser...
echo   (Press Ctrl+C in this window to stop the server)
echo ============================================================
echo.

:: Open default browser after a brief delay
start "" http://localhost:3001

:: Start the application
set PORT=3001
set NODE_ENV=production
node server/index.js

pause
