# Andamento do Projeto Artas (ler no início de toda conversa nova e atualizar no fim de cada entrega)

Nome: o sistema é o **Artas** (Artas Indústria, versão para indústria; em desenvolvimento = Projeto Artas); PSS (Pães São Sebastião) é a empresa do piloto; `pss-estoque` é só o nome
técnico do repositório (decisão do dono, 25/11/2026).

Arquivo público: sem nomes de pessoas, senhas, tokens ou dados da empresa.

## ⚠ RETOMAR AQUI (27/11/2026: o dono saiu para uma reunião)
- **PENDENTE, PRIMEIRA COISA:** aplicar `banco/atualizar-banco-v2.27.sql` (Produtos comerciais) em produção. O app
  v2.27.0 JÁ está publicado; até aplicar, só a tela "Produtos comerciais" dá erro ao abrir. Dois caminhos:
  (a) o dono cola o arquivo no SQL Editor (https://supabase.com/dashboard/project/kuttfnmjvzgzebjpjvvy/sql/new),
  Run, e as 6 linhas da conferência devem dizer OK; ou (b) token novo da Management API (o desta conversa deu
  "Invalid access token" em 27/11) e o Claude aplica. Depois de aplicado: abrir a tela como admin e conferir
  (lista vazia, aviso "N produtos vieram do ERP sem cadastro").
- Feito em 27/11: v2.26.0 (consumo médio só na janela, aplicado), v2.26.1 (carga e tempo real sob medida por
  papel), v2.27.0 (nome da produção × produto comercial), integração ERP 1.1.0 (2º destino vendas, rodando no
  servidor desde 26/11 21:42, valores em R$ chegando). Pacote de instruções do VENDAS entregue ao dono.

## Anotações anteriores (25/11/2026)
- **Backup do ESTOQUE (sistema inteiro) v2.23.0: FEITO**, restauração testada (43 conferências OK, 6170 registros,
  frota incluída) e entregue ao dono (`backup_artas_v2.23.0_2026-11-25.zip`). Ele guarda no Drive.
- **Backup do VENDAS: PENDENTE.** Repositório `Ipalamoni/pss-vendas` (site estático de 9 arquivos: index.html,
  grupos.js, config.js, sw.js, manifest.json, ícones; SEM arquivos do banco no repositório). Projeto Supabase
  `puxrntuvawwvaqtbtxle`. O banco (estrutura + funções + RLS + dados) precisa ser extraído pela Management API.
  Fazer pacote no MESMO padrão do estoque (prompt de reconstrução, guia do dono, especificação, conferência SHA-256,
  dados privados só no zip) e gravar a regra de backup num CLAUDE.md do pss-vendas.
- **TOKEN DO SUPABASE INVÁLIDO:** o segredo de rede "Supabase token claude-pss-v29" (api.supabase.com) foi trocado
  por um token novo que o Supabase recusa ("Invalid access token") nos dois projetos. Enquanto não houver token
  válido, nada de banco (nem estoque nem vendas). Token novo: supabase.com/dashboard/account/tokens › Generate new
  token › permissões: só **Database = Read-write** (resto None) › copiar o código `sbp_...` › colar SÓ o código no
  formulário seguro (sem "Bearer", sem espaço). Testar com `select 1` nos dois projetos antes de seguir.
- **25/11/2026 (2ª conversa):** repositório pss-vendas adicionado à sessão. O dono salvou um token novo, mas o Supabase
  continuou respondendo "Invalid access token" nos dois projetos; o dono adiou o backup do vendas ("depois damos
  continuidade"). Descobertas para o backup do vendas: login pelo Supabase Auth (`usuario@pss-vendas.app`, perfil
  `dir`/`ger`/`vend` + `arquivo`/`colab`/`regiao` nos metadados do usuário); os DADOS ficam no Storage, bucket
  `dados` (`dir/dados.json.gz`, `ger/<arquivo>.json.gz`, `vend/<arquivo>.json.gz`): o backup tem que baixar esses
  arquivos. O PROGRAMA QUE GERA E ENVIA esses arquivos NÃO está no repositório: perguntar ao dono onde roda
  (computador dele?) e incluí-lo no zip. Ainda falta gravar o CLAUDE.md do pss-vendas com a regra de backup.
- RESOLVIDO (26/11/2026): criar usuário só com o papel "frota" dava "Marque pelo menos um papel"; a função
  admin-usuarios foi republicada (versão 3).
- Documento de passagem para o projeto novo "Artas" no Claude Code: `CONTEXTO_PROJETO.md` (25/11/2026).
- Pergunta aberta ao dono: padeiro criar a própria senha no 1º acesso do tablet (proposta feita, aguardando "pode fazer").

## Situação atual (24/11/2026)
- Sistema publicado: https://ipalamoni.github.io/pss-estoque/ (versão do app 2.27.0).
- Banco de produção (Supabase `kuttfnmjvzgzebjpjvvy`, "estoque-pss"): versão **2.24.0**, todas as
  conferências OK. Não mexer no projeto Supabase `pss-vendas`.
- Robô do ERP (26/11/2026): 1º teste no servidor trouxe TODOS os pedidos não cancelados (13.115 em 90 dias).
  O técnico mandou a regra de "em aberto" (análise 846): `DTLIBFATURAMENTO IS NULL`. Já está no
  `consulta-pedidos.sql`. A pedido do dono, o período passou para hoje −30 a +30 dias (robô 1.0.1).
  Falta o dono rodar o teste de novo e conferir a quantidade de pedidos.
  1.0.2 (pedido do dono: nada de "robô" no servidor, para não chamar atenção): pasta `C:\Artas`, `artas.ps1`,
  `artas.log`, tarefa do Windows "Artas", login sugerido `integracao`. Pasta no repositório: `integracao/artas-erp/`.
  App 2.24.2: papel exibido como "Integração (ERP: só entrega pedidos)".
  ✅ 26/11/2026 16:18: LIGADO. Servidor SERVIDORS7 (usuário Windows do dono, pasta "Arquivos Ithalo nao apague\Artas\Artas";
  NÃO mover). Teste: 3,97 s, 394 pedidos em aberto, 64 produtos, 167.803 pacotes. Usuário `integracao` criado
  (senha temporária no config.ini do servidor). Tarefa do Windows "Artas" a cada 30 min. Próximo: dono conferir os
  pedidos mais antigos (fim de outubro) e desenhar a comparação com a produção (cadastro do produto acabado).
- v2.27.0 (27/11/2026, banco + app). ⚠ BANCO AINDA NÃO APLICADO EM PRODUÇÃO: o token da Management API desta
  conversa deixou de valer ("Invalid access token"); o dono cola `banco/atualizar-banco-v2.27.sql` no SQL Editor.
  Até lá, só a tela nova dá erro ao abrir (as demais não dependem dela).
  NOME DA PRODUÇÃO × PRODUTO COMERCIAL (decisão do dono): vários pães comerciais (marcas próprias e terceirizadas)
  saem da MESMA massa. A ficha técnica = NOME DA PRODUÇÃO (uma por massa, não por marca; rótulo trocado em Fichas
  técnicas); é o que aparece da programação até finalizar na masseira (o fluxo já usava a ficha, nada mudou nele).
  Cadastro novo "Produtos comerciais" (Cadastros, `js/telas/produtos-comerciais.js`, tabela `produtos_comerciais`):
  código e nome do ERP (nome fica COMO NO ERP, sem padronizar: tem marcas), nome da produção (ficha) e peso do pacote
  (g). Cadastro MANUAL (lançamento, produto que voltou a vender) ou pela sugestão "N produtos vieram do ERP sem
  cadastro [Cadastrar]" (`produtos_comerciais_do_erp`). Aviso "N produtos comerciais sem nome da produção
  [Resolver]". Editar: admin e engenharia (`produto_comercial`); ver: + gestor da produção (`produto_comercial_ver`).
  PRÓXIMAS FASES (contexto do dono, não fazer ainda): pedidos × produção (cobre até qual cliente, pelo de-para e peso)
  e programação da EMBALAGEM (o que foi finalizado na masseira vira quais pães comerciais). Esta etapa vai até
  finalizar na masseira. Testado: PGlite com ataques (sem login, sem perfil, padeiro, comprador, diretoria, gestor
  sem editar) e tela na demonstração (ERP → cadastro, manual, 1280/800/390, dois temas).
- v2.26.1 (27/11/2026, só app): DESEMPENHO, itens 1, 2 e 4 aprovados pelo dono (o 3, conferência espaçada,
  NÃO foi feito por decisão do dono: a conferência de 30 s/90 s é a rede de segurança do tempo real).
  1) CARGA SOB MEDIDA (`blocosDoUsuario` em app.js, pelos papéis de quem ENTROU; no "ver como" o admin segue com
  tudo): blocos compras (pedidos/itens/recebimentos), consumo (estatisticas_estoque), requisições, frota e
  fornecedores só para quem tem tela que usa. Padeiro e faturamento não buscam compras, consumo nem requisições;
  financeiro não busca o consumo. 2) TEMPO REAL só das tabelas desses blocos (`tabelasDoUsuario`: 18 em vez de 23
  para padeiro/faturamento); entrada de mercadoria só força carga completa para quem acompanha pedidos.
  4) Início não carrega mais o código das telas de pedidos/financeiro/produção (`js/resumos.js` com resumoPedido,
  entregaFin, linhasFinanceiro, AvisoFinalizar; re-exportados nos arquivos antigos); o resumo da previsão é
  baixado só por quem tem o cartão. Testado: 13 perfis da demonstração (todas as telas de cada um abrem, sem erro),
  Início em 1280/800/390 nos dois temas. Ao criar tela nova que use pedidos/consumo/requisições: incluir o id dela
  em `BLOCOS` (app.js).
- v2.26.0 (27/11/2026, banco + app; APLICADA EM PRODUÇÃO, conferências OK): DESEMPENHO. O consumo médio
  (`estatisticas_estoque`) lê só a janela do cálculo (90 dias) em vez de todo o histórico de movimentos; resultado
  idêntico (testado no PGlite com movimentos antigos, recentes e correções). A tela "Pedidos em aberto" entrou na
  lista do que fica guardado no aparelho (sw.js).
- Integração ERP programa 1.1.0 (26/11/2026, só o programa do servidor; site sem mudança): 2º destino OPCIONAL
  `config-vendas.ini` (sistema de VENDAS, Supabase puxrntuvawwvaqtbtxle): o ERP é lido uma vez e o mesmo pacote vai
  para a RPC `erp_receber_pedidos` do vendas DEPOIS do Artas; falha no vendas só vai para o log. Sem o arquivo, nada
  muda. Pacote de instruções entregue ao dono para a conversa do vendas (lá: criar tabelas/RPC, usuário de integração,
  e devolver ao dono o zip da pasta com `config-vendas.ini` + `consulta-pedidos.sql` com valores, SEM o config.ini).
  Esta conversa não tem acesso ao banco do vendas (o token só abre o projeto do Artas). Programa não testado em
  PowerShell aqui (sem PowerShell no ambiente): conferir no 1º `rodar-envio.bat` as linhas "Enviado ao Artas/VENDAS".
- v2.25.1 (26/11/2026, só tela): grupos do menu no tema CLARO em grafite claro (fundo #e8e8e4, texto grafite;
  escolha do dono entre 5 opções). Tema escuro sem mudança.
- v2.25.0 (26/11/2026, banco + tela; APLICADA EM PRODUÇÃO): módulo PREVISÃO (grupo novo no menu, por enquanto
  só admin), 1ª tela "Pedidos em aberto" (`js/telas/pedidos-erp.js`, rota `#pedidos-erp`): tabelão dos itens dos
  pedidos do ERP com busca (pedido/cliente/produto), período da venda, situação (em aberto / saiu do ERP), produto,
  grupo, vendedor e cidade; totais de pacotes e valor; Excel/PDF; selo da última atualização do ERP (laranja se
  passar de 70 min, vermelho se deu erro). Banco: `valor_unitario`/`valor_total` em `erp_pedidos_itens`;
  `pode('pedidos_erp')` = só admin. Consulta do ERP com VALOR_UNITARIO/VALOR_TOTAL: dono precisa trocar o
  `consulta-pedidos.sql` no servidor (até lá os valores ficam vazios). Próximo: abrir para outros papéis quando o
  dono mandar e montar a comparação pedidos × produção.
- v2.24.1 (26/11/2026, só tela): nomes dos grupos do menu lateral em destaque (faixa grafite da marca, texto
  branco; escolha do dono entre 4 alternativas). Menu recolhido: linha grafite entre os grupos. Sem mudança no banco.
- v2.24.0 (26/11/2026, banco + tela): INTEGRAÇÃO COM O ERP, etapa 1 (trazer os pedidos de venda em aberto).
  Banco `banco/atualizar-banco-v2.24.sql`: papel `integracao` (robô; NÃO conta como usuário ativo, só executa
  `erp_receber_pedidos`), tabelas `erp_pedidos_itens` (espelho: 1 linha por pedido × produto; saiu do ERP = removido_em)
  e `erp_sincronizacoes` (cada envio, tempo e erros); leitura `pode('pedidos_erp')` = admin, engenharia, diretoria,
  financeiro, faturamento, gestor da produção. Lista vazia não apaga nada (proteção). **APLICADO EM PRODUÇÃO em
  26/11/2026** (7 conferências OK) e função admin-usuarios republicada (versão 3: aceita frota e integracao). Testado: 32/32 (espelho,
  validações e ataques). Integração em `integracao/artas-erp/` (PowerShell + ODBC `ITHALO_PSS_CONSULTOR`, só leitura,
  a cada 30 min, modos teste/enviar, LEIA-ME com o passo a passo). O robô NÃO pôde ser executado na sessão (sem
  PowerShell aqui): o 1º teste é o `rodar-teste.bat` no servidor. Próxima etapa: cadastro de PRODUTO ACABADO
  (código do ERP + receita + pacotes por receita) e a coluna Pedidos em "Programado × produzido" (desenhar com o dono).
- v2.23.1 (25/11/2026, só tela): frota: notas ANTES da data de início (01/11/2026) podem ser apontadas e ter a placa
  resolvida se o responsável quiser (aba "Antes de 01/11 (opcional)" em Apontar despesas; seção opcional em Placas a
  resolver), SEM gerar aviso amarelo. Celular: avisos compactos lado a lado (2 por linha, sem ícone abaixo de 440 px).
  Início: corrigido estouro de largura no computador (duas colunas com minmax(0, 1fr)).
- v2.23.0 (24/11/2026, banco + tela): frota com data de início do apontamento 01/11/2026 (notas e placas anteriores
  não pedem ação; placa antiga desconhecida = despesa geral) e dados da frota protegidos contra a limpeza de testes.
- v2.22.0 (24/11/2026, só tela): Painel da frota com "Caminhões por tipo" (média por veículo, por mês e por conta de
  cada tipo: Daily/"Caminhão", 3/4, toco, truck, bitruck, cavalo, carreta) e filtro de tipos de caminhão nos gráficos.
  Categoria nova "Caminhão toco" no cadastro.
- v2.21.3 (24/11/2026, só tela): placa nunca encolhe (estava cortada ao lado de fornecedor de nome comprido);
  ficha aberta pelo Painel volta para o Painel.
- v2.21.2 (24/11/2026, só tela): histórico do veículo com valor em vermelho, conta e dados da nota em azul e placa
  em negrito maior dentro do texto da nota.
- v2.21.1 (24/11/2026, só tela): módulo da frota sem centavos (valores arredondados na tela e no PDF; Excel exato).
- v2.21.0 (24/11/2026): corrigida a importação da frota ("UPDATE requires a WHERE clause": o Supabase recusa UPDATE
  sem WHERE); importar despesas só para o administrador (menu e banco); verificador ferramentas/checar_sql.py.
- v2.20.0 (24/11/2026, banco + tela, PUBLICADO): módulo MANUTENÇÃO DE VEÍCULOS (Painel da frota com caminhões,
  utilitários e carros separados; Apontar despesas com divisão de nota entre veículos; Veículos com ficha/raio-x;
  Placas a resolver; Importar despesas; Tipos de manutenção). Banco v2.20 aplicado em produção; carga inicial feita
  (58 veículos + 43 correções de placa; arquivo privado, fora do repositório). Próximo: o dono importa o CSV do ano
  pela tela "Importar despesas". Pendente: republicar a função admin-usuarios para CRIAR usuário já com o papel
  "frota" (editar um usuário e marcar o papel já funciona). Fase seguinte: consulta automática ao Firebird.
- v2.19.0 (24/11/2026, banco + tela): consumo (no setor e pela receita) só pode ser corrigido até 1 hora depois;
  transferência não se corrige (mensagem explica: cancelar antes de recebida; depois, inventário). Aplicado em produção.
- v2.18.0 (24/11/2026, banco + tela): prazo para corrigir lançamento. Só o administrador corrige a qualquer momento;
  almoxarifado e quem lançou, só no mesmo dia. Fora do prazo aparece o aviso "Prazo para correção encerrado" com o
  botão "Ir para o Inventário". Aplicado em produção.
- v2.17.0 (24/11/2026, banco): cidades, bairros, endereços, nomes de pessoas e nome fantasia do fornecedor com cada
  palavra maiúscula ("Ribeirão Preto", "Maria da Silva"); produtos/funções/locais/fichas seguem só com a 1ª letra.
  Aplicado em produção.
- v2.16.0 (24/11/2026, banco + tela): padrão dos nomes. Todo cadastro com 1ª letra maiúscula e o resto minúsculo;
  razão social e UF todas maiúsculas; siglas conhecidas (PCP, PSS, PVC, UHT, BOPP, LTDA...) ficam maiúsculas. Feito no
  banco (gatilhos), vale para tela, planilha e pré-cadastro. Aplicado em produção: 78 nomes arrumados (na auditoria).
- v2.15.0 (24/11/2026, só tela): no computador, botão "Abrir em nova janela" no topo e Ctrl+clique (ou botão do
  meio) no menu abre a tela em outra janela do app. O tempo sem uso é contado junto por todas as janelas e sair
  numa janela tira todas.
- v2.14.0 (24/11/2026, só tela; banco continua 2.13.0): relatórios com filtros + contagem + Excel/PDF/Imprimir/
  WhatsApp/Colunas numa faixa só, e filtros de vários itens com caixinhas (locais, tipos, categorias, situações,
  grupos, usuários, padeiros...) em Estoque por local, Posição de estoque, Kardex, Produtos, Fornecedores, Pedidos,
  Pedidos a pagar, Auditoria, Histórico da produção, Fichas, Relatórios, Central de Custos, Programado × produzido,
  Saídas da produção, Inventário, Requisições, Transferências e Finalizar bateladas.
- Backup completo (24/11/2026): código + banco + dados do dia + usuários sem senhas + guia do dono + prompt.
- Entregas anteriores: fila inteligente das masseiras e da pesagem, avisos amarelos, tempo/tolerância por
  receita, sininho por responsabilidade, pré-cadastro no recebimento sem pedido, relatórios em modo
  planilha (cabeçalho e 1ª coluna travados, colunas separadas, botão "Colunas" salvo no perfil).

## Como publicar o site
- Ao terminar cada alteração: commit + push direto na `main` (o GitHub Pages publica da `main`).
  Manter também a branch da sessão atualizada.

## Supabase: plano e infraestrutura (25/11/2026)
- Organização "Ithalo" no plano **Pro** (US$ 25/mês + ~US$ 10 do 2º projeto ≈ US$ 35/mês; cartão final 9420;
  limite de gastos LIGADO). Projetos: estoque-pss e pss-vendas. Backup diário automático (7 dias), sem pausa.
- estoque-pss e pss-vendas trocados de Nano para **Micro** (1 GB; mesmo preço no Pro), os dois CONCLUÍDOS em
  25/11/2026. Caminho: Project Settings › Infrastructure › Scaling — link que funciona:
  supabase.com/dashboard/project/_/settings/infrastructure
- Uso medido: banco 18 MB, CPU ~2%, memória ~14%. Folga para anos; atenção só se anexos (fotos) ficarem no banco
  (mover para o Storage do Supabase quando crescerem).
- Postgres tem atualização disponível (17.12): NÃO fazer sem preparar (backup, horário sem uso).

## Como aplicar banco em produção
- Token do Supabase fica nos **Segredos de rede** do ambiente `pss-estoque` (host api.supabase.com,
  cabeçalho Authorization, prefixo Bearer). Para trocar: setinha ↻ "Substituir segredo".
- Antes de pedir o token, mandar o passo a passo linha a linha (regra do CLAUDE.md).
- ⚠ CAUSA dos tokens "inválidos" (resolvido 26/11/2026): no segredo de rede o campo **Prefixo** ficava VAZIO.
  Ao substituir o segredo: Nome do cabeçalho `Authorization`, Prefixo `Bearer`, Valor = `sbp_...`.
  O formulário seguro do chat fechava sozinho; o caminho que funcionou: ambiente pss-estoque › Editar ›
  Segredos de rede › Substituir segredo. Token atual "claude-artas" (30 dias, Database + Edge Functions
  Read-write) vale só para o projeto estoque-pss (no pss-vendas: sem permissão).
- Aplicar via Management API (`POST /v1/projects/{ref}/database/query`), mostrar a CONFERÊNCIA e,
  no fim, lembrar o dono de revogar o token em supabase.com/dashboard/account/tokens.

## Pendências do sistema
- [x] **Limpeza dos dados de teste: FEITA em 26/11/2026** (a pedido do dono, script rodado por ele no SQL Editor).
      Apagados: fichas técnicas (23), masseiras (4), padeiros (8), produtos de teste (86: códigos T-/MIS-T e
      2 avulsos), movimentos (364), recebimentos, estoque por local, programações/produções/bateladas,
      requisições e transferências. Ficaram: usuários (8), fornecedores (8), os 2 produtos cadastrados pelo
      comprador, frota inteira (58 veículos, 1549 despesas), locais. Saldo de todos os produtos = 0.
      Cópia de tudo que foi apagado no esquema `backup_zerar_base` (só no banco; pode ser removido depois que
      o sistema estiver rodando com dados reais). Próximo passo do dono: cadastrar masseiras e padeiros reais
      e fazer o inventário inicial.
      ⚠ NÃO APAGAR NADA DA MANUTENÇÃO DE VEÍCULOS (tabelas frota_*): veículos, despesas importadas, apontamentos,
      divisões, correções de placa e tipos são REAIS e ficam (decisão do dono, 24/11/2026; o banco também bloqueia).
- [ ] Subtítulo embaixo do nome da masseira: item 4 de um pedido ficou cortado. O dono vai conferir na tela e responder.
- [ ] (Opcional, fase 2) Esconder custos também no banco para pesagem/padeiro (hoje só a tela esconde).
- [ ] (Opcional) Refatoração: levar os testes para o repositório e consolidar o CSS; só se o dono aprovar.

## Pendências que dependem do dono
- [ ] **Aplicar o banco v2.27** (Produtos comerciais): colar `banco/atualizar-banco-v2.27.sql` no SQL Editor e conferir 6 × OK (ou criar token novo para o Claude aplicar).
- [ ] Conferir no `artas.log` do servidor se aparecem as linhas "Enviado ao VENDAS".
- [ ] Dar ao engenheiro da produção os papéis "engenharia" + "Gestor da produção".
- [ ] Preencher tempos e tolerâncias nas Fichas técnicas.
- [ ] Criar o usuário do tablet da produção.
- [ ] Embalagens em BOBINA: unidade de compra em kg + fator de conversão no cadastro.
- [ ] Revogar tokens antigos do Supabase; GitHub: segundo e-mail e verificação em 2 etapas.
- [ ] Comprar os tablets.
- [ ] Guardar no Drive ("Backups sistema estoque") o backup completo entregue em 24/11/2026.
