# CONTEXTO DO PROJETO ARTAS · documento de passagem (25/11/2026)

> Para a IA que continuar este trabalho: leia este arquivo inteiro, depois o `CLAUDE.md` (regras permanentes,
> obrigatórias) e o `ANDAMENTO.md` (situação detalhada, versão por versão) do repositório `Ipalamoni/pss-estoque`.
> O dono do projeto NÃO é técnico: fale em português simples, diga no início de cada resposta se entendeu e o que vai
> fazer, avise o andamento em trabalhos longos e, no fim, diga o que foi feito, testado, o que ficou pendente e o que
> depende dele. Nunca peça a ele para fazer commit/push.

---

## 1. O que é o projeto

**Nome (decisão do dono, 25/11/2026):**
- O sistema se chama **Projeto Artas** (marca Artas Indústria). Quando o dono disser "Artas", é ESTE projeto.
- **PSS = Pães São Sebastião**: é a EMPRESA onde o Artas está sendo implantado como PILOTO (cliente), não o nome do
  sistema. "PSS Estoque" era só um apelido do começo, quando o sistema ainda não tinha nome e só tinha o estoque.
- `pss-estoque` e `pss-vendas` são apenas os nomes técnicos dos repositórios (o endereço do site depende deles; não
  renomear sem planejar). Em textos, telas e conversas, chamar de **Projeto Artas** (módulos: estoque/compras,
  produção, manutenção de veículos; vendas é o sistema de indicadores de vendas, em repositório separado).

**Artas Indústria** é a marca do software (símbolo "Silos": um A formado por 3 colunas), de propriedade da
**Palamoni Consultoria Empresarial** e licenciado para a **Indústria e Comércio de Pães São Sebastião (PSS)**, uma
panificadora. O dono do projeto é o Ithalo (Controladoria da PSS, administrador dos sistemas).

São **dois sistemas separados**, cada um com seu repositório e seu banco no Supabase:

| Sistema | O que faz | Repositório (GitHub, público) | Site (GitHub Pages) | Supabase (projeto · ref) |
|---|---|---|---|---|
| **Estoque / Artas** (principal) | Compras, estoque, almoxarifado, produção (masseiras, pesagem, tablets dos padeiros), custos, fichas técnicas e **Manutenção de veículos (frota)** | `Ipalamoni/pss-estoque` | https://ipalamoni.github.io/pss-estoque/ | `estoque-pss` · `kuttfnmjvzgzebjpjvvy` |
| **Vendas** | Indicadores de vendas, trocas e devoluções para diretoria, gestores e vendedores (celular) | `Ipalamoni/pss-vendas` | provavelmente https://ipalamoni.github.io/pss-vendas/ (conferir) | `pss-vendas` · `puxrntuvawwvaqtbtxle` |

Supabase: organização "Ithalo", plano **Pro**, os dois projetos em **Micro** (1 GB), backup diário automático (7 dias).
Não mexer no projeto `pss-vendas` sem o dono pedir.

---

## 2. Como o sistema do ESTOQUE é feito

- **Site estático (PWA)**, sem etapa de compilação: HTML + JavaScript em módulos (Preact + htm em
  `js/vendor/preact-htm.js`), CSS em `css/app.css`. Bibliotecas ficam em `js/vendor/` (proibido CDN).
- **Banco**: Supabase (PostgreSQL) com RLS em todas as tabelas e funções `security definer` com checagem de papel.
  O banco é quem protege; a tela só esconde botões.
- **Login**: Supabase Auth; usuário vira e-mail `usuario@estoque.pss`. Padeiros entram no tablet com senha de 6 números.
- **Função de servidor**: `supabase/functions/admin-usuarios/index.ts` (criar/editar usuários; só admin).
- **Modo demonstração**: `config.js` com `MODO: 'demo'` roda o banco inteiro no navegador (PGlite em
  `js/vendor/pglite`) com `js/demo/banco-demo.sql` (estrutura + dados fictícios). É assim que se testa antes de publicar.

### Mapa de arquivos
| Caminho | Para que serve |
|---|---|
| `index.html` | Página única; tem a Content-Security-Policy (aponta para o endereço EXATO do Supabase) |
| `config.js` | Endereço do Supabase + chave **publicável** (única chave permitida no código) + MODO |
| `versao.js`, `sw.js` | Versão do app (subir os dois a cada publicação) e service worker |
| `js/app.js` | Esqueleto: login, MENU (lista de telas e papéis), navegação, pendências (sininho) |
| `js/ui.js` | Componentes padrão (Modal, Campo, Tabela, Filtros, MultiEscolha, Exportar, avisos...) |
| `js/util.js` | PAPEIS e PERMISSOES da tela, formatação, utilidades |
| `js/api.js` | Conversa com o Supabase (ou com o banco de demonstração) |
| `js/telas/*.js` | Uma tela por arquivo (pedidos, receber, estoque, produção, maceiras, frota...) |
| `js/frota-dados.js`, `js/frota-csv.js`, `js/telas/frota*.js` | Módulo Manutenção de veículos |
| `banco/atualizar-banco-vX.Y.sql` | Cada mudança de banco (idempotente, com CONFERÊNCIA no fim) |
| `banco/00-instalar-banco-completo.sql` | Banco inteiro do zero (gerado pelo script de backup) |
| `js/demo/banco-demo.sql` | Banco de demonstração; toda atualização nova do banco também vai no fim dele |
| `ferramentas/gerar_backup.py` | Gera o backup completo (zip) |
| `ferramentas/checar_sql.py` | Confere SQL antes de aplicar (o Supabase recusa UPDATE/DELETE sem WHERE) |
| `ferramentas/modelos_backup/` | Textos do pacote de backup (prompt de reconstrução, guia do dono, leia-primeiro) |
| `CLAUDE.md` | **Regras permanentes** (segurança, UX, produção, frota, backup, publicação) |
| `ANDAMENTO.md` | **Situação atual**, versões e pendências (ler no início, atualizar no fim de cada entrega) |
| `CONTEXTO_PROJETO.md` | Este documento |

### Papéis (quem pode o quê)
admin, comprador, almoxarifado, recebimento (assistente), pesagem, engenharia, diretoria (consulta), financeiro,
faturamento, padeiro (tablet), gestor_producao, frota (manutenção de veículos).

---

## 3. Como o sistema de VENDAS é feito (resumo do que se sabe)

- Repositório com 9 arquivos: `index.html` (app inteiro, ~125 KB), `config.js`, `grupos.js`, `sw.js` (versão `pss-v10`),
  `manifest.json`, `logo.png`, `palamoni.png`, `icon-192.png`, `icon-512.png`. Não há `CLAUDE.md` nem arquivos do banco.
- Login pelo Supabase Auth (`usuario@pss-vendas.app`); o perfil fica nos metadados do usuário: `perfil` = `dir`
  (diretoria), `ger` (gestor, com `regiao`) ou `vend` (vendedor, com `colab`), mais `arquivo`.
- **Os dados NÃO ficam em tabelas**: ficam no Storage do Supabase, bucket `dados`: `dir/dados.json.gz`,
  `ger/<arquivo>.json.gz`, `vend/<arquivo>.json.gz` (JSON compactado, já filtrado por quem pode ver).
- **O programa que gera e envia esses arquivos NÃO está no repositório** (provavelmente roda no computador do dono,
  lendo o sistema da empresa). Perguntar ao dono onde está; ele precisa entrar no backup.
- Diferente do estoque, o vendas carrega bibliotecas de CDN (Chart.js, supabase-js) e Google Fonts.

---

## 4. Regras de trabalho mais importantes (o detalhe completo está no CLAUDE.md)

1. **Segurança primeiro**: nada de segredo no código; RLS + funções com checagem de papel; HTML só pelos templates
   `html\`` (nunca innerHTML com texto do usuário); validar no banco; registrar auditoria.
2. **Telas** revisadas em 390 px (celular), 800 px (tablet) e 1280 px (computador), temas claro e escuro, WCAG AA,
   alvos de toque ≥ 44 px. Telas da produção: botões grandes, textos curtos, pensando em quem tem pouca familiaridade.
3. **Avisos compactos**: lado a lado numa linha (texto curto + botão de ação), nunca faixas grandes empilhadas.
4. **Relatórios**: busca, filtros, contagem e botões (Excel, PDF, Imprimir, WhatsApp, Colunas) numa faixa só; filtros
   de vários itens com caixinhas.
5. **Frota**: NUNCA apagar dados `frota_*` (são reais). Valores sem centavos na tela. Caminhões, utilitários e carros
   nunca se misturam nas médias. Data de início do apontamento: 01/11/2026.
6. **Publicar** = testar (node --check, ESLint, demonstração) → subir versão em `versao.js` e `sw.js` → atualizar
   `ANDAMENTO.md` → commit e push direto na `main` (o GitHub Pages publica da `main`). Sem esperar o dono pedir.
7. **Banco**: arquivo novo em `banco/`, testado na demonstração (inclusive ataques: sem login, sem perfil, papel
   fraco), conferido com `checar_sql.py`, e aplicado pela Management API do Supabase com token.
8. **Token do Supabase**: antes de abrir o formulário seguro, mandar o passo a passo linha a linha (endereço
   supabase.com/dashboard/account/tokens › Generate new token › nome › validade › permissões, cada valor em bloco
   separado). O token só é colado no formulário seguro, nunca no chat. Testar com `select 1` nos dois projetos.
9. **Backup** ("executar backup da versão atual"): sempre COMPLETO (código, banco, dados, usuários sem senha, prompt de
   reconstrução, guia do dono, especificação, conferência SHA-256), com restauração testada. Dados e nomes de pessoas
   NUNCA no repositório (é público), só dentro do zip. O dono guarda no Drive em "Backups sistema estoque".

---

## 5. Linha do tempo (resumo; detalhe no ANDAMENTO.md)

- **22–23/11/2026**: v2.3–v2.13: base do sistema, atualização automática sem perder digitação, temas, painéis,
  produção (masseiras, pesagem, tablets), fila inteligente, avisos amarelos, sininho, pré-cadastro no recebimento.
- **24/11/2026**: v2.14 relatórios em faixa única e filtros múltiplos · v2.15 abrir em nova janela · v2.16/2.17 padrão
  de nomes no banco · v2.18/2.19 prazo para corrigir lançamentos · **v2.20 módulo Manutenção de veículos** (painel,
  apontar, veículos, placas a resolver, importar CSV do contas a pagar, tipos) · v2.21 correção da importação ·
  v2.22 caminhões por tipo · **v2.23 data de início do apontamento (01/11/2026) e frota protegida contra limpeza**.
- **25/11/2026**: backup completo do estoque v2.23.0 feito e testado (43 conferências OK, 6.170 registros) e entregue.
  Supabase passou para Pro + Micro. Backup do vendas iniciado e parado por falta de token válido.
  **v2.23.1**: notas da frota anteriores a 01/11 podem ser apontadas e ter a placa resolvida de forma OPCIONAL (aba
  "Antes de 01/11 (opcional)" em Apontar despesas e seção opcional em Placas a resolver), sem gerar aviso amarelo;
  no celular os avisos ficam lado a lado (2 por linha); corrigido estouro de largura na tela Início no computador.

---

## 6. ONDE ESTAMOS AGORA (25/11/2026)

- Estoque publicado na versão **2.23.1** (só tela). Banco de produção na **2.23.0**.
- **Erro ao criar usuário só com o papel "frota"** ("Marque pelo menos um papel"): a função `admin-usuarios` publicada
  no Supabase é antiga; o código certo já está no repositório. Correção: publicar a função (Supabase › Edge Functions
  › admin-usuarios › Code › colar `supabase/functions/admin-usuarios/index.ts` › Deploy) ou, com um token que tenha
  **Edge Functions = Read-write**, a IA publica. Contorno usado: criar com frota + outro papel e depois editar
  deixando só frota (editar já funciona). O dono estava criando o usuário de frota "agostinho".
- **Token do Supabase salvo no ambiente está INVÁLIDO** ("Invalid access token" nos dois projetos, inclusive o salvo
  em 25/11). Próximo token: permissões **Database = Read-write** e **Edge Functions = Read-write**.
- **Backup do VENDAS: PENDENTE** (o dono adiou). Falta: token válido; baixar estrutura, regras (RLS/Storage
  policies), usuários (sem senha) e os arquivos do bucket `dados`; incluir o programa que gera os dados; montar o zip
  no mesmo padrão do estoque; gravar a regra de backup num `CLAUDE.md` do pss-vendas.

## 7. Pendências

**Do sistema**
- [ ] Publicar a função `admin-usuarios` atualizada (ver acima).
- [ ] Backup completo do vendas (ver acima).
- [ ] Limpeza dos dados de teste: só quando o dono disser "finalizei os testes" (códigos com prefixo "T"); NUNCA a frota.
- [ ] Padeiro criar a própria senha no 1º acesso do tablet: proposta feita, aguardando o dono dizer "pode fazer".
- [ ] Subtítulo embaixo do nome da masseira (item 4 de um pedido cortado): o dono vai conferir.
- [ ] Frota, fase seguinte: consulta automática ao Firebird (mesma função `frota_importar`).
- [ ] (Opcional) esconder custos no banco para pesagem/padeiro; (opcional) refatoração/testes no repositório.

**Dependem do dono**
- [ ] Gerar token novo do Supabase (Database + Edge Functions = Read-write) e revogar os antigos.
- [ ] Dar ao engenheiro da produção os papéis "engenharia" + "Gestor da produção".
- [ ] Preencher tempos e tolerâncias nas Fichas técnicas; criar o usuário do tablet; comprar os tablets.
- [ ] Embalagens em bobina: unidade de compra em kg + fator de conversão.
- [ ] Importar o CSV do ano pela tela "Importar despesas" (frota).
- [ ] GitHub: segundo e-mail e verificação em 2 etapas.
- [ ] Guardar no Drive ("Backups sistema estoque") os backups entregues.

---

## 8. Como começar no projeto novo

1. Anexe ao projeto os dois repositórios: `Ipalamoni/pss-estoque` e `Ipalamoni/pss-vendas`.
2. Use um ambiente com acesso a `api.supabase.com` (e ao Supabase do estoque) e com o segredo de rede do token
   (host `api.supabase.com`, cabeçalho Authorization, prefixo Bearer).
3. Primeira mensagem sugerida:

   > Leia o CONTEXTO_PROJETO.md, o CLAUDE.md e o ANDAMENTO.md do pss-estoque e me diga em que ponto estamos.
