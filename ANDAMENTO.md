# Andamento do projeto (ler no início de toda conversa nova e atualizar no fim de cada entrega)

Arquivo público: sem nomes de pessoas, senhas, tokens ou dados da empresa.

## ⚠ RETOMAR AQUI (25/11/2026, conversa encerrada por tamanho)
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
- Pergunta aberta ao dono: padeiro criar a própria senha no 1º acesso do tablet (proposta feita, aguardando "pode fazer").

## Situação atual (24/11/2026)
- Sistema publicado: https://ipalamoni.github.io/pss-estoque/ (versão do app 2.23.1).
- Banco de produção (Supabase `kuttfnmjvzgzebjpjvvy`, "estoque-pss"): versão **2.23.0**, todas as
  conferências OK. Não mexer no projeto Supabase `pss-vendas`.
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
- Aplicar via Management API (`POST /v1/projects/{ref}/database/query`), mostrar a CONFERÊNCIA e,
  no fim, lembrar o dono de revogar o token em supabase.com/dashboard/account/tokens.

## Pendências do sistema
- [ ] **Limpeza dos dados de teste**: só quando o dono disser "finalizei os testes". Os dados atuais
      são de teste (códigos com prefixo "T"); manter os cadastros reais sem "T" feitos pelo dono.
      ⚠ NÃO APAGAR NADA DA MANUTENÇÃO DE VEÍCULOS (tabelas frota_*): veículos, despesas importadas, apontamentos,
      divisões, correções de placa e tipos são REAIS e ficam (decisão do dono, 24/11/2026; o banco também bloqueia).
- [ ] Subtítulo embaixo do nome da masseira: item 4 de um pedido ficou cortado. O dono vai conferir na tela e responder.
- [ ] (Opcional, fase 2) Esconder custos também no banco para pesagem/padeiro (hoje só a tela esconde).
- [ ] (Opcional) Refatoração: levar os testes para o repositório e consolidar o CSS; só se o dono aprovar.

## Pendências que dependem do dono
- [ ] Dar ao engenheiro da produção os papéis "engenharia" + "Gestor da produção".
- [ ] Preencher tempos e tolerâncias nas Fichas técnicas.
- [ ] Criar o usuário do tablet da produção.
- [ ] Embalagens em BOBINA: unidade de compra em kg + fator de conversão no cadastro.
- [ ] Revogar tokens antigos do Supabase; GitHub: segundo e-mail e verificação em 2 etapas.
- [ ] Comprar os tablets.
- [ ] Guardar no Drive ("Backups sistema estoque") o backup completo entregue em 24/11/2026.
