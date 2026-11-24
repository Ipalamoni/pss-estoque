# Andamento do projeto (ler no início de toda conversa nova e atualizar no fim de cada entrega)

Arquivo público: sem nomes de pessoas, senhas, tokens ou dados da empresa.

## Situação atual (24/11/2026)
- Sistema publicado: https://ipalamoni.github.io/pss-estoque/ (versão do app 2.15.0).
- Banco de produção (Supabase `kuttfnmjvzgzebjpjvvy`, "estoque-pss"): versão **2.13.0**, todas as
  conferências OK. Não mexer no projeto Supabase `pss-vendas`.
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

## Como aplicar banco em produção
- Token do Supabase fica nos **Segredos de rede** do ambiente `pss-estoque` (host api.supabase.com,
  cabeçalho Authorization, prefixo Bearer). Para trocar: setinha ↻ "Substituir segredo".
- Antes de pedir o token, mandar o passo a passo linha a linha (regra do CLAUDE.md).
- Aplicar via Management API (`POST /v1/projects/{ref}/database/query`), mostrar a CONFERÊNCIA e,
  no fim, lembrar o dono de revogar o token em supabase.com/dashboard/account/tokens.

## Pendências do sistema
- [ ] **Limpeza dos dados de teste**: só quando o dono disser "finalizei os testes". Os dados atuais
      são de teste (códigos com prefixo "T"); manter os cadastros reais sem "T" feitos pelo dono.
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
