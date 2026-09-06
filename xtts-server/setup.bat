@echo off
REM One-time setup for the XTTS voice-cloning server (Windows, Python 3.12).
setlocal
cd /d "%~dp0"

echo Creating virtual environment (.venv)...
py -3.12 -m venv .venv || python -m venv .venv

call .venv\Scripts\activate.bat

echo Upgrading pip...
python -m pip install --upgrade pip

echo Installing requirements (this downloads PyTorch + Coqui, ~2 GB, be patient)...
pip install -r requirements.txt

echo.
echo Done. Next:
echo   1) Put a 6-30s mono WAV of your voice at  voices\my_voice.wav
echo   2) Run  run.bat
echo.
pause
