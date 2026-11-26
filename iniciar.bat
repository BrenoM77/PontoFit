@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado.
  echo Instale Node.js 18 ou superior e tente novamente.
  pause
  exit /b 1
)
node server.js
pause
