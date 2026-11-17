@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 launch.py
) else (
  where python >nul 2>nul
  if not errorlevel 1 (
    python launch.py
  ) else (
    echo Python 3 was not found. Please install Python 3 or open index.html directly.
  )
)
pause
