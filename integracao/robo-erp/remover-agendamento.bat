@echo off
REM Projeto Artas - remove a tarefa do robo (para parar de enviar)
schtasks /Delete /TN "Artas - robo de pedidos do ERP" /F
pause
