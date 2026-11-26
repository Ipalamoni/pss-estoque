@echo off
REM Projeto Artas - remove a tarefa do Artas (para parar de enviar)
schtasks /Delete /TN "Artas" /F
pause
