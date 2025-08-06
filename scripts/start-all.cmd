@echo off
REM ==========================================
REM Start all UX-Flow-Engine services (Windows)
REM ==========================================

echo Starting UX-Flow-Engine Services...

REM Build common package first
echo Building Common Package...
cd packages\common
call npm install
call npm run build
if %errorlevel% neq 0 (
    echo Failed to build Common Package
    exit /b 1
)
cd ..\..

REM Create logs directory if it doesn't exist
if not exist logs mkdir logs

REM Start services in separate windows
echo Starting API Gateway on port 3000...
start "API Gateway" cmd /c "cd services\api-gateway && npm install && npm start"
timeout /t 3 /nobreak > nul

echo Starting Cognitive Core on port 3001...
start "Cognitive Core" cmd /c "cd services\cognitive-core && npm install && npm start"
timeout /t 3 /nobreak > nul

echo Starting Knowledge Service on port 3002...
start "Knowledge Service" cmd /c "cd services\knowledge-service && npm install && npm start"
timeout /t 3 /nobreak > nul

echo Starting Flow Service on port 3003...
start "Flow Service" cmd /c "cd services\flow-service && npm install && npm start"
timeout /t 3 /nobreak > nul

echo Starting User Management on port 3004...
start "User Management" cmd /c "cd services\user-management && npm install && npm start"
timeout /t 3 /nobreak > nul

echo Starting Billing Service on port 3005...
start "Billing Service" cmd /c "cd services\billing-service && npm install && npm start"

echo.
echo All services started!
echo.
echo Services are running on:
echo   - API Gateway:       http://localhost:3000
echo   - Cognitive Core:    http://localhost:3001
echo   - Knowledge Service: http://localhost:3002
echo   - Flow Service:      http://localhost:3003
echo   - User Management:   http://localhost:3004
echo   - Billing Service:   http://localhost:3005
echo.
echo Each service is running in a separate command window.
echo Close the windows to stop the services.
pause