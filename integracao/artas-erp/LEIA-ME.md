# Integração de pedidos do ERP · Projeto Artas

O Artas lê no ERP (Firebird) os **pedidos de venda em aberto** e os envia para o sistema a cada 30 minutos.

- **No ERP:** só lê. A consulta roda numa transação que é desfeita no fim, então nada é gravado lá.
- **Na rede:** não abre porta nenhuma. Só faz chamadas de saída para o Artas, pela internet (HTTPS).
- **Conexão:** usa a conexão ODBC que já existe no servidor (`ITHALO_PSS_CONSULTOR`). Nenhuma senha nova no ERP.
- **No Artas:** o usuário de integração **só consegue entregar pedidos**. Não lê nada nem entra em tela nenhuma.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `artas.ps1` | O programa (script do PowerShell, que já vem no Windows) |
| `consulta-pedidos.sql` | A consulta dos pedidos em aberto (do técnico do ERP), de 30 dias atrás até 30 dias à frente |
| `config.ini` | Configuração. Para o envio, recebe a senha do usuário de integração |
| `config.exemplo.ini` | Cópia de reserva da configuração, sem senha |
| `rodar-teste.bat` | **Teste:** lê o ERP e gera `teste_pedidos.csv`. Não envia nada |
| `rodar-envio.bat` | **Envio:** lê o ERP e envia ao Artas (é o que o agendamento roda) |
| `instalar-agendamento.bat` | Cria a tarefa "Artas" no Windows, que roda o envio a cada 30 minutos |
| `remover-agendamento.bat` | Para o envio automático (apaga a tarefa) |
| `artas.log` | Criado sozinho: o que aconteceu em cada rodada |

## Passo a passo (uma vez só)

### 1. Colocar a pasta no servidor
Extraia o zip em `C:\`. Vai ficar a pasta `C:\Artas` com os arquivos dentro.

### 2. Rodar o TESTE
1. Dê dois cliques em `rodar-teste.bat`.
2. **Não clique dentro da janela preta enquanto ele roda.** Se clicar e o título mostrar "Selecionar", aperte **Esc** para continuar.
3. A janela mostra o andamento e termina com "TESTE concluído".
4. Abra o `teste_pedidos.csv` no Excel e confira:
   - os pedidos são só os **em aberto**? (pedido já faturado **não** pode aparecer)
   - as quantidades batem com o ERP?
5. Na janela aparece também quanto tempo a consulta levou.
6. Se aparecer erro, copie o texto da janela (ou mande o `artas.log`) para o Claude.

### 3. Ligar o envio (depois do teste conferido)
1. No Artas, o administrador cria o usuário de integração (o Claude passa o passo a passo):
   - login `integracao`
   - papel **só** "Integração"
2. Abra o `config.ini` no Bloco de Notas e, na linha `senha =`, coloque a senha desse usuário. Exemplo:
   ```
   senha = a-senha-aqui
   ```
   Salve. **Não mande esse arquivo para ninguém.**
3. Dê dois cliques em `rodar-envio.bat` uma vez e veja se termina com "Enviado ao Artas".
4. Para deixar automático, clique com o botão direito em `instalar-agendamento.bat` e escolha **Executar como administrador**.
   O Windows vai pedir **a sua senha do Windows**. Pronto: a cada 30 minutos o envio roda sozinho.

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| "a conexão ODBC não foi encontrada" | Os `.bat` já tentam sozinhos o PowerShell 32 bits. Se continuar, a conexão foi criada para outro usuário do Windows: rode com o mesmo usuário que abre a conexão no "Fontes de Dados ODBC" |
| "ERRO ao ler o ERP" | Banco fora do ar ou consulta recusada: mande o `artas.log` |
| "ERRO ao enviar ao Artas" com `invalid_grant` / `Invalid login` | Senha errada no `config.ini`, ou usuário de integração sem o papel certo |
| "consulta vazia, o Artas manteve a lista anterior" | Proteção: se o ERP devolver zero pedidos, o Artas não apaga nada |

## Segurança
- **Sem senha no código:** a senha fica só no `config.ini`, no servidor.
- **Trocar a senha:** troque no Artas (Usuários e acessos) e no `config.ini`.
- **Parar o envio:** rode `remover-agendamento.bat`, ou bloqueie o usuário de integração no Artas.
- **Rastro no Artas:** cada envio fica registrado (quando, quantos pedidos, tempo da consulta e erros).
