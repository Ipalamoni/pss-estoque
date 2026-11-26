@echo off
setlocal EnableDelayedExpansion
REM Projeto Artas - integracao de pedidos do ERP (ENVIO: le o ERP e envia ao Artas; e o que o agendamento roda)
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0artas.ps1" -Modo enviar
set CODIGO=%ERRORLEVEL%
if "%CODIGO%"=="3" if exist "%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" (
  echo Tentando de novo com o PowerShell 32 bits...
  "%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0artas.ps1" -Modo enviar
  set CODIGO=!ERRORLEVEL!
)
exit /b !CODIGO!
