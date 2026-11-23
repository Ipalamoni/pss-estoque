#!/usr/bin/env python3
# =====================================================================
# ARTAS INDÚSTRIA · GERAR BACKUP COMPLETO DA VERSÃO ATUAL
# Uso:  python3 ferramentas/gerar_backup.py --saida /pasta/de/saida
# Gera backup_artas_vX.Y.Z_AAAA-MM-DD.zip com TUDO para reconstruir do zero, idêntico:
#   site/ (cópia exata do que está publicado), banco completo, função do servidor,
#   PROMPT_RECONSTRUCAO.md (para qualquer IA), ESPECIFICACAO_DO_SISTEMA.md (gerada do código),
#   CONFERENCIA/ (manifesto SHA-256 de cada arquivo + scripts de conferência).
# Regras: usa o que está COMMITADO (git archive HEAD); para se houver mudança não commitada;
#         recusa gerar se encontrar senha/chave secreta.
# =====================================================================
import argparse, datetime, hashlib, io, json, os, re, shutil, subprocess, sys, zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def ler(rel): return open(os.path.join(RAIZ, rel), encoding='utf-8').read()
def git(*a): return subprocess.run(['git', '-C', RAIZ, *a], capture_output=True, text=True, check=True).stdout.strip()

# ---------------------------------------------------------------------
# 1) banco/00-instalar-banco-completo.sql = estrutura real + atualizações (sem a demonstração)
# ---------------------------------------------------------------------
def montar_banco():
    s = ler('js/demo/banco-demo.sql').split('\n')
    ini = next(i for i, l in enumerate(s) if l.startswith('-- Sistema de Compras e Estoque PSS')) - 1
    semente = next(i for i, l in enumerate(s) if 'SEMENTE DO MODO DEMONSTRAÇÃO' in l) - 1
    base = '\n'.join(s[ini:semente]).rstrip() + '\n'
    def ver(n): return tuple(int(x) for x in re.findall(r'v(\d+)\.(\d+)', n)[0])
    atual = sorted([f for f in os.listdir(os.path.join(RAIZ, 'banco')) if re.match(r'atualizar-banco-v\d+\.\d+\.sql$', f)], key=ver)
    cab = ('-- =====================================================================\n'
           '-- ARTAS INDÚSTRIA (licenciado para Pães São Sebastião) · INSTALAR O BANCO COMPLETO DO ZERO\n'
           '-- Para um projeto NOVO do Supabase (vazio). Rode UMA vez, inteiro:\n'
           '--   Supabase › SQL Editor › New query › colar este arquivo › Run\n'
           '-- Conteúdo, nesta ordem: estrutura, segurança (RLS), funções, dados iniciais (unidade Matriz,\n'
           '-- locais, parâmetros), atualizações 001–005, ' + ', '.join(a.replace('atualizar-banco-', '').replace('.sql', '') for a in atual) + '.\n'
           '-- NÃO contém dados do dia a dia (pedidos, estoque…) nem senhas: só a estrutura e as regras.\n'
           '-- Gerado automaticamente a partir do código do sistema por ferramentas/gerar_backup.py.\n'
           '-- =====================================================================\n\n')
    txt = cab + base + ''.join('\n\n' + ler('banco/' + a) for a in atual)
    destino = os.path.join(RAIZ, 'banco', '00-instalar-banco-completo.sql')
    mudou = not os.path.exists(destino) or open(destino, encoding='utf-8').read() != txt
    if mudou: open(destino, 'w', encoding='utf-8').write(txt)
    return mudou, atual

# ---------------------------------------------------------------------
# 2) ESPECIFICACAO_DO_SISTEMA.md (gerada do código: sempre igual ao que está no ar)
# ---------------------------------------------------------------------
def especificacao(versao):
    app, util, css = ler('js/app.js'), ler('js/util.js'), ler('css/app.css')
    L = [f'# Especificação do sistema · Artas Indústria v{versao}', '',
         'Gerada automaticamente do código. Serve para conferir a reconstrução e para entender o sistema.', '']
    # papéis
    papeis = re.search(r'export const PAPEIS = \{(.*?)\};', util, re.S).group(1)
    L += ['## Papéis (o que cada pessoa pode ser)', '', '| Código | Nome na tela |', '|---|---|']
    L += [f'| `{k}` | {v} |' for k, v in re.findall(r"^\s+(\w+): '([^']+)',", papeis, re.M)]
    # permissões
    perm = re.search(r'export const PERMISSOES = \{(.*?)\};', util, re.S).group(1)
    L += ['', '## Permissões por ação (o banco confere de novo em cada gravação)', '', '| Ação | Papéis |', '|---|---|']
    L += [f'| `{k}` | {v.replace(chr(39), "")} |' for k, v in re.findall(r"^\s+(\w+): \[([^\]]*)\],", perm, re.M)]
    # menu
    menu = re.search(r'const MENU = \[(.*?)\n\];', app, re.S).group(1)
    L += ['', '## Menu (ordem exata) e quem vê cada tela', '',
          '`TODOS` = todos os papéis menos financeiro, faturamento e padeiro · `GESTAO` = admin, diretoria, engenharia, gestor da produção', '']
    for linha in menu.split('\n'):
        g = re.search(r"\{ grupo: '([^']+)'", linha)
        t = re.search(r"\{ id: '([^']+)', titulo: '([^']+)', papeis: (.+?), tela:", linha)
        if g: L.append(f'\n**{g.group(1)}**')
        elif t: L.append(f'- {t.group(2)} (`#{t.group(1)}`) — {t.group(3).replace(chr(39), "")}' + (' · atualiza ao vivo' if 'aoVivo: true' in linha else ''))
    # cores
    def tokens(bloco): return re.findall(r'(--[\w-]+):\s*([^;]+);', bloco)
    claro = re.search(r':root \{(.*?)\n\}', css, re.S).group(1)
    escuro = re.search(r'html\[data-tema="escuro"\] \{(.*?)\n\}', css, re.S).group(1)
    L += ['', '## Cores (variáveis do CSS)', '', '| Variável | Tema claro | Tema escuro |', '|---|---|---|']
    esc = dict(tokens(escuro))
    for k, v in tokens(claro):
        L.append(f'| `{k}` | `{v.split("/*")[0].strip()}` | `{esc.get(k, "—").split("/*")[0].strip()}` |')
    L += ['', '## Marca', '',
          '- **Artas Indústria**, símbolo "Silos" (A formado por 3 colunas). Componente `js/marca.js` (`MarcaArtas`, `SimboloArtas`).',
          '- Grafite `#3D3D3A` no tema claro, branca no escuro (variável `--marca`). Completa em telas ≥ 520 px; compacta ("Artas") abaixo.',
          '- Arquivos: `icons/artas-marca-grafite.svg`, `icons/artas-marca-branca.svg`, `icons/artas-simbolo.svg`; ícones do app em `icons/`.',
          '- Logo do cliente (Pães São Sebastião, `icons/logo-pss.png`) sempre ao lado da marca. Assinatura: Palamoni Consultoria Empresarial.',
          '- Letras da marca: Archivo (SIL OFL 1.1) convertidas em contorno vetorial (não precisa de fonte instalada).', '']
    # telas
    L += ['## Telas (arquivos em `site/js/telas/`)', '']
    for f in sorted(os.listdir(os.path.join(RAIZ, 'js', 'telas'))):
        prim = [l for l in ler('js/telas/' + f).split('\n')[:6] if l.startswith('//') and not set(l) <= set('/= ')]
        L.append(f'- `{f}` — {prim[0][2:].strip() if prim else ""}')
    return '\n'.join(L) + '\n'

# ---------------------------------------------------------------------
# 3) PROMPT para qualquer IA reconstruir do zero
# ---------------------------------------------------------------------
PROMPT = r'''# PROMPT DE RECONSTRUÇÃO · ARTAS INDÚSTRIA v{versao}

> Copie TODO este arquivo para uma IA (Claude, ChatGPT ou outra) junto com o arquivo zip.
> Ela deve seguir os passos abaixo, na ordem, e só considerar terminado quando a CONFERÊNCIA (passo 7) passar.

## Quem você é e o que deve fazer
Você vai reconstruir do zero o sistema **Artas Indústria** (compras, estoque e produção, licenciado para a
Pães São Sebastião), versão **{versao}** (código `{commit}`, gerado em {data}), e deixá-lo **idêntico** ao original:
mesmas cores, logos, marca, menus, botões, telas, funções, regras de segurança e comportamento.

**Regra principal: NÃO reescreva nem "melhore" nenhum código.** O sistema já está inteiro dentro de `site/` e o
banco inteiro em `site/banco/00-instalar-banco-completo.sql`. A identidade exata vem de usar **esses arquivos sem
alterar um byte**. As ÚNICAS mudanças permitidas são as do passo 4 (endereço e chave pública do Supabase novo),
e só se o projeto do Supabase for outro. Não traduza, não reformate, não troque bibliotecas, não "atualize" versões.

## O que é o sistema (para você entender)
- Aplicativo web instalável (PWA) feito em JavaScript puro com Preact + htm (sem etapa de compilação).
  Abre no navegador do computador, tablet e celular. Hospedado no **GitHub Pages**.
- Dados no **Supabase** (PostgreSQL): login, banco, tempo real e uma função de servidor (`admin-usuarios`).
- Toda regra de acesso fica no banco (RLS + funções `security definer`). O site só mostra.
- Bibliotecas já incluídas em `site/js/vendor/` (nada precisa ser baixado da internet).
- Tem modo demonstração (dados fictícios no navegador) controlado por `site/config.js` (`MODO: 'demo'`).
- Detalhes (papéis, permissões, menu, cores, marca, telas): `ESPECIFICACAO_DO_SISTEMA.md`.

## Passo 1 · Conferir o pacote ANTES de começar
Rode `python3 CONFERENCIA/conferir_arquivos.py site` (na pasta do zip descompactado). Tem que dizer
`TODOS OS ARQUIVOS IDÊNTICOS`. Se algum arquivo estiver diferente ou faltando, pare e avise o dono.

## Passo 2 · Banco de dados (Supabase)
1. Criar conta em supabase.com (ou entrar) e criar um **projeto novo**: nome `estoque-pss` (ou outro),
   região **South America (São Paulo)**, senha forte do banco (guardar com o dono, NUNCA no zip).
2. **SQL Editor › New query**: colar o arquivo `site/banco/00-instalar-banco-completo.sql` INTEIRO › **Run**.
   No fim aparecem tabelas de CONFERÊNCIA: todas as linhas devem dizer `OK`.
3. **Authentication › Sign In / Providers**:
   - Email: **ligado** · "Allow new users to sign up": **DESLIGADO** · "Allow anonymous sign-ins": **DESLIGADO**
   - (Os usuários são criados só pelo administrador, dentro do sistema.)
4. **Project Settings › API**: anotar a **Project URL** (`https://XXXX.supabase.co`) e a chave
   **publishable** (`sb_publishable_…`). A chave **secret / service_role NUNCA** vai para o site.

## Passo 3 · Função do servidor que cria usuários
1. **Edge Functions › Deploy a new function › Via Editor**: nome **exatamente** `admin-usuarios`.
2. Colar o conteúdo de `site/supabase/functions/admin-usuarios/index.ts` sem alterar › Deploy.
3. Nas configurações da função: **Verify JWT: DESLIGADO** (a função confere o login e o papel de admin por dentro).
4. Variáveis (Edge Functions › Secrets): `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já
   existem sozinhas. Só crie `ORIGENS_PERMITIDAS` se o site ficar em endereço diferente de
   `https://ipalamoni.github.io` (valor: o endereço do site, ex.: `https://NOVO-USUARIO.github.io`).

## Passo 4 · Apontar o site para o Supabase (SÓ se o projeto do Supabase for NOVO)
Trocar o endereço antigo `https://kuttfnmjvzgzebjpjvvy.supabase.co` pelo novo em EXATAMENTE 2 arquivos:
1. `site/config.js`: `SUPABASE_URL` e `SUPABASE_CHAVE_PUBLICAVEL` (a publishable do passo 2.4). `MODO: 'supabase'`.
2. `site/index.html`: na linha `Content-Security-Policy`, trocar o endereço nas DUAS ocorrências
   (`https://…supabase.co` e `wss://…supabase.co`). Se esquecer, o site não consegue falar com o banco.
Nada mais muda. (O passo 7 vai acusar só esses 2 arquivos como diferentes — é esperado.)

## Passo 5 · Publicar o site (GitHub Pages)
1. Em github.com, criar repositório **público** `pss-estoque` (ou outro nome).
2. Enviar TODO o conteúdo de `site/` para a raiz do repositório (incluindo o arquivo oculto `.nojekyll`).
3. **Settings › Pages › Build and deployment**: Source "Deploy from a branch", branch `main`, pasta `/ (root)` › Save.
4. Em 1 a 2 minutos o site abre em `https://USUARIO.github.io/pss-estoque/`.
5. Ligar a verificação em duas etapas (2FA) na conta do GitHub e do Supabase.

## Passo 6 · Primeiro administrador e usuários
1. Supabase › **Authentication › Users › Add user › Create new user**: e-mail `ithalo@estoque.pss`
   (o login no sistema é a parte antes do @, ex.: `ithalo`; o domínio é sempre `@estoque.pss`), senha temporária
   forte, marcar **Auto Confirm User**.
2. SQL Editor (troque o e-mail se for outro):
   ```sql
   update public.perfis set nome = 'Ithalo', funcao = 'Controladoria', papeis = '{{admin}}', ativo = true
    where user_id = (select id from auth.users where email = 'ithalo@estoque.pss');
   ```
3. Entrar no site com `ithalo` + a senha › trocar a senha › **Administração › Usuários e acessos › Novo usuário**
   para cada pessoa (o sistema gera a senha temporária). Usuários e papéis da versão {versao}:
{usuarios}
4. Cadastros (produtos, fornecedores, receitas): **Configurações e locais › importar a planilha-modelo**, ou
   restaurar os dados do backup do próprio Supabase (dados do dia a dia NÃO estão neste zip).

## Passo 7 · CONFERÊNCIA (obrigatória)
1. Arquivos: clonar o repositório publicado e rodar `python3 CONFERENCIA/conferir_arquivos.py <pasta-do-clone>`.
   Esperado: `TODOS OS ARQUIVOS IDÊNTICOS` (ou só `config.js` e `index.html` diferentes, se fez o passo 4).
2. Banco: SQL Editor › colar `CONFERENCIA/conferir-banco.sql` › Run. Todas as linhas `OK` e as contagens
   iguais às de referência que estão no próprio arquivo.
3. Visual: abrir o site e comparar com `ESPECIFICACAO_DO_SISTEMA.md` (menu na mesma ordem, marca Artas Indústria
   grafite no tema claro e branca no escuro, logo PSS ao lado, ícone do app com o "A" de 3 colunas).
4. Rodapé do menu deve mostrar **versão {versao}**.

## O que NÃO está no pacote (de propósito)
- Senhas de pessoas, senha do banco e a chave secreta (`sb_secret_…` / service_role).
- Dados do dia a dia (pedidos, estoque, produção, histórico): vêm do backup do Supabase do dono.

## Se algo der errado
- "Não consegui abrir esta tela" / nada carrega: conferir o passo 4 (config.js e a linha da Content-Security-Policy).
- "Só o administrador gerencia usuários" ao criar usuário: o seu perfil não tem `admin` (passo 6.2).
- Erro ao criar usuário: conferir o nome `admin-usuarios` e "Verify JWT" desligado (passo 3).
- Telas antigas depois de atualizar: fechar e abrir o app (o sistema guarda os arquivos para abrir rápido).
'''

LEIA = '''# LEIA PRIMEIRO · Backup Artas Indústria v{versao} · {data}

Este zip tem TUDO para reconstruir o sistema do zero, idêntico ao que estava no ar em {data}.

**Para reconstruir com uma IA:** entregue a ela o arquivo `PROMPT_RECONSTRUCAO.md` + este zip e peça:
"Siga o PROMPT_RECONSTRUCAO.md à risca para reconstruir o sistema." Ela vai precisar que você entre nas suas
contas do GitHub e do Supabase quando pedir (ninguém mais deve ter essas senhas).

| Pasta / arquivo | O que é |
|---|---|
| `PROMPT_RECONSTRUCAO.md` | Passo a passo para a IA (ou uma pessoa técnica) reconstruir tudo |
| `ESPECIFICACAO_DO_SISTEMA.md` | Papéis, permissões, menu, cores, marca e telas (gerado do código) |
| `site/` | O sistema inteiro, exatamente como publicado (código `{commit}`) |
| `site/banco/00-instalar-banco-completo.sql` | Cria o banco inteiro do zero (estrutura + regras + segurança) |
| `site/supabase/functions/admin-usuarios/` | Função do servidor que cria usuários |
| `CONFERENCIA/` | Impressão digital de cada arquivo e scripts que provam que ficou idêntico |

**Não tem:** senhas, chave secreta e os dados do dia a dia (esses vêm do backup do Supabase).
Guarde este zip no Drive, na pasta "Backups sistema estoque", sem apagar os anteriores.
'''

CONFERIR_PY = r'''#!/usr/bin/env python3
# Confere se uma pasta (o site publicado ou a cópia) é IDÊNTICA ao backup, arquivo por arquivo (SHA-256).
# Uso: python3 CONFERENCIA/conferir_arquivos.py <pasta>
import hashlib, os, sys
base = os.path.dirname(os.path.abspath(__file__))
esperado = dict(l.rstrip('\n').split('  ', 1)[::-1] for l in open(os.path.join(base, 'manifesto-sha256.txt'), encoding='utf-8') if l.strip())
pasta = sys.argv[1] if len(sys.argv) > 1 else 'site'
dif, falta = [], []
for rel, h in sorted(esperado.items()):
    p = os.path.join(pasta, rel)
    if not os.path.exists(p): falta.append(rel); continue
    if hashlib.sha256(open(p, 'rb').read()).hexdigest() != h: dif.append(rel)
print(f'arquivos conferidos: {len(esperado)} · diferentes: {len(dif)} · faltando: {len(falta)}')
for r in dif: print('  DIFERENTE:', r)
for r in falta: print('  FALTANDO :', r)
print('TODOS OS ARQUIVOS IDÊNTICOS' if not dif and not falta else 'ATENÇÃO: há diferenças (config.js e index.html são esperados se o Supabase for outro)')
'''

CONFERIR_SQL = '''-- CONFERÊNCIA DO BANCO · Artas Indústria v{versao}
-- Rode no Supabase › SQL Editor. Compare as contagens com a referência (coluna "esperado").
with r as (
  select 'Funções do sistema' as item, (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'))::text as valor, '{n_funcoes}' as esperado
  union all select 'Regras de acesso (RLS)', (select count(*) from pg_policies where schemaname = 'public')::text, '{n_politicas}'
  union all select 'Tabelas', (select count(*) from pg_tables where schemaname = 'public')::text, '{n_tabelas}'
  union all select 'Tabelas no tempo real', (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public')::text, '{n_tempo_real}'
  union all select 'Última versão do banco instalada', (select max(versao) from public.versao_banco where versao = '{ultima}'), '{ultima}'
)
select item, valor, esperado, case when valor = esperado then 'OK' else 'ATENÇÃO' end as resultado from r;
'''

SEGREDO = re.compile(r'sb_secret_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----')

def referencia_banco(sql):
    """conta funções, regras, tabelas e tempo real instalando o banco num PostgreSQL de teste (PGlite)"""
    js = r'''
    const fs = require('fs'); (async () => {
      const { PGlite } = await import(process.argv[2]); const db = new PGlite('memory://'); await db.waitReady;
      await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
        create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, created_at timestamptz default now());
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
        create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
        grant usage on schema public to anon, authenticated, service_role;
        alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
        alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
        create publication supabase_realtime;`);
      await db.exec(fs.readFileSync(process.argv[3], 'utf8'));
      const q = async (s) => (await db.query(s)).rows[0].v;
      console.log(JSON.stringify({
        n_funcoes: await q(`select count(*)::text v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`),
        n_politicas: await q(`select count(*)::text v from pg_policies where schemaname='public'`),
        n_tabelas: await q(`select count(*)::text v from pg_tables where schemaname='public'`),
        n_tempo_real: await q(`select count(*)::text v from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'`),
        versoes: await q(`select string_agg(versao, ', ' order by versao) v from public.versao_banco`) }));
      process.exit(0); })().catch((e) => { console.error(e.message); process.exit(1); });'''
    tmp = os.path.join(RAIZ, '.ref_banco.cjs'); open(tmp, 'w').write(js)
    try:
        out = subprocess.run(['node', tmp, os.path.join(RAIZ, 'js/vendor/pglite/index.js'), sql], capture_output=True, text=True, timeout=600)
    finally:
        os.remove(tmp)
    if out.returncode != 0: sys.exit('ERRO: o banco completo não instalou num PostgreSQL de teste:\n' + out.stderr[-2000:])
    return json.loads(out.stdout.strip().split('\n')[-1])

def usuarios_md(caminho):
    # a lista de usuários NÃO fica no repositório (ele é público): vem de um arquivo privado (--usuarios)
    if caminho and os.path.exists(caminho): return ''.join('   ' + l for l in open(caminho, encoding='utf-8'))
    return '   (lista não informada: recrie conforme a equipe em Administração › Usuários e acessos)\n'

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--saida', required=True); ap.add_argument('--usuarios', help='arquivo PRIVADO com a lista de usuários e papéis (sem senhas)'); a = ap.parse_args()
    versao = re.search(r"VERSAO_APP = '([^']+)'", ler('versao.js')).group(1)
    mudou, _ = montar_banco()
    if mudou or git('status', '--porcelain'):
        sys.exit('PARE: há mudanças não commitadas (ou o banco completo foi atualizado agora). Faça commit e rode de novo.\n' + git('status', '--short'))
    commit = git('rev-parse', '--short', 'HEAD'); data = datetime.date.today().isoformat()
    nome = f'backup_artas_v{versao}_{data}'; pasta = os.path.join(a.saida, nome)
    if os.path.exists(pasta): shutil.rmtree(pasta)
    os.makedirs(os.path.join(pasta, 'CONFERENCIA'))
    # site/ = cópia exata do commit
    arq = subprocess.run(['git', '-C', RAIZ, 'archive', '--format=zip', 'HEAD'], capture_output=True, check=True).stdout
    with zipfile.ZipFile(io.BytesIO(arq)) as z: z.extractall(os.path.join(pasta, 'site'))
    # manifesto SHA-256 + varredura de segredos
    linhas, achados = [], []
    for raiz, _, nomes in os.walk(os.path.join(pasta, 'site')):
        for n in sorted(nomes):
            p = os.path.join(raiz, n); rel = os.path.relpath(p, os.path.join(pasta, 'site')).replace(os.sep, '/')
            dados = open(p, 'rb').read(); linhas.append(f'{hashlib.sha256(dados).hexdigest()}  {rel}')
            if SEGREDO.search(dados.decode('utf-8', 'ignore')): achados.append(rel)
    if achados: sys.exit('PARE: possível segredo encontrado em: ' + ', '.join(achados))
    open(os.path.join(pasta, 'CONFERENCIA', 'manifesto-sha256.txt'), 'w', encoding='utf-8').write('\n'.join(sorted(linhas, key=lambda l: l.split('  ', 1)[1])) + '\n')
    open(os.path.join(pasta, 'CONFERENCIA', 'conferir_arquivos.py'), 'w', encoding='utf-8').write(CONFERIR_PY)
    ref = referencia_banco(os.path.join(pasta, 'site', 'banco', '00-instalar-banco-completo.sql'))
    ref['ultima'] = ref['versoes'].split(', ')[-1]
    open(os.path.join(pasta, 'CONFERENCIA', 'conferir-banco.sql'), 'w', encoding='utf-8').write(CONFERIR_SQL.format(versao=versao, **ref))
    open(os.path.join(pasta, 'PROMPT_RECONSTRUCAO.md'), 'w', encoding='utf-8').write(PROMPT.format(versao=versao, commit=commit, data=data, usuarios=usuarios_md(a.usuarios)))
    if a.usuarios and os.path.exists(a.usuarios): shutil.copy(a.usuarios, os.path.join(pasta, 'usuarios.md'))   # para o próximo backup
    open(os.path.join(pasta, 'LEIA-PRIMEIRO.md'), 'w', encoding='utf-8').write(LEIA.format(versao=versao, commit=commit, data=data))
    open(os.path.join(pasta, 'ESPECIFICACAO_DO_SISTEMA.md'), 'w', encoding='utf-8').write(especificacao(versao))
    # autoconferência: o próprio pacote tem que bater com o manifesto
    r = subprocess.run([sys.executable, os.path.join(pasta, 'CONFERENCIA', 'conferir_arquivos.py'), os.path.join(pasta, 'site')], capture_output=True, text=True)
    if 'TODOS OS ARQUIVOS IDÊNTICOS' not in r.stdout: sys.exit('PARE: autoconferência falhou\n' + r.stdout)
    z = shutil.make_archive(pasta, 'zip', a.saida, nome)
    print(f'OK · versão {versao} · código {commit} · {len(linhas)} arquivos · segredos: nenhum')
    print(f'banco de referência: {ref}')
    print(z)

if __name__ == '__main__':
    main()
