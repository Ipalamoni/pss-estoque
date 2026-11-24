# PROMPT DE RECONSTRUÇÃO · ARTAS INDÚSTRIA v@@VERSAO@@

> **Para o dono:** arraste a pasta inteira (ou o zip) para a conversa com a IA (Claude, ChatGPT ou outra) e escreva:
> **"Leia o PROMPT_RECONSTRUCAO.md e me guie para reconstruir o sistema do zero."**
> A IA vai te conduzir passo a passo. Você não precisa saber programar.

---

## 1. Quem você (IA) é e o que deve fazer

Você vai reconstruir do zero o sistema **Artas Indústria** (compras, estoque e produção, licenciado para a
Pães São Sebastião), versão **@@VERSAO@@** (código `@@COMMIT@@`, backup de @@DATA@@), e deixá-lo **idêntico**
ao original: mesmas telas, cores, marca, menus, botões, funções, regras de segurança, usuários e dados.

**Regra principal: NÃO reescreva nem "melhore" nenhum código.** O sistema já está inteiro em `site/`, o banco
inteiro em `site/banco/00-instalar-banco-completo.sql` e os dados do dia em `DADOS_PRIVADOS/restaurar-dados.sql`.
A identidade exata vem de usar **esses arquivos sem alterar um byte**. A ÚNICA mudança permitida é a do passo 6
(endereço do Supabase novo), e só se o projeto do Supabase for outro.

## 2. Como conduzir o dono (OBRIGATÓRIO)

O dono **não é técnico** e muitos passos acontecem nas telas dele (GitHub, Supabase). Então:

1. Responda sempre em **português simples**. A cada mensagem dele, diga primeiro se entendeu e o que vai fazer agora.
2. **Um passo de cada vez.** Explique o passo, espere ele dizer "feito" (ou mandar um print) e só então siga.
3. Para cada passo nas telas: dê o **endereço direto** (ex.: https://supabase.com/dashboard), o **caminho de menus**
   (ex.: menu da esquerda › SQL Editor › New query), o **nome exato do botão** e cada **valor a digitar numa linha
   ou bloco separado**, para copiar e colar. Nunca junte vários valores num bloco só.
4. **Nunca** peça senha, token ou chave secreta no chat. Se precisar de um token, explique onde criar e oriente a
   colar só no formulário seguro da ferramenta (ou ele mesmo usa no site). Diga para ele guardar as senhas num
   lugar seguro (gerenciador de senhas ou caderno guardado), nunca no zip.
5. Se ele mandar um print com erro, leia com calma, explique o que aconteceu em uma frase e diga o próximo clique.
6. Use o arquivo `GUIA_DO_DONO.md` (tem o passo a passo tela a tela, escrito para ele). Você pode mandar trechos dele.
7. Se você tiver ferramentas próprias (acesso ao GitHub, terminal, API do Supabase, como no Claude Code), faça você
   mesmo a parte técnica (enviar arquivos, rodar SQL) e deixe para o dono só o que exige a conta/senha dele.
8. Ao final, mostre o resultado de cada CONFERÊNCIA e diga claramente o que está pronto e o que falta.

## 3. O que tem no pacote

| Arquivo / pasta | O que é |
|---|---|
| `LEIA-PRIMEIRO.md` | Resumo para o dono |
| `GUIA_DO_DONO.md` | Passo a passo tela a tela, para quem não é técnico |
| `ESPECIFICACAO_DO_SISTEMA.md` | Papéis, permissões, menu, cores, marca e telas (gerado do código) |
| `site/` | O sistema inteiro, exatamente como publicado (é o conteúdo do repositório do GitHub) |
| `site/CLAUDE.md` | **Regras permanentes de trabalho do projeto** (segurança, telas, comunicação). Leia e siga. |
| `site/ANDAMENTO.md` | Situação, pendências e histórico recente do projeto |
| `site/banco/00-instalar-banco-completo.sql` | Cria o banco inteiro do zero (estrutura, segurança, funções) |
| `site/supabase/functions/admin-usuarios/index.ts` | Função do servidor que cria usuários e redefine senhas |
| `DADOS_PRIVADOS/restaurar-dados.sql` | **Confidencial.** Todos os dados de @@DATA@@ + usuários (sem senhas) |
| `DADOS_PRIVADOS/usuarios.md` | **Confidencial.** Lista de usuários, nomes e papéis |
| `CONFERENCIA/` | Impressão digital (SHA-256) de cada arquivo e scripts que provam que ficou idêntico |

## 4. O que é o sistema (para você entender)

- Aplicativo web instalável (PWA) em JavaScript puro com Preact + htm, **sem etapa de compilação**: os arquivos
  de `site/` são publicados como estão. Abre no navegador do computador, tablet e celular. Hospedado no **GitHub Pages**.
- Dados no **Supabase** (PostgreSQL): login, banco, tempo real e a função `admin-usuarios`.
- Toda regra de acesso está no banco (RLS + funções `security definer` com checagem de papel). A tela só esconde botões.
- Bibliotecas já incluídas em `site/js/vendor/` (nada é baixado de CDN).
- Login: o usuário digita só o nome (ex.: `@@ADMIN@@`); por baixo, o e-mail é `nome@estoque.pss`.
- Padeiros entram no tablet com senha de 6 números (tabela `operadores`, guardada como hash).

## 5. Passo a passo da reconstrução

### Passo 1 · Conferir o pacote
Rode `python3 CONFERENCIA/conferir_arquivos.py site` na pasta descompactada. Tem que dizer
`TODOS OS ARQUIVOS IDÊNTICOS`. Se não tiver como rodar (IA sem terminal), pule e confira no passo 9.

### Passo 2 · Contas
O dono precisa de conta no **GitHub** e no **Supabase** (GUIA_DO_DONO, parte A). Se ele ainda tiver as contas
antigas, use-as. Recomende ligar a verificação em duas etapas nas duas.

### Passo 3 · Banco de dados (Supabase)
1. Criar **projeto novo**: nome `estoque-pss`, região **South America (São Paulo)**, senha forte do banco
   (o dono guarda; NUNCA no zip nem no chat).
2. **SQL Editor › New query**: colar `site/banco/00-instalar-banco-completo.sql` INTEIRO › **Run**.
   No fim aparecem tabelas de CONFERÊNCIA: todas as linhas devem dizer `OK`.
   (O arquivo é grande; se o editor travar ao colar, use "Upload" ou divida nos blocos marcados pelos comentários.)
3. **Authentication › Sign In / Providers**: Email **ligado**; "Allow new users to sign up" **DESLIGADO**;
   "Confirm email" pode ficar como está; "Allow anonymous sign-ins" **DESLIGADO**.
4. **Project Settings › API Keys** (ou "API"): anotar a **Project URL** (`https://XXXX.supabase.co`) e a chave
   **publishable** (`sb_publishable_…`). A chave **secret / service_role NUNCA** vai para o site nem para o chat.

### Passo 4 · Restaurar os dados de @@DATA@@
**SQL Editor › New query**: colar `DADOS_PRIVADOS/restaurar-dados.sql` INTEIRO › **Run**.
- Recria os usuários com o mesmo login (sem senha) e todos os dados: cadastros, pedidos, estoque, produção,
  fichas técnicas, auditoria e preferências.
- No fim, a tabela de CONFERÊNCIA deve mostrar `OK` em todas as linhas.
- Ele se recusa a rodar num banco que já tenha pedidos/movimentos/produções (proteção contra sobrescrever).
- Se o dono quiser começar **sem** os dados antigos, pule este passo e use o passo 7B.

### Passo 5 · Função do servidor `admin-usuarios`
1. **Edge Functions › Deploy a new function › Via Editor**: nome **exatamente** `admin-usuarios`.
2. Apagar o exemplo, colar `site/supabase/functions/admin-usuarios/index.ts` sem alterar › **Deploy**.
3. Nos detalhes da função: **Verify JWT** (ou "Enforce JWT verification") **DESLIGADO** (a função confere
   o login e o papel de admin por dentro).
4. **Edge Functions › Secrets**: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já existem
   sozinhas. Só crie `ORIGENS_PERMITIDAS` se o site ficar num endereço diferente de `https://ipalamoni.github.io`
   (valor: o endereço novo, ex.: `https://NOVO-USUARIO.github.io`).

### Passo 6 · Apontar o site para o Supabase novo (SÓ se o projeto for novo)
Trocar `kuttfnmjvzgzebjpjvvy` (o projeto antigo) pelo código do projeto novo em EXATAMENTE 2 arquivos:
1. `site/config.js`: `SUPABASE_URL` e `SUPABASE_CHAVE_PUBLICAVEL` (a publishable do passo 3.4). `MODO: 'supabase'`.
2. `site/index.html`: na linha `Content-Security-Policy`, as DUAS ocorrências (`https://…supabase.co` e
   `wss://…supabase.co`). Se esquecer, o site não consegue falar com o banco.
Nada mais muda.

### Passo 7 · Publicar o site (GitHub Pages)
1. Criar repositório **público** `pss-estoque` (o plano gratuito do GitHub só publica Pages de repositório público;
   por isso o repositório nunca tem senhas nem dados).
2. Enviar TODO o conteúdo de `site/` para a **raiz** do repositório, incluindo o arquivo `.nojekyll`
   (no envio pelo navegador, o GitHub aceita até 100 arquivos por vez: veja GUIA_DO_DONO, parte D).
3. **Settings › Pages**: Source "Deploy from a branch", branch `main`, pasta `/ (root)` › **Save**.
4. Em 1 a 3 minutos o site abre em `https://USUARIO.github.io/pss-estoque/`.

### Passo 8 · Senhas dos usuários
**8A · Com os dados restaurados (passo 4 feito):** os usuários já existem, mas sem senha.
1. O dono define a própria senha temporária no **SQL Editor** (ele digita a senha dentro das aspas):
   ```sql
   update auth.users set encrypted_password = extensions.crypt('DIGITE-AQUI-UMA-SENHA-TEMPORARIA', extensions.gen_salt('bf'))
    where email = '@@ADMIN@@@estoque.pss';
   ```
2. Entrar no site com `@@ADMIN@@` + essa senha. O sistema obriga a criar uma senha nova.
3. **Administração › Usuários e acessos**: em cada pessoa, **Redefinir senha** › **Gerar senha nova**, e passar a
   senha temporária a ela (no primeiro acesso, cada um cria a sua).
4. Padeiros do tablet continuam com as mesmas senhas de 6 números (vieram nos dados).

**8B · Começando sem os dados antigos:**
1. **Authentication › Users › Add user › Create new user**: e-mail `@@ADMIN@@@estoque.pss`, senha temporária forte,
   marcar **Auto Confirm User**.
2. SQL Editor:
   ```sql
   update public.perfis set nome = '@@ADMIN_NOME@@', funcao = 'Controladoria', papeis = '{admin}', ativo = true
    where user_id = (select id from auth.users where email = '@@ADMIN@@@estoque.pss');
   ```
3. Entrar no site e criar as demais pessoas em **Administração › Usuários e acessos › Novo usuário**
   (lista em `DADOS_PRIVADOS/usuarios.md`).

### Passo 9 · CONFERÊNCIA (obrigatória)
1. Arquivos: clonar o repositório publicado e rodar `python3 CONFERENCIA/conferir_arquivos.py <pasta-do-clone>`.
   Esperado: `TODOS OS ARQUIVOS IDÊNTICOS` (ou só `config.js` e `index.html` diferentes, se fez o passo 6).
2. Banco: SQL Editor › colar `CONFERENCIA/conferir-banco.sql` › Run. Todas as linhas `OK`.
3. Visual: abrir o site e comparar com `ESPECIFICACAO_DO_SISTEMA.md` (menu na mesma ordem, marca Artas Indústria
   grafite no tema claro e branca no escuro, logo PSS ao lado, ícone do app com o "A" de 3 colunas).
4. Rodapé do menu mostra **versão @@VERSAO@@**. Dados: abrir Estoque, Pedidos e Produção e conferir com o dono.

### Passo 10 · Continuar o projeto com o Claude Code (para as próximas melhorias)
Assim o dono volta a pedir mudanças por conversa, como antes (GUIA_DO_DONO, parte F):
1. Conta em claude.ai, plano com **Claude Code** › abrir https://claude.ai/code › conectar o GitHub e escolher o
   repositório `pss-estoque`.
2. Criar o ambiente (environment) `pss-estoque`. Para o Claude aplicar mudanças no banco sozinho, o dono cria um
   **token pessoal** em https://supabase.com/dashboard/account/tokens e o cadastra só nos **segredos de rede** do
   ambiente (host `api.supabase.com`, cabeçalho `Authorization`, prefixo `Bearer`). Nunca no chat.
3. Na primeira conversa, o Claude lê `CLAUDE.md` e `ANDAMENTO.md` e segue as regras de lá
   (publicar = commit e push na `main`; backup completo quando o dono pedir).

## 6. O que NÃO está no pacote (de propósito)
- Senhas de pessoas, senha do banco, tokens e a chave secreta (`sb_secret_…` / service_role).
- Arquivos que o Supabase guarda fora do banco: nenhum (os anexos ficam dentro do banco e vêm nos dados).

## 7. Se algo der errado
- Nada carrega / "Não consegui abrir esta tela": conferir o passo 6 (config.js e a linha Content-Security-Policy).
- "Usuário ou senha inválidos" logo após restaurar: faltou o passo 8A.1 para aquele usuário (ou use Redefinir senha).
- "Só o administrador gerencia usuários": o perfil não tem o papel `admin`.
- Erro ao criar/redefinir usuário: nome da função `admin-usuarios`, Verify JWT desligado, ORIGENS_PERMITIDAS (passo 5).
- "PARE: este banco já tem dados" ao restaurar: o banco não é novo. Crie um projeto novo ou peça ajuda técnica.
- Telas antigas depois de atualizar: fechar e abrir o app (ele guarda os arquivos para abrir rápido).
