# Artas Indústria (licenciado para Pães São Sebastião): premissas permanentes de trabalho

Identidade visual: marca **Artas Indústria**, símbolo "Silos" (A formado por 3 colunas). Componente `js/marca.js`
(`MarcaArtas`, `SimboloArtas`), arquivos em `icons/artas-*.svg`, ícones do app em `icons/`. Cor: grafite #3D3D3A no
tema claro e branco no escuro (`--marca`). O logo do cliente (Pães São Sebastião) continua ao lado da marca.

Valem para TODA alteração neste projeto, sem precisar o dono pedir de novo.

## 0. Comunicação com o dono do projeto
- A cada mensagem do dono, responder logo no início, em português simples: **se entendeu** e **o que vai fazer agora**.
- Durante trabalhos longos, mandar avisos curtos de andamento ("terminei X, agora estou em Y").
- No fim, dizer claramente o que foi feito, o que foi testado, o que ficou pendente e o que depende dele.
- Sempre que precisar de um TOKEN (ex.: Supabase para aplicar o banco): ANTES de abrir o formulário seguro, mandar o
  passo a passo completo — caminho nas telas (endereço direto + menus), cada campo, e cada valor a digitar em
  LINHA/BLOCO SEPARADO para copiar e colar (nome, validade, projeto, permissões). Nunca em bloco único.
  O token só é colado no formulário seguro, nunca no chat.

- Toda conversa nova: ler o `ANDAMENTO.md` antes de começar. Ao fim de cada entrega, atualizar o
  `ANDAMENTO.md` (situação, versões, pendências) e fazer commit junto.

## BACKUP · quando o dono disser "executar backup da versão atual"
1. Conferir que tudo está commitado e publicado (git status limpo, push feito).
2. Rodar: `python3 ferramentas/gerar_backup.py --saida <pasta de rascunho> --usuarios <lista privada>` (ele monta o banco completo, gera o
   PROMPT_RECONSTRUCAO.md, a ESPECIFICACAO_DO_SISTEMA.md, o manifesto SHA-256, confere tudo e recusa se achar segredo).
3. Se o script disser que atualizou `banco/00-instalar-banco-completo.sql`, fazer commit + push e rodar de novo.
4. Entregar o zip ao dono (SendUserFile, display attach) e lembrar de guardar no Drive em "Backups sistema estoque".
5. Toda atualização nova do banco: arquivo `banco/atualizar-banco-vX.Y.sql` E acrescentar o mesmo conteúdo ao fim de
   `js/demo/banco-demo.sql` (o backup monta o banco completo a partir dos dois). A lista de usuários (sem senhas) NUNCA vai para o repositório (é público): vem do último backup (arquivo
   `usuarios.md` dentro do zip) e é passada com `--usuarios`.

## 1. Segurança máxima (prioridade número 1)
- Nunca colocar segredo no código: chave `service_role`, senhas, tokens. Só a chave **publicável** do Supabase pode ficar no `config.js`.
- Toda regra de acesso vale **no banco** (RLS + funções `security definer` com checagem de papel). A tela só esconde botões; quem protege é o banco.
- Toda tabela nova: `enable row level security` + políticas mínimas (menor privilégio). Toda função nova: `security definer`, `set search_path = public, pg_temp`, checagem de papel no início, e `revoke ... from public, anon`.
- Nunca montar HTML com texto do usuário (`innerHTML`, `dangerouslySetInnerHTML`): usar sempre os templates `html\`` (escapam sozinhos).
- Não carregar scripts de fora (CDN); bibliotecas ficam em `js/vendor/`. Manter a Content-Security-Policy do `index.html` restrita.
- Validar entradas no banco (tamanho, formato, faixa) e não só na tela.
- Arquivos enviados: conferir tipo e tamanho antes de aceitar.
- Registrar em auditoria tudo que altera dados.
- Ao mexer em login, sessão, senha, permissões ou dados sensíveis: revisar o impacto de segurança antes de publicar.
- Recomendar ao dono o que só ele pode ligar (ex.: proteção de senha vazada, MFA, backups) quando for relevante.
- Mudança no banco = arquivo novo em `banco/` (idempotente, com bloco de CONFERÊNCIA no fim), testado antes no banco
  de demonstração configurado como o Supabase (privilégios padrão + RLS ligado) e com o ataque de teste (sem login,
  conta sem perfil, papéis de pouco acesso). O dono cola no SQL Editor do Supabase.
- A Content-Security-Policy do `index.html` aponta para o endereço EXATO do Supabase: se o projeto mudar no `config.js`, mudar lá também.
- Arquivo enviado por usuário: conferir o tipo pelos bytes (`tipoRealAnexo`), nunca pela extensão; planilhas só via `lerPlanilhaIsolada` (Web Worker).

## 2. UX e UI em computador, tablet e celular
- Toda tela nova ou alterada segue o padrão do sistema (`ui.js`, `app.css`) e é revisada nas três larguras: 390 px (celular), 800 px (tablet), 1280 px (computador).
- Acessibilidade WCAG 2.1 AA: contraste ≥ 4,5:1 no texto, foco visível, tudo usável pelo teclado, rótulos em todos os campos, alvos de toque ≥ 44 px.
- Textos claros e iguais em todo lugar (o nome no menu = título da tela = atalho). Botões dizem a ação ("Salvar pedido", não "OK").
- Cartões e atalhos levam ao lugar certo já filtrado. Sem informação repetida na mesma tela.

### 2.1 Telas da PRODUÇÃO (padeiros, pesagem, operários): simplicidade acima de tudo
- Quem usa tem pouca familiaridade com informática (muitos não usam computador). Pensar como aplicativo de celular feito para quem tem dificuldade.
- Botões GRANDES (≥ 56 px de altura no tablet), de apertar com o dedo; uma ação principal por tela; nada de menus escondidos, teclado ou digitação além da senha de 6 números.
- Textos curtos, diretos, em português simples; números grandes; cores com significado fixo (verde = pode seguir, laranja = atenção, vermelho = parar) e sempre com ícone + texto (nunca só cor).
- Avisos importantes (ex.: mudança na programação) são faixas grandes e chamativas que só somem com "Entendi" + nome e senha do padeiro (fica registrado quem viu e quando).
- Nunca travar a produção em andamento: avisar e pedir confirmação simples, registrar e deixar o engenheiro corrigir depois.
- Toda ação do padeiro registra data, hora, padeiro (pela senha) e tablet; correções são feitas só por engenheiro/gestor da produção/admin, com motivo, sem apagar o original.
- Quem pode mudar ordem/masseira da produção e corrigir: admin, engenharia e "Gestor da produção".

## 3. Desempenho, atualização e falhas
- Nada que a pessoa digitou pode se perder: formulários longos usam `useRascunho`; formulários na página usam `AreaProtegida`; janelas (`Modal`) já perguntam antes de fechar.
- As telas se atualizam sozinhas quando um dado delas muda (fila única em `app.js`); a atualização nunca apaga campo em edição (`useFiltroMudou`).
- Evitar buscas repetidas em listas grandes: usar os índices de `dados.mapa` (`itensPedido`, `recPedido`, `saldoLocal`).
- Antes de publicar: `node --check` em todos os arquivos, ESLint sem erros e teste das telas com o banco de demonstração.
- Subir a versão em `versao.js` e `sw.js` a cada publicação.
