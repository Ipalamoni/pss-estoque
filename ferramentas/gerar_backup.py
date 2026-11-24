#!/usr/bin/env python3
# =====================================================================
# ARTAS INDÚSTRIA · GERAR BACKUP COMPLETO DA VERSÃO ATUAL
# Uso:  python3 ferramentas/gerar_backup.py --saida /pasta/de/saida   (--sem-dados para não incluir os dados)
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
MODELOS = os.path.join(RAIZ, 'ferramentas', 'modelos_backup')
def modelo(nome, **v):
    txt = open(os.path.join(MODELOS, nome), encoding='utf-8').read()
    for k, x in v.items(): txt = txt.replace('@@' + k.upper() + '@@', str(x))
    if '@@' in txt: sys.exit('ERRO: marcador sem valor em ' + nome + ': ' + re.findall(r'@@\w+@@', txt)[0])
    return txt

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
        versoes: await q(`select string_agg(versao, ', ' order by string_to_array(versao, '.')::int[]) v from public.versao_banco`) }));
      process.exit(0); })().catch((e) => { console.error(e.message); process.exit(1); });'''
    tmp = os.path.join(RAIZ, '.ref_banco.cjs'); open(tmp, 'w').write(js)
    try:
        out = subprocess.run(['node', tmp, os.path.join(RAIZ, 'js/vendor/pglite/index.js'), sql], capture_output=True, text=True, timeout=600)
    finally:
        os.remove(tmp)
    if out.returncode != 0: sys.exit('ERRO: o banco completo não instalou num PostgreSQL de teste:\n' + out.stderr[-2000:])
    return json.loads(out.stdout.strip().split('\n')[-1])

# ---------------------------------------------------------------------
# 4) DADOS DE HOJE (opcional, --dados): exporta do Supabase de produção pela Management API e gera
#    DADOS_PRIVADOS/restaurar-dados.sql (recoloca tudo num banco NOVO, com os mesmos usuários, sem senhas).
#    Nada disso vai para o repositório: só para dentro do zip, que é privado do dono.
# ---------------------------------------------------------------------
def api_sql(ref, sql):
    import urllib.request
    req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/database/query',
        data=json.dumps({'query': sql}).encode(), method='POST',
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + os.environ.get('SUPABASE_TOKEN', 'injetado-pelo-proxy'),
                 'User-Agent': 'backup-artas'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read())
    except Exception as e:
        sys.exit(f'ERRO ao ler os dados do Supabase ({e}). Sem acesso ao banco, rode sem --dados.')

def exportar_dados(ref):
    cols = api_sql(ref, """select table_name t, json_agg(json_build_object('c', column_name, 'id', is_identity = 'YES') order by ordinal_position) cols
        from information_schema.columns c where table_schema = 'public' and is_generated = 'NEVER'
         and table_name in (select tablename from pg_tables where schemaname = 'public') group by table_name order by table_name""")
    tabelas = {r['t']: r['cols'] for r in cols if r['t'] != 'versao_banco'}
    dados = {}
    for t in tabelas:
        dados[t] = api_sql(ref, f'select coalesce(json_agg(x), \'[]\') v from public."{t}" x')[0]['v']
    usuarios = api_sql(ref, """select coalesce(json_agg(json_build_object('id', id, 'email', email, 'criado_em', created_at,
        'confirmado_em', email_confirmed_at, 'app', raw_app_meta_data, 'meta', raw_user_meta_data) order by created_at), '[]') v from auth.users""")[0]['v']
    versao = api_sql(ref, "select versao v from public.versao_banco where versao ~ '^[0-9.]+$' order by string_to_array(versao, '.')::int[] desc limit 1")[0]['v']
    return tabelas, dados, usuarios, versao

def sql_restaurar(tabelas, dados, usuarios, versao_banco, versao, data):
    def lit(obj):
        j = json.dumps(obj, ensure_ascii=False)
        tag = '$dados$'
        while tag in j: tag = tag[:-1] + 'x$'
        return f'{tag}{j}{tag}::jsonb'
    L = ['-- =====================================================================',
         f'-- ARTAS INDÚSTRIA · RESTAURAR OS DADOS DE {data} (sistema v{versao}, banco v{versao_banco})',
         '-- CONFIDENCIAL: contém os dados da empresa e a lista de usuários (SEM senhas). Não publique.',
         '-- Quando usar: num projeto NOVO do Supabase, DEPOIS de rodar 00-instalar-banco-completo.sql.',
         '--   Supabase › SQL Editor › New query › colar este arquivo inteiro › Run',
         '-- O que faz: recria os usuários com o MESMO login (sem senha: ninguém entra até o admin definir),',
         '--   e recoloca todos os cadastros, pedidos, estoque, produção e histórico exatamente como estavam.',
         '-- Segurança: recusa rodar se o banco já tiver pedidos, movimentos ou produções (não sobrescreve).',
         '-- =====================================================================', '',
         'do $$ begin',
         "  if exists (select 1 from public.pedidos) or exists (select 1 from public.movimentos) or exists (select 1 from public.producoes) then",
         "    raise exception 'PARE: este banco já tem dados. A restauração só roda num banco recém-instalado.';",
         '  end if;',
         'end $$;', '',
         'begin;',
         '-- desliga gatilhos e conferências só durante a carga (volta sozinho no fim)',
         'set local session_replication_role = replica;', '',
         '-- 1) usuários de login (mesmo id e e-mail; senha aleatória que ninguém conhece)',
         'insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,',
         '  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)',
         "select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,",
         "  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), coalesce(u.confirmado_em, now()),",
         "  coalesce(u.app, '{\"provider\":\"email\",\"providers\":[\"email\"]}'::jsonb), coalesce(u.meta, '{}'::jsonb) || '{\"trocar_senha\":true}'::jsonb,",
         "  u.criado_em, now(), '', '', '', ''",
         f'from jsonb_to_recordset({lit(usuarios)}) as u(id uuid, email text, criado_em timestamptz, confirmado_em timestamptz, app jsonb, meta jsonb)',
         'on conflict (id) do nothing;',
         'insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)',
         "select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now()",
         'from auth.users u where not exists (select 1 from auth.identities i where i.user_id = u.id);', '',
         '-- 2) limpa os dados iniciais da instalação (unidade Matriz, locais, parâmetros) para pôr os originais',
         'truncate table ' + ', '.join(f'public."{t}"' for t in tabelas) + ' restart identity cascade;', '']
    for t, cs in tabelas.items():
        if not dados[t]: continue
        nomes = ', '.join(f'"{c["c"]}"' for c in cs)
        ov = ' overriding system value' if any(c['id'] for c in cs) else ''
        L.append(f'-- {t}: {len(dados[t])} registro(s)')
        L.append(f'insert into public."{t}" ({nomes}){ov}\nselect {nomes} from jsonb_populate_recordset(null::public."{t}", {lit(dados[t])});')
    L += ['', '-- 3) numeração automática continua de onde parou']
    for t, cs in tabelas.items():
        for c in cs:
            if c['id']:
                L.append(f"select setval(pg_get_serial_sequence('public.\"{t}\"', '{c['c']}'), coalesce((select max(\"{c['c']}\") from public.\"{t}\"), 0) + 1, false);")
    L += ['', 'commit;', '', '-- CONFERÊNCIA: a coluna "esperado" tem que ser igual a "encontrado" em todas as linhas']
    partes = [f"select 'usuários de login' item, (select count(*) from auth.users)::int encontrado, {len(usuarios)} esperado"]
    partes += [f"select '{t}', (select count(*) from public.\"{t}\")::int, {len(dados[t])}" for t in tabelas]
    L.append('select item, encontrado, esperado, case when encontrado >= esperado then \'OK\' else \'ATENÇÃO\' end resultado from (\n  '
             + '\n  union all '.join(partes) + '\n) r order by item;')
    return '\n'.join(L) + '\n'

def usuarios_de_dados(dados, usuarios):
    email = {u['id']: u['email'] for u in usuarios}
    linhas = ['| Login | Nome | Função | Papéis | Ativo |', '|---|---|---|---|---|']
    for p in sorted(dados.get('perfis', []), key=lambda p: (p.get('nome') or '')):
        login = (email.get(p['user_id']) or p.get('usuario') or '').split('@')[0]
        linhas.append(f"| `{login}` | {p.get('nome') or ''} | {p.get('funcao') or ''} | {', '.join(p.get('papeis') or [])} | {'sim' if p.get('ativo') else 'não'} |")
    ops = dados.get('operadores', [])
    if ops: linhas += ['', 'Padeiros/operadores (entram com senha de 6 números no tablet): ' + ', '.join(sorted(o['nome'] for o in ops))]
    return '\n'.join(linhas) + '\n'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--saida', required=True)
    ap.add_argument('--sem-dados', action='store_true', help='não incluir os dados de produção (só código e banco vazio)')
    a = ap.parse_args()
    versao = re.search(r"VERSAO_APP = '([^']+)'", ler('versao.js')).group(1)
    ref_proj = re.search(r'https://([a-z0-9]+)\.supabase\.co', ler('config.js')).group(1)
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
    # dados de hoje (privados: só no zip)
    admin, admin_nome, resumo = 'SEU-USUARIO', 'SEU NOME', ['- Dados de produção: **não incluídos** (backup feito com --sem-dados).']
    if not a.sem_dados:
        tabelas, dados, usuarios, versao_banco = exportar_dados(ref_proj)
        if versao_banco != ref['ultima']:
            sys.exit(f'PARE: o banco de produção está na versão {versao_banco} e o código na {ref["ultima"]}. Aplique a atualização antes do backup.')
        priv = os.path.join(pasta, 'DADOS_PRIVADOS'); os.makedirs(priv)
        sql = sql_restaurar(tabelas, dados, usuarios, versao_banco, versao, data)
        open(os.path.join(priv, 'restaurar-dados.sql'), 'w', encoding='utf-8').write(sql)
        open(os.path.join(priv, 'usuarios.md'), 'w', encoding='utf-8').write(f'# Usuários em {data} (CONFIDENCIAL · sem senhas)\n\n' + usuarios_de_dados(dados, usuarios))
        email = {u['id']: u['email'] for u in usuarios}
        adm = next((p for p in sorted(dados.get('perfis', []), key=lambda p: p.get('criado_em') or '') if 'admin' in (p.get('papeis') or []) and p.get('ativo')), None)
        if adm: admin, admin_nome = (email.get(adm['user_id']) or adm['usuario']).split('@')[0], adm.get('nome') or adm['usuario']
        n = {t: len(x) for t, x in dados.items()}
        resumo = [f'- Banco de produção na versão **{versao_banco}**, dados exportados em {data}.',
                  f'- {len(usuarios)} usuários de login, {n.get("operadores", 0)} padeiros/operadores, {n.get("produtos", 0)} produtos, '
                  f'{n.get("fornecedores", 0)} fornecedores, {n.get("fichas_tecnicas", 0)} fichas técnicas, {n.get("pedidos", 0)} pedidos, '
                  f'{n.get("movimentos", 0)} movimentos de estoque, {n.get("producoes", 0)} produções, {n.get("auditoria", 0)} registros de auditoria.',
                  f'- {sum(n.values())} registros em {len(n)} tabelas, todos em `DADOS_PRIVADOS/restaurar-dados.sql`.']
    resumo += [f'- Código `{commit}`: {len(linhas)} arquivos, conferidos por SHA-256. Nenhum segredo encontrado.']
    v = dict(versao=versao, commit=commit, data=data, admin=admin, admin_nome=admin_nome, resumo='\n'.join(resumo))
    for m in ('PROMPT_RECONSTRUCAO.md', 'GUIA_DO_DONO.md', 'LEIA-PRIMEIRO.md'):
        open(os.path.join(pasta, m), 'w', encoding='utf-8').write(modelo(m, **v))
    open(os.path.join(pasta, 'ESPECIFICACAO_DO_SISTEMA.md'), 'w', encoding='utf-8').write(especificacao(versao))
    # autoconferência: o próprio pacote tem que bater com o manifesto
    r = subprocess.run([sys.executable, os.path.join(pasta, 'CONFERENCIA', 'conferir_arquivos.py'), os.path.join(pasta, 'site')], capture_output=True, text=True)
    if 'TODOS OS ARQUIVOS IDÊNTICOS' not in r.stdout: sys.exit('PARE: autoconferência falhou\n' + r.stdout)
    z = shutil.make_archive(pasta, 'zip', a.saida, nome)
    print(f'OK · versão {versao} · código {commit} · {len(linhas)} arquivos · segredos: nenhum')
    print('\n'.join(resumo))
    print(f'banco de referência: {ref}')
    print(z)

if __name__ == '__main__':
    main()
