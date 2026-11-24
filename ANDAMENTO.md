# Andamento do projeto (ler no início de toda conversa nova e atualizar no fim de cada entrega)

Arquivo público: sem nomes de pessoas, senhas, tokens ou dados da empresa.

## Situação atual (24/11/2026)
- Sistema publicado: https://ipalamoni.github.io/pss-estoque/ (versão do app 2.13.0).
- Banco de produção (Supabase `kuttfnmjvzgzebjpjvvy`, "estoque-pss"): versão **2.13.0**, todas as
  conferências OK. Não mexer no projeto Supabase `pss-vendas`.
- Últimas entregas: fila inteligente das masseiras e da pesagem, avisos amarelos, tempo/tolerância por
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
- [ ] Subtítulo embaixo do nome da masseira: item 4 de um pedido ficou cortado; perguntar ao dono.
- [ ] (Opcional, fase 2) Esconder custos também no banco para pesagem/padeiro (hoje só a tela esconde).
- [ ] (Opcional) Refatoração: levar os testes para o repositório e consolidar o CSS; só se o dono aprovar.

## Pendências que dependem do dono
- [ ] Dar ao engenheiro da produção os papéis "engenharia" + "Gestor da produção".
- [ ] Preencher tempos e tolerâncias nas Fichas técnicas.
- [ ] Criar o usuário do tablet da produção.
- [ ] Embalagens em BOBINA: unidade de compra em kg + fator de conversão no cadastro.
- [ ] Revogar tokens antigos do Supabase; GitHub: segundo e-mail e verificação em 2 etapas.
- [ ] Comprar os tablets.
- [ ] Backup: quando quiser, dizer "executar backup da versão atual".
