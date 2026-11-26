@echo off
setlocal EnableDelayedExpansion
REM Projeto Artas - integracao de pedidos do ERP (TESTE: so le o ERP e gera teste_pedidos.csv, nao envia nada)
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0artas.ps1" -Modo teste
set CODIGO=%ERRORLEVEL%
if "%CODIGO%"=="3" if exist "%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" (
  echo Tentando de novo com o PowerShell 32 bits...
  "%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0artas.ps1" -Modo teste
  set CODIGO=!ERRORLEVEL!
)
echo.
echo Pronto. Veja o resultado acima e o arquivo teste_pedidos.csv nesta pasta.
pause
exit /b !CODIGO!
