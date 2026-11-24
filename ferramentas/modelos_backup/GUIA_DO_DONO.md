# GUIA DO DONO · Reconstruir o sistema Artas Indústria (v@@VERSAO@@)

Este guia é para você, que não é técnico. Você não precisa fazer sozinho: entregue a pasta a uma IA
(Claude, ChatGPT ou outra) e diga **"Leia o PROMPT_RECONSTRUCAO.md e me guie para reconstruir o sistema do zero."**
Ela vai te pedir cada passo abaixo, um de cada vez. Este guia serve para você acompanhar e conferir.

**Regras de ouro**
- Senhas e tokens: **só você** digita, e só nos sites oficiais (github.com, supabase.com) ou no formulário seguro
  da ferramenta. **Nunca cole senha ou token no chat.**
- Guarde as senhas novas num lugar seguro (gerenciador de senhas ou caderno guardado).
- A pasta `DADOS_PRIVADOS` tem os dados da empresa: **não envie para ninguém** e não coloque no GitHub.
- Os nomes de botões estão em inglês porque os sites são em inglês. Se mudarem um pouco, procure algo parecido.

---

## Parte A · Contas (10 minutos)

**A1. GitHub** (onde o site fica publicado)
1. Abra https://github.com/signup (ou https://github.com/login se ainda tiver a conta).
2. Digite seu e-mail, crie uma senha e um nome de usuário (ex.: `ipalamoni`). Confirme o código que chega no e-mail.
3. Segurança: canto superior direito (sua foto) › **Settings** › **Password and authentication** ›
   **Enable two-factor authentication**. Siga a tela (use o app autenticador do celular).

**A2. Supabase** (onde ficam o banco de dados e os logins)
1. Abra https://supabase.com/dashboard › **Continue with GitHub** (entra usando a conta do GitHub).
2. Se pedir uma "organization", crie com o nome `Artas` e o plano **Free**.

---

## Parte B · Criar o banco (15 minutos)

**B1. Projeto novo**
1. Em https://supabase.com/dashboard clique em **New project**.
2. Preencha:
   - Project name:
     ```
     estoque-pss
     ```
   - Database Password: clique em **Generate a password** e **guarde essa senha** num lugar seguro.
   - Region:
     ```
     South America (São Paulo)
     ```
3. Clique em **Create new project** e espere uns 2 minutos até ficar verde.

**B2. Instalar o banco**
1. Menu da esquerda › **SQL Editor** › **New query** (ou o "+").
2. Abra o arquivo `site/banco/00-instalar-banco-completo.sql` (no computador: botão direito › Abrir com › Bloco de Notas),
   selecione tudo (Ctrl+A), copie (Ctrl+C) e cole no SQL Editor (Ctrl+V).
3. Clique em **Run** (canto inferior direito). Se perguntar sobre "destructive operation", confirme.
4. No fim aparece uma tabela de CONFERÊNCIA: todas as linhas devem dizer **OK**. Tire um print e mande para a IA.

**B3. Colocar os dados de volta** (cadastros, pedidos, estoque, produção, usuários)
1. **SQL Editor** › **New query**.
2. Abra `DADOS_PRIVADOS/restaurar-dados.sql`, copie tudo e cole › **Run**.
3. A tabela de CONFERÊNCIA no fim deve mostrar **OK** em todas as linhas. Print para a IA.

**B4. Login: só o administrador cria usuários**
1. Menu da esquerda › **Authentication** › **Sign In / Providers** (ou "Providers").
2. **Allow new users to sign up**: **desligado**. **Allow anonymous sign-ins**: **desligado**.
   **Email**: ligado. Clique em **Save**.

**B5. Pegar o endereço e a chave pública** (a IA vai pedir)
1. Menu da esquerda › engrenagem **Project Settings** › **API Keys** (ou **Data API**).
2. Copie e mande para a IA:
   - a **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - a chave **Publishable** (começa com `sb_publishable_`).
3. **NÃO** copie a chave **Secret** / **service_role**. Essa nunca sai do Supabase.

---

## Parte C · Função que cria usuários (5 minutos)

1. Menu da esquerda › **Edge Functions** › **Deploy a new function** › **Via Editor**.
2. Nome da função (exatamente assim):
   ```
   admin-usuarios
   ```
3. Apague o texto de exemplo. Abra `site/supabase/functions/admin-usuarios/index.ts`, copie tudo e cole › **Deploy function**.
4. Depois de publicada, abra a função › **Details** (ou Settings) › desligue **Verify JWT** (ou "Enforce JWT
   Verification") › **Save**.
5. Se o seu usuário do GitHub NÃO for `ipalamoni`: **Edge Functions › Secrets › Add new secret**:
   - Name:
     ```
     ORIGENS_PERMITIDAS
     ```
   - Value (troque SEU-USUARIO):
     ```
     https://SEU-USUARIO.github.io
     ```

---

## Parte D · Publicar o site (15 minutos)

Antes: se o projeto do Supabase é novo, a IA vai te devolver os arquivos `config.js` e `index.html` já ajustados.
Substitua os dois dentro da pasta `site/` antes de enviar.

**D1. Criar o repositório**
1. Abra https://github.com/new
2. Repository name:
   ```
   pss-estoque
   ```
3. Marque **Public** › clique em **Create repository**.

**D2. Enviar os arquivos** (o GitHub aceita até 100 arquivos por vez, por isso são 2 envios)
1. Na página do repositório novo, clique no link **uploading an existing file** (ou **Add file › Upload files**).
2. **Envio 1:** abra a pasta `site` no computador e arraste **somente a pasta `js`** para a página. Espere carregar
   tudo › embaixo, clique em **Commit changes**.
3. **Envio 2:** **Add file › Upload files** de novo. Arraste **todo o resto** de dentro da pasta `site`
   (todas as pastas e arquivos, menos a `js`) › **Commit changes**.
4. Confira se o arquivo `.nojekyll` apareceu na lista. Se não apareceu (ele pode estar oculto no computador):
   **Add file › Create new file** › nome:
   ```
   .nojekyll
   ```
   deixe vazio › **Commit changes**.

**D3. Ligar o site**
1. No repositório: **Settings** › menu da esquerda **Pages**.
2. **Source**: Deploy from a branch. **Branch**: `main` e pasta `/ (root)` › **Save**.
3. Espere 1 a 3 minutos e abra `https://SEU-USUARIO.github.io/pss-estoque/`.

---

## Parte E · Primeiro acesso (5 minutos)

1. No Supabase: **SQL Editor › New query**. Cole o texto abaixo e **troque só a parte entre aspas** por uma senha
   temporária que você inventar (ela não vai para lugar nenhum além do seu banco):
   ```sql
   update auth.users set encrypted_password = extensions.crypt('DIGITE-AQUI-UMA-SENHA-TEMPORARIA', extensions.gen_salt('bf'))
    where email = '@@ADMIN@@@estoque.pss';
   ```
   › **Run**. Deve aparecer "Success" (1 linha).
2. Abra o site, entre com o usuário `@@ADMIN@@` e essa senha. O sistema vai pedir uma senha nova: crie a definitiva.
3. Menu **Administração › Usuários e acessos**: para cada pessoa, clique em **Redefinir senha › Gerar senha nova**
   e passe a senha temporária para ela. No primeiro acesso, cada um cria a sua.
4. Os padeiros continuam com as mesmas senhas de 6 números.
5. Confira com a IA: menu, versão @@VERSAO@@ no rodapé do menu, estoque, pedidos e produção.

---

## Parte F · Voltar a fazer melhorias com o Claude (opcional, recomendado)

1. Abra https://claude.ai (plano com Claude Code) › https://claude.ai/code › conecte o GitHub quando pedir
   e escolha o repositório `pss-estoque`.
2. Crie um ambiente chamado:
   ```
   pss-estoque
   ```
3. Para o Claude conseguir mexer no banco sozinho, crie um token do Supabase:
   - Abra https://supabase.com/dashboard/account/tokens › **Generate new token**
   - Nome:
     ```
     claude-pss-estoque
     ```
   - Validade: a menor que resolver (ex.: 30 dias).
   - Copie o token e cole **somente** nas configurações do ambiente, em **Segredos de rede** (Network secrets):
     - Host:
       ```
       api.supabase.com
       ```
     - Cabeçalho:
       ```
       Authorization
       ```
     - Prefixo:
       ```
       Bearer
       ```
4. Comece a conversa com: **"Vamos continuar o projeto PSS Estoque. Leia o CLAUDE.md e o ANDAMENTO.md antes de começar."**
5. Quando terminar uma rodada de mudanças no banco, apague o token em https://supabase.com/dashboard/account/tokens.

---

## Guardar este backup
Salve o zip no Google Drive, na pasta **"Backups sistema estoque"**, sem apagar os anteriores.
Para um backup novo, diga ao Claude: **"executar backup da versão atual"**.
