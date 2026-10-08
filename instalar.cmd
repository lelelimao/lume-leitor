@echo off
cd /d "%~dp0"
title Instalar Lume
echo Preparando o Lume. Mantenha esta janela aberta.
if not exist "%~dp0scripts\instalar.ps1" (
  echo.
  echo ERRO: os arquivos do projeto nao foram extraidos por completo.
  echo Extraia todas as partes do arquivo compactado para uma pasta normal,
  echo abra essa pasta e execute instalar.cmd novamente.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\instalar.ps1"
if errorlevel 1 (
  echo.
  echo A instalacao nao terminou. Leia a mensagem acima e tente novamente.
  pause
  exit /b 1
)
echo.
echo Pronto! Execute iniciar.cmd para abrir o Lume.
pause
