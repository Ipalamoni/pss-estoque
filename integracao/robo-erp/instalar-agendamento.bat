@echo off
REM Projeto Artas - cria a tarefa do Windows que roda o robo a cada 30 minutos
REM Roda com o SEU usuario do Windows (o mesmo que enxerga a conexao ODBC), mesmo sem voce estar conectado.
REM O Windows vai pedir a SUA SENHA DO WINDOWS (nao e a senha do banco nem a do Artas).
cd /d "%~dp0"
schtasks /Create /TN "Artas - robo de pedidos do ERP" /TR "\"%~dp0rodar-envio.bat\"" /SC MINUTE /MO 30 /RU "%USERDOMAIN%\%USERNAME%" /RP * /F
if errorlevel 1 (
  echo.
  echo Nao consegui criar a tarefa. Feche e abra este arquivo com o botao direito: "Executar como administrador".
) else (
  echo.
  echo Tarefa criada: o robo vai rodar a cada 30 minutos. Para conferir: abra o "Agendador de Tarefas" do Windows.
)
pause
