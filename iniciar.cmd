@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Ambiente Python ausente. Siga o README.md para instalar.
  pause
  exit /b 1
)
echo Abra http://localhost:8000 para conhecer o projeto ou http://localhost:8000/leitor para usar a camera.
".venv\Scripts\python.exe" run.py --open
pause
