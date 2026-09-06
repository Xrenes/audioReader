@echo off
REM Start the XTTS voice-cloning server. Leave this window open while using
REM the app. First launch downloads the ~1.8 GB model.
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\activate.bat" (
  echo No virtual environment found. Run setup.bat first.
  pause
  exit /b 1
)

call .venv\Scripts\activate.bat
set XTTS_PORT=8020
python server.py
pause
