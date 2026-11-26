# Robô de pedidos do ERP · Projeto Artas

O robô lê no ERP (Firebird) os **pedidos de venda em aberto** e envia para o Artas a cada 30 minutos.

- **No ERP:** só lê. A consulta roda numa transação que é desfeita no fim, então nada é gravado lá.
- **Na rede:** não abre porta nenhuma. Só faz chamadas de saída para o Artas, pela internet (HTTPS).
- **Conexão:** usa a conexão ODBC que já existe no servidor (`ITHALO_PSS_CONSULTOR`). Nenhuma senha nova no ERP.
- **No Artas:** o usuário-robô **só consegue entregar pedidos**. Não lê nada nem entra em tela nenhuma.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `artas-robo.ps1` | O robô (script do PowerShell, já vem no Windows) |
| `consulta-pedidos.sql` | A consulta dos pedidos (do técnico do ERP, com período de 30 dias atrás a 30 dias à frente) |
| `config.exemplo.ini` | Modelo da configuração. Vira `config.ini` com a senha do robô |
| `rodar-teste.bat` | **Teste:** lê o ERP e gera `teste_pedidos.csv`. Não envia nada |
| `rodar-envio.bat` | **Envio:** lê o ERP e envia ao Artas (é o que o agendamento roda) |
| `instalar-agendamento.bat` | Cria a tarefa do Windows que roda o envio a cada 30 minutos |
| `remover-agendamento.bat` | Para o robô (apaga a tarefa) |
| `robo.log` | Criado sozinho: o que aconteceu em cada rodada |

## Passo a passo (uma vez só)

### 1. Copiar a pasta para o servidor
Pelo acesso remoto, crie a pasta `C:\ArtasRobo` e copie para dentro todos os arquivos desta pasta.

### 2. Criar o config.ini
1. Na pasta `C:\ArtasRobo`, copie o arquivo `config.exemplo.ini` e cole na mesma pasta.
2. Renomeie a cópia para `config.ini`.
   Se o Windows esconder as extensões, o nome aparece só como `config`.
3. Para o **teste**, não precisa mexer em nada nele.

### 3. Rodar o TESTE
1. Dê dois cliques em `rodar-teste.bat`.
2. Uma janela preta mostra o andamento e termina com "TESTE concluído".
3. Abra o `teste_pedidos.csv` no Excel e confira:
   - os pedidos são só os **em aberto**? (pedido já faturado **não** pode aparecer)
   - as quantidades batem com o ERP?
   - a quantidade está em **pacotes**?
4. Na janela aparece também quanto tempo a consulta levou.
5. Se aparecer erro, copie o texto da janela (ou mande o `robo.log`) para o Claude.

### 4. Ligar o envio (depois do teste conferido)
1. No Artas, o administrador cria o usuário do robô (o Claude passa o passo a passo):
   - login `roboerp`
   - papel **só** "Integração (robô do ERP: só entrega pedidos)"
2. Abra o `config.ini` no Bloco de Notas e, na linha `senha =`, coloque a senha do usuário-robô. Exemplo:
   ```
   senha = a-senha-do-robo
   ```
   Salve. **Não mande esse arquivo para ninguém.**
3. Dê dois cliques em `rodar-envio.bat` uma vez e veja se termina com "Enviado ao Artas".
4. Para deixar automático, clique com o botão direito em `instalar-agendamento.bat` e escolha **Executar como administrador**.
   O Windows vai pedir **a sua senha do Windows**. Pronto: a cada 30 minutos o robô roda sozinho.

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| "a conexão ODBC não foi encontrada" | Os `.bat` já tentam sozinhos o PowerShell 32 bits. Se continuar, a conexão foi criada para outro usuário do Windows: rode com o mesmo usuário que abre a conexão no "Fontes de Dados ODBC" |
| "ERRO ao ler o ERP" | Banco fora do ar ou consulta recusada: mande o `robo.log` |
| "ERRO ao enviar ao Artas" com `invalid_grant` / `Invalid login` | Senha errada no `config.ini`, ou usuário-robô sem o papel certo |
| "consulta vazia, o Artas manteve a lista anterior" | Proteção: se o ERP devolver zero pedidos, o Artas não apaga nada |

## Segurança
- **Sem senha no código:** a senha do robô fica só no `config.ini`, no servidor.
- **Trocar a senha do robô:** troque no Artas (Usuários e acessos) e no `config.ini`.
- **Parar o robô:** rode `remover-agendamento.bat`, ou desative o usuário-robô no Artas.
- **Rastro no Artas:** cada envio fica registrado (quando, quantos pedidos, tempo da consulta e erros).
