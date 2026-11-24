-- =====================================================================
-- ARTAS INDÚSTRIA (licenciado para Pães São Sebastião) · INSTALAR O BANCO COMPLETO DO ZERO
-- Para um projeto NOVO do Supabase (vazio). Rode UMA vez, inteiro:
--   Supabase › SQL Editor › New query › colar este arquivo › Run
-- Conteúdo, nesta ordem: estrutura, segurança (RLS), funções, dados iniciais (unidade Matriz,
-- locais, parâmetros), atualizações 001–005, v2.6, v2.7, v2.9, v2.10, v2.11, v2.13, v2.16, v2.17, v2.18, v2.19, v2.20, v2.21.
-- NÃO contém dados do dia a dia (pedidos, estoque…) nem senhas: só a estrutura e as regras.
-- Gerado automaticamente a partir do código do sistema por ferramentas/gerar_backup.py.
-- =====================================================================

-- =====================================================================
-- Sistema de Compras e Estoque PSS
-- Arquivo 01 de 04: ESTRUTURA (tabelas)
-- Rodar no Supabase: SQL Editor -> New query -> colar tudo -> Run
-- Ordem: 01_estrutura, 02_seguranca, 03_funcoes, 04_dados_iniciais
-- =====================================================================

-- ---------------------------------------------------------------------
-- PERFIS: um registro por usuário de login (Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  usuario     text not null unique,              -- login curto (ex.: carlos)
  nome        text not null,                     -- nome para exibir
  funcao      text,                              -- função/cargo (ex.: Engenheiro de produção)
  papeis      text[] not null default '{}'         -- uma pessoa pode ter mais de um papel
              check (papeis <@ array['admin','comprador','almoxarifado','recebimento',
                                     'pesagem','engenharia','diretoria','financeiro',
                                     'faturamento']::text[]),
  ativo       boolean not null default false,
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PARÂMETROS GERAIS (chave/valor)
-- ---------------------------------------------------------------------
create table if not exists public.parametros (
  chave       text primary key,
  valor       text,
  descricao   text
);

-- ---------------------------------------------------------------------
-- FORNECEDORES
-- ---------------------------------------------------------------------
create table if not exists public.fornecedores (
  id                  bigint generated always as identity primary key,
  nome                text not null,                 -- nome fantasia (o que aparece nas telas)
  razao_social        text,
  tipo_pessoa         text not null default 'PJ' check (tipo_pessoa in ('PJ','PF')),  -- PJ = jurídica (CNPJ) · PF = física (CPF)
  cnpj                text,                          -- CNPJ ou CPF, SEM pontuação (a tela formata)
  inscricao_estadual  text,
  contato             text,
  telefone            text,
  whatsapp            text,
  email               text,
  endereco            text,                          -- rua, número, complemento
  bairro              text,
  cidade              text,
  uf                  text,
  cep                 text,
  condicao_pagamento  text,                          -- condição padrão (vem no pedido)
  prazo_entrega_dias  integer,
  observacao          text,
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz,
  atualizado_por      uuid references auth.users(id)
);

-- ---------------------------------------------------------------------
-- PRODUTOS
-- id     = código interno (nunca muda, amarra todo o histórico)
-- codigo = código gerencial (pode ser trocado pelo admin/comprador)
-- saldo e custo_medio só são alterados pelas funções de movimentação
-- ---------------------------------------------------------------------
create table if not exists public.produtos (
  id                    bigint generated always as identity primary key,
  codigo                text not null unique,
  codigo_erp            text,                          -- código do mesmo produto no ERP (para conciliar)
  descricao             text not null,
  categoria             text not null check (categoria in
                          ('materia_prima','embalagem','escritorio','limpeza','outros')),
  grupo                 text,                          -- ex.: Farinha, Fermento, Melhorador, Bobina
  classificacao         text,                          -- ex.: A, B, C, D (farinha mais forte/fraca)
  marca                 text,                          -- ex.: Coamo, Moinho X
  unidade_estoque       text not null,                 -- kg, g, L, un, m...
  unidade_compra        text,                          -- saco, caixa, bobina...
  fator_compra          numeric(14,4) not null default 1 check (fator_compra > 0),
  estoque_minimo        numeric(14,4),                 -- mínimo DEFINIDO (digitado)
  prazo_entrega_dias    integer,                       -- prazo padrão (usado até ter histórico)
  fornecedor_padrao_id  bigint references public.fornecedores(id),
  observacao            text,
  ativo                 boolean not null default true,
  saldo                 numeric(14,4) not null default 0,
  custo_medio           numeric(16,6) not null default 0,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz,
  atualizado_por        uuid references auth.users(id)
);

-- ---------------------------------------------------------------------
-- FICHAS TÉCNICAS (receitas) e seus itens
-- quantidade do item = quantidade por 1 receita, na unidade de estoque
-- ---------------------------------------------------------------------
create table if not exists public.fichas_tecnicas (
  id            bigint generated always as identity primary key,
  codigo        text not null unique,                -- código da receita (ex.: R001)
  nome          text not null,
  produto_final text,
  rendimento    text,                                -- texto livre (ex.: 180 pacotes)
  rendimento_qtd     numeric(12,3) check (rendimento_qtd is null or rendimento_qtd > 0),  -- quanto 1 receita rende
  rendimento_unidade text,                           -- unidade do rendimento (pacotes, unidades...)
  observacao    text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em   timestamptz,
  atualizado_por  uuid references auth.users(id)
);

-- Histórico legível de cada alteração de ficha técnica (quem, quando, o quê)
create table if not exists public.fichas_historico (
  id          bigint generated always as identity primary key,
  ficha_id    bigint not null references public.fichas_tecnicas(id),
  data_hora   timestamptz not null default now(),
  usuario_id  uuid references auth.users(id),
  descricao   text not null
);

create table if not exists public.ficha_itens (
  id          bigint generated always as identity primary key,
  ficha_id    bigint not null references public.fichas_tecnicas(id),
  produto_id  bigint not null references public.produtos(id),
  quantidade  numeric(14,4) not null check (quantidade > 0)
);

-- ---------------------------------------------------------------------
-- PEDIDOS DE COMPRA e itens
-- ---------------------------------------------------------------------
create table if not exists public.pedidos (
  id                 bigint generated always as identity primary key,  -- nº do pedido (PC-000001)
  fornecedor_id      bigint not null references public.fornecedores(id),
  data_pedido        date not null,
  previsao_entrega   date,
  condicao_pagamento text,
  observacao         text,
  status             text not null default 'aberto'
                     check (status in ('aberto','parcial','recebido','cancelado','encerrado')),
  motivo_cancelamento text,
  comprador_id       uuid references auth.users(id),       -- quem criou
  -- FINANCEIRO: previsão de pagamento e controle do lançamento no contas a pagar
  previsao_pagamento date,
  fin_lancado        boolean not null default false,
  fin_lancado_em     timestamptz,
  fin_lancado_por    uuid references auth.users(id),
  fin_obs            text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz,
  atualizado_por     uuid references auth.users(id)
);

create table if not exists public.pedido_itens (
  id                 bigint generated always as identity primary key,
  pedido_id          bigint not null references public.pedidos(id),
  produto_id         bigint not null references public.produtos(id),
  quantidade         numeric(14,4) not null check (quantidade > 0),  -- na unidade informada
  unidade            text not null,
  quantidade_base    numeric(14,4) not null,                           -- na unidade de estoque
  preco_unitario     numeric(16,6) not null default 0,                 -- por unidade informada
  valor_total        numeric(16,2) not null default 0,
  qtd_recebida_base  numeric(14,4) not null default 0
);

-- ---------------------------------------------------------------------
-- RECEBIMENTOS (cabeçalho; os itens viram movimentos tipo 'entrada')
-- ---------------------------------------------------------------------
create table if not exists public.recebimentos (
  id             bigint generated always as identity primary key,
  data_hora      timestamptz not null default now(),
  pedido_id      bigint references public.pedidos(id),
  fornecedor_id  bigint references public.fornecedores(id),
  nota_fiscal    text,
  divergencia    boolean not null default false,  -- veio diferente do pedido (quantidade, preço, item)
  divergencia_detalhe text,                        -- descrição automática da diferença
  comprador_avisado   boolean not null default false,  -- quem recebeu disse que avisou o comprador
  ciente_por     uuid references auth.users(id),  -- comprador que deu "estou ciente"
  ciente_em      timestamptz,
  ciente_obs     text,
  observacao     text,                            -- ressalva de quem recebeu
  usuario_id     uuid references auth.users(id)   -- quem recebeu
);

-- ---------------------------------------------------------------------
-- PROGRAMAÇÃO DE PRODUÇÃO: o engenheiro programa quantas receitas fazer
-- em cada dia; a pesagem dá baixa (producoes.programacao_id).
-- Nada é apagado: o que não foi feito fica pendente no dia (histórico).
-- itens_alterados = receita alterada SÓ nesta programação (por 1 receita):
--   [{"produto_id": 1, "quantidade": 50, "unidade": "kg"}, ...]
-- ---------------------------------------------------------------------
create table if not exists public.programacoes (
  id               bigint generated always as identity primary key,
  data             date not null,
  ficha_id         bigint not null references public.fichas_tecnicas(id),
  quantidade       numeric(10,3) not null check (quantidade > 0),   -- nº de receitas programadas
  itens_alterados  jsonb,
  observacao       text,
  situacao         text not null default 'ativa' check (situacao in ('ativa','cancelada')),
  cancelado_motivo text,
  criado_por       uuid references auth.users(id),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz,
  atualizado_por   uuid references auth.users(id),
  -- a engenharia confere com a pesagem e FINALIZA (depois disso não há mais baixa)
  finalizada_em    timestamptz,
  finalizada_por   uuid references auth.users(id),
  finalizada_obs   text
);
create index if not exists programacoes_data_idx on public.programacoes (data);

-- ---------------------------------------------------------------------
-- PRODUÇÕES (saída por ficha técnica)
-- ---------------------------------------------------------------------
create table if not exists public.producoes (
  id            bigint generated always as identity primary key,
  data_hora     timestamptz not null default now(),
  ficha_id      bigint not null references public.fichas_tecnicas(id),
  multiplicador numeric(10,3) not null check (multiplicador > 0),
  alterada      boolean not null default false,
  observacao    text,
  programacao_id bigint references public.programacoes(id),   -- baixa de uma programação (opcional)
  usuario_id    uuid references auth.users(id)
);
create index if not exists producoes_prog_idx on public.producoes (programacao_id);

-- ---------------------------------------------------------------------
-- INVENTÁRIOS (contagens)
-- ---------------------------------------------------------------------
create table if not exists public.inventarios (
  id          bigint generated always as identity primary key,
  data_hora   timestamptz not null default now(),
  observacao  text,
  usuario_id  uuid references auth.users(id)
);

create table if not exists public.inventario_itens (
  id             bigint generated always as identity primary key,
  inventario_id  bigint not null references public.inventarios(id),
  produto_id     bigint not null references public.produtos(id),
  saldo_sistema  numeric(14,4) not null,
  contado        numeric(14,4) not null,
  diferenca      numeric(14,4) not null,
  motivo         text check (motivo in ('extravio','perda','vencido','avariado','outros')),
  observacao     text
);

-- ---------------------------------------------------------------------
-- MOVIMENTOS: o "extrato" do estoque. NUNCA é alterado nem apagado.
-- quantidade: positiva = entra, negativa = sai (sempre na unidade de estoque)
-- correção = nova linha tipo 'correcao' apontando para a linha original
-- ---------------------------------------------------------------------
create table if not exists public.movimentos (
  id                bigint generated always as identity primary key,
  data_hora         timestamptz not null default now(),
  produto_id        bigint not null references public.produtos(id),
  tipo              text not null check (tipo in ('implantacao','entrada','saida_receita',
                      'saida_avulsa','saida_almox','inventario','correcao')),
  quantidade        numeric(14,4) not null,
  qtd_informada     numeric(14,4),
  unidade_informada text,
  custo_unitario    numeric(16,6) not null default 0,
  valor             numeric(16,2) not null default 0,
  saldo_apos        numeric(14,4) not null,
  motivo            text,
  observacao        text,
  destino           text,
  usuario_id        uuid references auth.users(id),
  recebimento_id    bigint references public.recebimentos(id),
  pedido_item_id    bigint references public.pedido_itens(id),
  producao_id       bigint references public.producoes(id),
  inventario_id     bigint references public.inventarios(id),
  corrige_id        bigint references public.movimentos(id)
);

create index if not exists movimentos_data_idx    on public.movimentos (data_hora);
create index if not exists movimentos_produto_idx on public.movimentos (produto_id, data_hora);
create index if not exists movimentos_corrige_idx on public.movimentos (corrige_id);
create index if not exists movimentos_pitem_idx   on public.movimentos (pedido_item_id);
create index if not exists pedido_itens_ped_idx   on public.pedido_itens (pedido_id);
create index if not exists ficha_itens_ficha_idx  on public.ficha_itens (ficha_id);

-- ---------------------------------------------------------------------
-- AUDITORIA: registro de toda alteração em cadastros, pedidos e perfis
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id           bigint generated always as identity primary key,
  data_hora    timestamptz not null default now(),
  usuario_id   uuid,
  tabela       text not null,
  registro_id  text,
  acao         text not null,
  antes        jsonb,
  depois       jsonb
);
create index if not exists auditoria_data_idx on public.auditoria (data_hora);

-- ---------------------------------------------------------------------
-- ACESSOS: entradas no sistema, "ver como" do administrador, troca de senha
-- (só o administrador lê; ninguém altera nem apaga)
-- ---------------------------------------------------------------------
create table if not exists public.acessos (
  id          bigint generated always as identity primary key,
  data_hora   timestamptz not null default now(),
  usuario_id  uuid references auth.users(id) default auth.uid(),
  evento      text not null check (evento in ('entrada','saida','ver_como','senha_trocada','usuario_criado','senha_redefinida','usuario_bloqueado','usuario_desbloqueado')),
  detalhe     text,
  agente      text
);
create index if not exists acessos_data_idx on public.acessos (data_hora);

-- ---------------------------------------------------------------------
-- VERSÃO DO BANCO: cada atualização (sql/atualizacoes/NNN_*.sql) grava uma linha
-- ---------------------------------------------------------------------
create table if not exists public.versao_banco (
  versao      text primary key,
  descricao   text,
  aplicada_em timestamptz not null default now()
);
insert into public.versao_banco (versao, descricao) values ('1.0.0', 'Instalação inicial'),
  ('1.1.0', 'Financeiro (contas a pagar dos pedidos), previsão de produção e perfil faturamento'),
  ('1.2.0', 'Gestão de custos (último custo e custo médio; fichas com custo) e últimas compras')
on conflict (versao) do nothing;


-- =====================================================================
-- Sistema de Compras e Estoque PSS
-- Arquivo 02 de 04: SEGURANÇA (permissões, regras RLS, auditoria)
-- =====================================================================
-- Princípio: os usuários do app só podem LER as tabelas.
-- Toda gravação passa por funções do banco (arquivo 03), que conferem
-- o papel de quem está logado antes de gravar. Ninguém consegue alterar
-- ou apagar movimentos, nem mexer em saldo/custo direto na tabela.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funções auxiliares de permissão
-- ---------------------------------------------------------------------
create or replace function public.meus_papeis()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select papeis from public.perfis where user_id = auth.uid() and ativo), '{}'::text[])
$$;

create or replace function public.usuario_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis
                 where user_id = auth.uid() and ativo and cardinality(papeis) > 0)
$$;

-- Acesso amplo = qualquer papel da operação. Financeiro e faturamento NÃO têm:
-- o banco só entrega a eles as tabelas de que precisam (ver regras de leitura abaixo).
create or replace function public.acesso_amplo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.usuario_ativo() and public.meus_papeis() &&
         array['admin','comprador','almoxarifado','recebimento','pesagem','engenharia','diretoria']::text[]
$$;

-- Matriz de permissões: ação -> papéis que podem executá-la (basta a pessoa ter UM deles)
-- (a mesma matriz existe no app, em js/util.js, só para esconder botões)
create or replace function public.pode(p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meus_papeis() && (case p_acao
    when 'cadastro_produto'    then array['admin','comprador']
    when 'cadastro_fornecedor' then array['admin','comprador']
    when 'ficha_tecnica'       then array['admin','engenharia']
    when 'pedido'              then array['admin','comprador']
    when 'recebimento'         then array['admin','almoxarifado','recebimento']
    when 'saida_receita'       then array['admin','pesagem','almoxarifado']
    when 'saida_avulsa'        then array['admin','pesagem','almoxarifado']
    when 'saida_almox'         then array['admin','almoxarifado','recebimento']
    when 'inventario'          then array['admin','almoxarifado','recebimento']
    when 'corrigir'            then array['admin','almoxarifado']
    when 'implantacao'         then array['admin']
    when 'contagem_inicial'    then array['admin','almoxarifado']
    when 'usuarios'            then array['admin']
    when 'parametros'          then array['admin']
    when 'auditoria'           then array['admin','diretoria']
    when 'importacao'          then array['admin']
    when 'programacao'         then array['admin','engenharia']
    when 'financeiro'          then array['admin','financeiro']
    when 'data_pagamento'      then array['admin','comprador','financeiro']
    when 'previsao_producao'   then array['admin','engenharia','diretoria','financeiro','faturamento']
    when 'custos'              then array['admin']
    else array[]::text[] end)::text[], false)
$$;

-- ---------------------------------------------------------------------
-- Permissões das tabelas: tirar tudo de todos e liberar só LEITURA
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;

-- Novas tabelas criadas no futuro também não ficam abertas por padrão
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------
-- RLS (Row Level Security): ligada em todas as tabelas
-- Leitura: só usuário logado, ativo e com papel definido
-- (a auditoria também é visível a todos os ativos, para mostrar "quem alterou")
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['perfis','parametros','fornecedores','produtos','fichas_tecnicas',
    'fichas_historico','ficha_itens','pedidos','pedido_itens','recebimentos','programacoes','producoes','inventarios',
    'inventario_itens','movimentos','auditoria']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists leitura on public.%I', t);
    if t = 'perfis' then
      -- cada um sempre enxerga o próprio perfil (para o app saber se está inativo)
      execute format('create policy leitura on public.%I for select to authenticated using (public.usuario_ativo() or user_id = auth.uid())', t);
    elsif t = 'parametros' then
      execute format('create policy leitura on public.%I for select to authenticated using (public.usuario_ativo())', t);
    elsif t in ('pedidos','pedido_itens','recebimentos','fornecedores','produtos') then
      -- o financeiro precisa dos pedidos (e dos nomes de fornecedor/produto); o faturamento não
      execute format('create policy leitura on public.%I for select to authenticated using (public.acesso_amplo() or (public.usuario_ativo() and ''financeiro'' = any(public.meus_papeis())))', t);
    else
      -- estoque, produção, fichas, inventário, movimentos e auditoria: só papéis da operação
      execute format('create policy leitura on public.%I for select to authenticated using (public.acesso_amplo())', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- AUDITORIA automática (gatilho genérico)
-- argumentos do gatilho = colunas a ignorar (ex.: saldo, que muda a cada movimento)
-- ---------------------------------------------------------------------
create or replace function public.auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_antes  jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_depois jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_col    text;
  v_a jsonb; v_d jsonb;
begin
  if tg_op = 'UPDATE' then
    v_a := v_antes; v_d := v_depois;
    if tg_nargs > 0 then
      foreach v_col in array tg_argv loop
        v_a := v_a - v_col; v_d := v_d - v_col;
      end loop;
    end if;
    if v_a = v_d then return new; end if;   -- só mudou coluna ignorada
  end if;
  insert into public.auditoria (usuario_id, tabela, registro_id, acao, antes, depois)
  values (auth.uid(), tg_table_name,
          coalesce(v_depois->>'id', v_antes->>'id', v_depois->>'user_id', v_antes->>'user_id', v_depois->>'chave', v_antes->>'chave'),
          tg_op, v_antes, v_depois);
  return coalesce(new, old);
end $$;

drop trigger if exists aud on public.perfis;
create trigger aud after insert or update or delete on public.perfis
  for each row execute function public.auditar();
drop trigger if exists aud on public.parametros;
create trigger aud after insert or update or delete on public.parametros
  for each row execute function public.auditar();
drop trigger if exists aud on public.fornecedores;
create trigger aud after insert or update or delete on public.fornecedores
  for each row execute function public.auditar();
drop trigger if exists aud on public.produtos;
create trigger aud after insert or update or delete on public.produtos
  for each row execute function public.auditar('saldo','custo_medio');
drop trigger if exists aud on public.fichas_tecnicas;
create trigger aud after insert or update or delete on public.fichas_tecnicas
  for each row execute function public.auditar();
drop trigger if exists aud on public.ficha_itens;
create trigger aud after insert or update or delete on public.ficha_itens
  for each row execute function public.auditar();
drop trigger if exists aud on public.pedidos;
create trigger aud after insert or update or delete on public.pedidos
  for each row execute function public.auditar('status');
drop trigger if exists aud on public.pedido_itens;
create trigger aud after insert or update or delete on public.pedido_itens
  for each row execute function public.auditar('qtd_recebida_base');
drop trigger if exists aud on public.recebimentos;
create trigger aud after insert or update or delete on public.recebimentos
  for each row execute function public.auditar();
drop trigger if exists aud on public.programacoes;
create trigger aud after insert or update or delete on public.programacoes
  for each row execute function public.auditar();

-- ---------------------------------------------------------------------
-- BLINDAGEM extra: movimentos, auditoria e itens de inventário
-- não aceitam UPDATE nem DELETE de ninguém (nem das funções)
-- ---------------------------------------------------------------------
create or replace function public.bloquear_alteracao()
returns trigger language plpgsql as $$
begin
  raise exception 'Registro protegido: % não pode ser alterado nem apagado. Use uma correção.', tg_table_name;
end $$;

drop trigger if exists protege on public.movimentos;
create trigger protege before update or delete on public.movimentos
  for each row execute function public.bloquear_alteracao();
drop trigger if exists protege on public.auditoria;
create trigger protege before update or delete on public.auditoria
  for each row execute function public.bloquear_alteracao();
drop trigger if exists protege on public.fichas_historico;
create trigger protege before update or delete on public.fichas_historico
  for each row execute function public.bloquear_alteracao();
drop trigger if exists protege on public.inventario_itens;
create trigger protege before update or delete on public.inventario_itens
  for each row execute function public.bloquear_alteracao();

-- ---------------------------------------------------------------------
-- Novo login criado no painel do Supabase -> cria o perfil (inativo)
-- O administrador ativa e escolhe o papel na tela "Usuários" do app.
-- ---------------------------------------------------------------------
create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (user_id, usuario, nome, papeis, ativo)
  values (new.id,
          lower(split_part(new.email, '@', 1)),
          coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
          '{}', false)
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

-- ---------------------------------------------------------------------
-- NADA SE EXCLUI: cadastros, pedidos, recebimentos, produções e
-- programações não aceitam DELETE (só inativar / cancelar)
-- ---------------------------------------------------------------------
create or replace function public.bloquear_exclusao()
returns trigger language plpgsql as $$
begin
  raise exception 'Registro protegido: % não pode ser excluído. Inative ou cancele.', tg_table_name;
end $$;
do $$
declare t text;
begin
  foreach t in array array['fornecedores','produtos','fichas_tecnicas','pedidos','recebimentos','producoes','programacoes','perfis']
  loop
    execute format('drop trigger if exists sem_exclusao on public.%I', t);
    execute format('create trigger sem_exclusao before delete on public.%I for each row execute function public.bloquear_exclusao()', t);
  end loop;
end $$;
-- produções também não mudam depois de lançadas
drop trigger if exists protege on public.producoes;
create trigger protege before update on public.producoes
  for each row execute function public.bloquear_alteracao();

-- acessos: só o administrador lê; versão do banco: todos os ativos leem
alter table public.acessos enable row level security;
alter table public.acessos force row level security;
revoke all on public.acessos from anon, authenticated;
grant select on public.acessos to authenticated;
drop policy if exists ler on public.acessos;
create policy ler on public.acessos for select to authenticated using ('admin' = any(public.meus_papeis()));
drop trigger if exists protege on public.acessos;
create trigger protege before update or delete on public.acessos for each row execute function public.bloquear_alteracao();

alter table public.versao_banco enable row level security;
alter table public.versao_banco force row level security;
revoke all on public.versao_banco from anon, authenticated;
grant select on public.versao_banco to authenticated;
drop policy if exists ler on public.versao_banco;
create policy ler on public.versao_banco for select to authenticated using (public.usuario_ativo());

-- ---------------------------------------------------------------------
-- Função "admin-usuarios" (servidor): a chave secreta (service_role) só
-- precisa LER perfis e GRAVAR o registro de acessos. Necessário quando o
-- projeto foi criado sem "Automatically expose new tables" (recomendado).
-- ---------------------------------------------------------------------
grant usage on schema public to service_role;
grant select on public.perfis to service_role;
grant insert on public.acessos to service_role;


-- =====================================================================
-- Sistema de Compras e Estoque PSS
-- Arquivo 03 de 04: FUNÇÕES (todas as gravações passam por aqui)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitários internos
-- ---------------------------------------------------------------------
create or replace function public._hoje()
returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create or replace function public._param(p_chave text)
returns text language sql stable security definer set search_path = public as $$
  select valor from public.parametros where chave = p_chave
$$;

create or replace function public._exigir(p_acao text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode(p_acao) then
    raise exception 'Sem permissão para esta ação (%).', p_acao using errcode = '42501';
  end if;
end $$;

create or replace function public._texto(p jsonb, p_campo text)
returns text language sql immutable as $$
  select nullif(btrim(p->>p_campo), '')
$$;

-- CNPJ / CPF: guarda sem pontuação (só números; no CNPJ novo, letras maiúsculas e números)
create or replace function public._doc_limpo(p text)
returns text language sql immutable as $$
  select nullif(upper(regexp_replace(coalesce(p,''), '[^0-9A-Za-z]', '', 'g')), '')
$$;

-- CNPJ válido (numérico ou alfanumérico, regra da Receita a partir de jul/2026):
-- 12 posições com 0-9 ou A-Z + 2 dígitos verificadores (módulo 11, valor = código ASCII − 48)
create or replace function public._cnpj_valido(p text)
returns boolean language plpgsql immutable as $$
declare d text := public._doc_limpo(p); s int; i int; dv int;
        w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
        w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if d is null or d !~ '^[0-9A-Z]{12}[0-9]{2}$' or d = repeat(substr(d,1,1), 14) then return false; end if;
  s := 0;
  for i in 1..12 loop s := s + (ascii(substr(d,i,1)) - 48) * w1[i]; end loop;
  dv := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  if dv <> substr(d,13,1)::int then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + (ascii(substr(d,i,1)) - 48) * w2[i]; end loop;
  dv := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return dv = substr(d,14,1)::int;
end $$;

-- CPF válido: 11 números + 2 dígitos verificadores (módulo 11)
create or replace function public._cpf_valido(p text)
returns boolean language plpgsql immutable as $$
declare d text := public._doc_limpo(p); s int; i int; dv int;
begin
  if d is null or d !~ '^[0-9]{11}$' or d = repeat(substr(d,1,1), 11) then return false; end if;
  s := 0;
  for i in 1..9 loop s := s + substr(d,i,1)::int * (11 - i); end loop;
  dv := (s * 10) % 11; if dv = 10 then dv := 0; end if;
  if dv <> substr(d,10,1)::int then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(d,i,1)::int * (12 - i); end loop;
  dv := (s * 10) % 11; if dv = 10 then dv := 0; end if;
  return dv = substr(d,11,1)::int;
end $$;

-- CNPJ / CPF formatado (00.000.000/0000-00 · 000.000.000-00) — usado em mensagens
create or replace function public._doc_formatado(p text)
returns text language sql immutable as $$
  select case
    when length(public._doc_limpo(p)) = 14 then regexp_replace(public._doc_limpo(p), '^(..)(...)(...)(....)(..)$', '\1.\2.\3/\4-\5')
    when length(public._doc_limpo(p)) = 11 then regexp_replace(public._doc_limpo(p), '^(...)(...)(...)(..)$', '\1.\2.\3-\4')
    else p end
$$;

-- Formata número no padrão brasileiro para textos de histórico (5 / 0,5 / 4,25)
create or replace function public._fmt(v numeric)
returns text language sql immutable as $$
  select replace(rtrim(rtrim(to_char(round(v, 3), 'FM999999990.000'), '0'), '.'), '.', ',')
$$;
create or replace function public._fmt2(v numeric)
returns text language sql immutable as $$
  select replace(to_char(round(v, 2), 'FM999999990.00'), '.', ',')
$$;

-- Plural da unidade conforme a quantidade (1 saco, 2 sacos; kg/g/L não mudam)
create or replace function public._un(p_un text, v numeric)
returns text language sql immutable as $$
  select case
    when p_un is null then ''
    when lower(p_un) in ('kg','g','l','ml','un','m','cx','pct','mg','t') then p_un
    when abs(v) > 0 and abs(v) < 2 then p_un   -- menos de 2 fica no singular
    when p_un ~ 'ão$' then regexp_replace(p_un, 'ão$', 'ões')
    when p_un ~ '[aeiouáéíóúâêô]$' then p_un || 's'
    when p_un ~ 'l$' then regexp_replace(p_un, 'l$', 'is')
    when p_un ~ '[rzs]$' then p_un || 'es'
    else p_un || 's' end
$$;

-- Fator para converter a unidade informada na unidade de estoque
create or replace function public._fator(p_produto bigint, p_unidade text)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v public.produtos;
begin
  select * into v from public.produtos where id = p_produto;
  if not found then raise exception 'Produto % não encontrado.', p_produto; end if;
  if p_unidade is null or p_unidade = v.unidade_estoque then return 1; end if;
  if p_unidade = v.unidade_compra then return v.fator_compra; end if;
  if lower(v.unidade_estoque) = 'kg' and lower(p_unidade) = 'g'  then return 0.001; end if;
  if lower(v.unidade_estoque) = 'g'  and lower(p_unidade) = 'kg' then return 1000; end if;
  if lower(v.unidade_estoque) = 'l'  and lower(p_unidade) = 'ml' then return 0.001; end if;
  if lower(v.unidade_estoque) = 'ml' and lower(p_unidade) = 'l'  then return 1000; end if;
  raise exception 'Unidade "%" não serve para o produto % (%).', p_unidade, v.codigo, v.descricao;
end $$;

-- ---------------------------------------------------------------------
-- MOTOR DO ESTOQUE: grava 1 movimento e atualiza saldo e custo médio
-- p_qtd na unidade de estoque (+ entra, - sai)
-- p_custo = custo por unidade de estoque (só para entradas com custo)
-- ---------------------------------------------------------------------
create or replace function public._movimentar(p_produto bigint, p_tipo text, p_qtd numeric,
                                              p_custo numeric, p_extra jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v public.produtos;
  v_custo_mov numeric;
  v_novo_medio numeric;
  v_base numeric;
  v_id bigint;
begin
  if p_qtd is null or p_qtd = 0 then
    raise exception 'Quantidade zerada não gera movimento.';
  end if;
  select * into v from public.produtos where id = p_produto for update;
  if not found then raise exception 'Produto % não encontrado.', p_produto; end if;

  if coalesce(public._param('permitir_saldo_negativo'), 'sim') = 'nao'
     and v.saldo + p_qtd < 0 then
    raise exception 'Saldo insuficiente de % (%): saldo % %, saída de % %.',
      v.codigo, v.descricao, round(v.saldo, 3), v.unidade_estoque, round(-p_qtd, 3), v.unidade_estoque;
  end if;

  v_novo_medio := v.custo_medio;
  if p_custo is not null and p_custo >= 0 then
    v_custo_mov := p_custo;
    v_base := greatest(v.saldo, 0);
    if v_base + p_qtd > 0 then
      v_novo_medio := (v_base * v.custo_medio + p_qtd * p_custo) / (v_base + p_qtd);
    end if;
    if v_novo_medio < 0 or (v.saldo <= 0 and p_qtd > 0) then
      v_novo_medio := case when p_qtd > 0 then p_custo else v.custo_medio end;
    end if;
  else
    v_custo_mov := v.custo_medio;
  end if;

  update public.produtos
     set saldo = saldo + p_qtd, custo_medio = round(v_novo_medio, 6)
   where id = p_produto;

  insert into public.movimentos (produto_id, tipo, quantidade, qtd_informada, unidade_informada,
      custo_unitario, valor, saldo_apos, motivo, observacao, destino, usuario_id,
      recebimento_id, pedido_item_id, producao_id, inventario_id, corrige_id)
  values (p_produto, p_tipo, p_qtd,
      (p_extra->>'qtd_informada')::numeric, p_extra->>'unidade_informada',
      round(v_custo_mov, 6), round(p_qtd * v_custo_mov, 2), v.saldo + p_qtd,
      public._texto(p_extra, 'motivo'), public._texto(p_extra, 'observacao'),
      public._texto(p_extra, 'destino'), auth.uid(),
      (p_extra->>'recebimento_id')::bigint, (p_extra->>'pedido_item_id')::bigint,
      (p_extra->>'producao_id')::bigint, (p_extra->>'inventario_id')::bigint,
      (p_extra->>'corrige_id')::bigint)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public._atualizar_status_pedido(p_pedido bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_total int; v_completos int; v_algum int;
begin
  select status into v_status from public.pedidos where id = p_pedido;
  if v_status in ('cancelado','encerrado') then return; end if;
  select count(*),
         count(*) filter (where qtd_recebida_base >= quantidade_base * 0.999),
         count(*) filter (where qtd_recebida_base > 0)
    into v_total, v_completos, v_algum
    from public.pedido_itens where pedido_id = p_pedido;
  update public.pedidos set status =
    case when v_total > 0 and v_completos = v_total then 'recebido'
         when v_algum > 0 then 'parcial' else 'aberto' end
   where id = p_pedido;
end $$;

-- =====================================================================
-- CADASTROS
-- =====================================================================
create or replace function public.salvar_produto(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := (p->>'id')::bigint; v_old public.produtos;
        v_ucompra text := public._texto(p, 'unidade_compra');
        v_fator numeric := coalesce((p->>'fator_compra')::numeric, 1);
begin
  perform public._exigir('cadastro_produto');
  if public._texto(p,'codigo') is null then raise exception 'Informe o código do produto.'; end if;
  if public._texto(p,'descricao') is null then raise exception 'Informe a descrição do produto.'; end if;
  if public._texto(p,'unidade_estoque') is null then raise exception 'Informe a unidade de estoque.'; end if;
  if coalesce(p->>'categoria','') not in ('materia_prima','embalagem','escritorio','limpeza','outros') then
    raise exception 'Categoria inválida: "%". Use: materia_prima, embalagem, escritorio, limpeza ou outros.', p->>'categoria';
  end if;
  if v_ucompra is null or v_ucompra = p->>'unidade_estoque' then v_ucompra := null; v_fator := 1; end if;
  if v_fator <= 0 then raise exception 'O fator de conversão precisa ser maior que zero.'; end if;
  if exists (select 1 from public.produtos where lower(codigo) = lower(btrim(p->>'codigo'))
             and id is distinct from v_id) then
    raise exception 'Já existe um produto com o código %.', p->>'codigo';
  end if;

  if v_id is null then
    insert into public.produtos (codigo, codigo_erp, descricao, categoria, grupo, classificacao, marca, unidade_estoque, unidade_compra,
        fator_compra, estoque_minimo, prazo_entrega_dias, fornecedor_padrao_id, observacao, ativo)
    values (btrim(p->>'codigo'), public._texto(p,'codigo_erp'), btrim(p->>'descricao'), p->>'categoria',
        public._texto(p,'grupo'), upper(public._texto(p,'classificacao')), public._texto(p,'marca'), btrim(p->>'unidade_estoque'),
        v_ucompra, v_fator, (p->>'estoque_minimo')::numeric, (p->>'prazo_entrega_dias')::int,
        (p->>'fornecedor_padrao_id')::bigint, public._texto(p,'observacao'),
        coalesce((p->>'ativo')::boolean, true))
    returning id into v_id;
    update public.produtos set atualizado_em = now(), atualizado_por = auth.uid() where id = v_id;
  else
    select * into v_old from public.produtos where id = v_id;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if v_old.unidade_estoque <> btrim(p->>'unidade_estoque')
       and exists (select 1 from public.movimentos where produto_id = v_id) then
      raise exception 'A unidade de estoque não pode mudar depois que o produto já tem movimentos.';
    end if;
    update public.produtos set
      codigo = btrim(p->>'codigo'), codigo_erp = public._texto(p,'codigo_erp'), descricao = btrim(p->>'descricao'), categoria = p->>'categoria',
      grupo = public._texto(p,'grupo'), classificacao = upper(public._texto(p,'classificacao')), marca = public._texto(p,'marca'),
      unidade_estoque = btrim(p->>'unidade_estoque'), unidade_compra = v_ucompra, fator_compra = v_fator,
      estoque_minimo = (p->>'estoque_minimo')::numeric, prazo_entrega_dias = (p->>'prazo_entrega_dias')::int,
      fornecedor_padrao_id = (p->>'fornecedor_padrao_id')::bigint, observacao = public._texto(p,'observacao'),
      ativo = coalesce((p->>'ativo')::boolean, true), atualizado_em = now(), atualizado_por = auth.uid()
    where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.salvar_fornecedor(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := (p->>'id')::bigint; v_uf text := upper(public._texto(p,'uf'));
        v_doc text := public._doc_limpo(p->>'cnpj');   -- CNPJ ou CPF, sem pontuação
        v_tipo text; v_ant public.fornecedores; v_nome_doc text;
begin
  perform public._exigir('cadastro_fornecedor');
  if public._texto(p,'nome') is null then raise exception 'Informe o nome do fornecedor.'; end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then raise exception 'UF deve ter 2 letras (ex.: SP).'; end if;
  if v_id is not null then select * into v_ant from public.fornecedores where id = v_id; end if;
  -- tipo: o informado; sem tipo (planilha), deduz pelo número (11 números = CPF) ou mantém o do cadastro
  v_tipo := upper(coalesce(public._texto(p,'tipo_pessoa'),
                           case when v_doc ~ '^[0-9]{11}$' then 'PF' when v_doc is not null then 'PJ' end,
                           v_ant.tipo_pessoa, 'PJ'));
  if v_tipo not in ('PJ','PF') then raise exception 'Tipo de pessoa inválido (use PJ = jurídica ou PF = física).'; end if;
  v_nome_doc := case v_tipo when 'PF' then 'CPF' else 'CNPJ' end;
  if v_doc is not null then
    -- confere os dígitos só quando o documento ou o tipo mudam (não trava cadastros antigos)
    if v_doc is distinct from public._doc_limpo(v_ant.cnpj) or v_tipo is distinct from v_ant.tipo_pessoa then
      if v_tipo = 'PJ' and not public._cnpj_valido(v_doc) then
        raise exception 'CNPJ inválido: %. Confira os números digitados.', public._doc_formatado(v_doc);
      end if;
      if v_tipo = 'PF' and not public._cpf_valido(v_doc) then
        raise exception 'CPF inválido: %. Confira os números digitados.', public._doc_formatado(v_doc);
      end if;
    end if;
    if exists (select 1 from public.fornecedores where public._doc_limpo(cnpj) = v_doc and id is distinct from v_id) then
      raise exception 'Já existe um fornecedor com o % %.', v_nome_doc, public._doc_formatado(v_doc);
    end if;
  end if;
  if v_id is null then
    insert into public.fornecedores (nome, ativo) values (btrim(p->>'nome'), true) returning id into v_id;
  elsif v_ant.id is null then
    raise exception 'Fornecedor não encontrado.';
  end if;
  update public.fornecedores set nome = btrim(p->>'nome'), razao_social = public._texto(p,'razao_social'),
    tipo_pessoa = v_tipo, cnpj = v_doc, inscricao_estadual = public._texto(p,'inscricao_estadual'),
    contato = public._texto(p,'contato'), telefone = public._texto(p,'telefone'), whatsapp = public._texto(p,'whatsapp'),
    email = public._texto(p,'email'), endereco = public._texto(p,'endereco'), bairro = public._texto(p,'bairro'),
    cidade = public._texto(p,'cidade'), uf = v_uf, cep = public._texto(p,'cep'),
    condicao_pagamento = public._texto(p,'condicao_pagamento'), prazo_entrega_dias = (p->>'prazo_entrega_dias')::int,
    observacao = public._texto(p,'observacao'), ativo = coalesce((p->>'ativo')::boolean, true),
    atualizado_em = now(), atualizado_por = auth.uid()
  where id = v_id;
  return v_id;
end $$;

create or replace function public.salvar_ficha(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := (p->>'id')::bigint; v_old public.fichas_tecnicas; it jsonb; r record;
        v_novos jsonb := '{}'::jsonb; v_desc text[] := '{}'; v_pid bigint; v_q numeric;
        k text; v text; v_pr public.produtos; v_n int;
begin
  perform public._exigir('ficha_tecnica');
  if public._texto(p,'nome') is null then raise exception 'Informe o nome da ficha técnica.'; end if;
  -- rendimento numérico (quanto 1 receita rende). Se não vier, tenta ler do texto: "180 pacotes", "1.000 unidades"
  if public._texto(p,'rendimento_qtd') is null and public._texto(p,'rendimento') ~ '^\s*[0-9][0-9.]*(,[0-9]+)?\s*\S' then
    p := p || jsonb_build_object(
      'rendimento_qtd', replace(replace(substring(p->>'rendimento' from '^\s*([0-9][0-9.]*(,[0-9]+)?)'), '.', ''), ',', '.'),
      'rendimento_unidade', coalesce(public._texto(p,'rendimento_unidade'), btrim(regexp_replace(p->>'rendimento', '^\s*[0-9][0-9.]*(,[0-9]+)?\s*', ''))));
  end if;
  if public._texto(p,'rendimento_qtd') is not null and (p->>'rendimento_qtd')::numeric <= 0 then
    raise exception 'O rendimento precisa ser maior que zero.';
  end if;
  if jsonb_array_length(coalesce(p->'itens','[]'::jsonb)) = 0 then
    raise exception 'A ficha técnica precisa de pelo menos 1 ingrediente.';
  end if;
  if public._texto(p,'codigo') is not null and exists (select 1 from public.fichas_tecnicas
       where lower(codigo) = lower(btrim(p->>'codigo')) and id is distinct from v_id) then
    raise exception 'Já existe uma ficha técnica com o código %.', p->>'codigo';
  end if;
  -- ingredientes informados (somando repetidos), já na unidade de estoque
  for it in select * from jsonb_array_elements(p->'itens') loop
    v_pid := (it->>'produto_id')::bigint;
    if not exists (select 1 from public.produtos where id = v_pid and categoria = 'materia_prima') then
      raise exception 'Ficha técnica só aceita matéria-prima (produto %).', v_pid;
    end if;
    if coalesce((it->>'quantidade')::numeric, 0) <= 0 then
      raise exception 'Quantidade do ingrediente precisa ser maior que zero.';
    end if;
    v_q := (it->>'quantidade')::numeric * public._fator(v_pid, it->>'unidade');
    v_novos := jsonb_set(v_novos, array[v_pid::text], to_jsonb(coalesce((v_novos->>v_pid::text)::numeric, 0) + v_q));
  end loop;

  if v_id is null then
    insert into public.fichas_tecnicas (codigo, nome, produto_final, rendimento, rendimento_qtd, rendimento_unidade, observacao, ativo, atualizado_em, atualizado_por)
    values (coalesce(btrim(p->>'codigo'), 'R' || lpad((select coalesce(max(id),0)+1 from public.fichas_tecnicas)::text, 3, '0')),
            btrim(p->>'nome'), public._texto(p,'produto_final'), public._texto(p,'rendimento'),
            (public._texto(p,'rendimento_qtd'))::numeric, public._texto(p,'rendimento_unidade'),
            public._texto(p,'observacao'), coalesce((p->>'ativo')::boolean, true), now(), auth.uid())
    returning id into v_id;
    select count(*) into v_n from jsonb_object_keys(v_novos);
    v_desc := array[format('Criou a ficha com %s %s', v_n, case when v_n = 1 then 'ingrediente' else 'ingredientes' end)];
  else
    select * into v_old from public.fichas_tecnicas where id = v_id for update;
    if not found then raise exception 'Ficha técnica não encontrada.'; end if;
    if public._texto(p,'codigo') is not null and v_old.codigo is distinct from btrim(p->>'codigo') then
      v_desc := v_desc || format('código: "%s" → "%s"', v_old.codigo, btrim(p->>'codigo')); end if;
    if v_old.nome is distinct from btrim(p->>'nome') then
      v_desc := v_desc || format('nome: "%s" → "%s"', v_old.nome, btrim(p->>'nome')); end if;
    if v_old.produto_final is distinct from public._texto(p,'produto_final') then
      v_desc := v_desc || format('produto final: "%s" → "%s"', coalesce(v_old.produto_final,''), coalesce(public._texto(p,'produto_final'),'')); end if;
    if v_old.rendimento is distinct from public._texto(p,'rendimento') then
      v_desc := v_desc || format('rendimento: "%s" → "%s"', coalesce(v_old.rendimento,''), coalesce(public._texto(p,'rendimento'),'')); end if;
    if v_old.rendimento_qtd is distinct from (public._texto(p,'rendimento_qtd'))::numeric
       or v_old.rendimento_unidade is distinct from public._texto(p,'rendimento_unidade') then
      v_desc := v_desc || format('rendimento por receita: %s %s → %s %s', coalesce(public._fmt(v_old.rendimento_qtd),'–'), coalesce(v_old.rendimento_unidade,''),
                                 coalesce(public._fmt((public._texto(p,'rendimento_qtd'))::numeric),'–'), coalesce(public._texto(p,'rendimento_unidade'),'')); end if;
    if v_old.observacao is distinct from public._texto(p,'observacao') then
      v_desc := v_desc || 'alterou a observação'::text; end if;
    if v_old.ativo is distinct from coalesce((p->>'ativo')::boolean, true) then
      v_desc := v_desc || (case when coalesce((p->>'ativo')::boolean, true) then 'reativou a ficha' else 'desativou a ficha' end); end if;
    update public.fichas_tecnicas set codigo = coalesce(btrim(p->>'codigo'), codigo), nome = btrim(p->>'nome'), produto_final = public._texto(p,'produto_final'),
      rendimento = public._texto(p,'rendimento'), rendimento_qtd = (public._texto(p,'rendimento_qtd'))::numeric,
      rendimento_unidade = public._texto(p,'rendimento_unidade'), observacao = public._texto(p,'observacao'),
      ativo = coalesce((p->>'ativo')::boolean, true), atualizado_em = now(), atualizado_por = auth.uid()
    where id = v_id;
    -- compara item a item com o que já existia
    for r in select fi.id, fi.produto_id, fi.quantidade, pr.descricao, pr.unidade_estoque
               from public.ficha_itens fi join public.produtos pr on pr.id = fi.produto_id
              where fi.ficha_id = v_id order by fi.id loop
      if not (v_novos ? r.produto_id::text) then
        delete from public.ficha_itens where id = r.id;
        v_desc := v_desc || format('retirou %s (%s %s)', r.descricao, public._fmt(r.quantidade), public._un(r.unidade_estoque, r.quantidade));
      elsif abs((v_novos->>r.produto_id::text)::numeric - r.quantidade) > 0.00005 then
        update public.ficha_itens set quantidade = (v_novos->>r.produto_id::text)::numeric where id = r.id;
        v_desc := v_desc || format('%s: %s → %s %s', r.descricao, public._fmt(r.quantidade),
                                   public._fmt((v_novos->>r.produto_id::text)::numeric),
                                   public._un(r.unidade_estoque, (v_novos->>r.produto_id::text)::numeric));
      end if;
      v_novos := v_novos - r.produto_id::text;
    end loop;
  end if;
  -- ingredientes novos
  for k, v in select key, value from jsonb_each_text(v_novos) loop
    insert into public.ficha_itens (ficha_id, produto_id, quantidade) values (v_id, k::bigint, v::numeric);
    if v_old.id is not null then
      select * into v_pr from public.produtos where id = k::bigint;
      v_desc := v_desc || format('incluiu %s (%s %s)', v_pr.descricao, public._fmt(v::numeric), public._un(v_pr.unidade_estoque, v::numeric));
    end if;
  end loop;
  if coalesce(array_length(v_desc, 1), 0) > 0 then
    insert into public.fichas_historico (ficha_id, usuario_id, descricao)
    values (v_id, auth.uid(), array_to_string(v_desc, '; '));
  end if;
  return v_id;
end $$;

-- =====================================================================
-- PEDIDOS DE COMPRA
-- =====================================================================
create or replace function public.salvar_pedido(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := (p->>'id')::bigint; v_status text; it jsonb; v_pi public.pedido_itens;
        v_ids bigint[] := '{}'; v_base numeric; v_qtd numeric; v_preco numeric;
begin
  perform public._exigir('pedido');
  if (p->>'fornecedor_id') is null then raise exception 'Escolha o fornecedor.'; end if;
  if (p->>'data_pedido') is null then raise exception 'Informe a data do pedido.'; end if;
  if jsonb_array_length(coalesce(p->'itens','[]'::jsonb)) = 0 then
    raise exception 'O pedido precisa de pelo menos 1 item.';
  end if;
  if (p->>'previsao_entrega') is not null and (p->>'previsao_entrega')::date < (p->>'data_pedido')::date then
    raise exception 'A previsão de entrega não pode ser antes da data do pedido.';
  end if;
  if (p->>'previsao_pagamento') is null then raise exception 'Informe a previsão de pagamento (o financeiro usa para o contas a pagar).'; end if;
  if (p->>'previsao_pagamento')::date < (p->>'data_pedido')::date then
    raise exception 'A previsão de pagamento não pode ser antes da data do pedido.';
  end if;

  if v_id is null then
    insert into public.pedidos (fornecedor_id, data_pedido, previsao_entrega, previsao_pagamento, condicao_pagamento,
                                observacao, comprador_id)
    values ((p->>'fornecedor_id')::bigint, (p->>'data_pedido')::date, (p->>'previsao_entrega')::date, (p->>'previsao_pagamento')::date,
            public._texto(p,'condicao_pagamento'), public._texto(p,'observacao'), auth.uid())
    returning id into v_id;
  else
    select status into v_status from public.pedidos where id = v_id for update;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if v_status not in ('aberto','parcial') then
      raise exception 'Pedido % está % e não pode ser alterado.', v_id, v_status;
    end if;
    update public.pedidos set fornecedor_id = (p->>'fornecedor_id')::bigint,
      data_pedido = (p->>'data_pedido')::date, previsao_entrega = (p->>'previsao_entrega')::date,
      previsao_pagamento = (p->>'previsao_pagamento')::date,
      condicao_pagamento = public._texto(p,'condicao_pagamento'), observacao = public._texto(p,'observacao'),
      atualizado_em = now(), atualizado_por = auth.uid()
    where id = v_id;
  end if;

  -- ids de itens existentes que continuam no pedido
  select coalesce(array_agg((x->>'id')::bigint), '{}') into v_ids
    from jsonb_array_elements(p->'itens') x where x->>'id' is not null;

  -- itens removidos (só se nada foi recebido deles)
  if exists (select 1 from public.pedido_itens where pedido_id = v_id
             and not (id = any(v_ids)) and qtd_recebida_base > 0) then
    raise exception 'Não é possível remover um item que já teve recebimento.';
  end if;
  delete from public.pedido_itens where pedido_id = v_id and not (id = any(v_ids));

  for it in select * from jsonb_array_elements(p->'itens') loop
    v_qtd := (it->>'quantidade')::numeric;
    v_preco := coalesce((it->>'preco_unitario')::numeric, 0);
    if coalesce(v_qtd, 0) <= 0 then raise exception 'Quantidade do item precisa ser maior que zero.'; end if;
    if v_preco < 0 then raise exception 'Preço não pode ser negativo.'; end if;
    v_base := v_qtd * public._fator((it->>'produto_id')::bigint, it->>'unidade');
    if it->>'id' is null then
      insert into public.pedido_itens (pedido_id, produto_id, quantidade, unidade, quantidade_base,
                                       preco_unitario, valor_total)
      values (v_id, (it->>'produto_id')::bigint, v_qtd, it->>'unidade', v_base, v_preco, round(v_qtd * v_preco, 2));
    else
      select * into v_pi from public.pedido_itens where id = (it->>'id')::bigint and pedido_id = v_id;
      if not found then raise exception 'Item % não pertence ao pedido.', it->>'id'; end if;
      if v_pi.qtd_recebida_base > 0 and v_pi.produto_id <> (it->>'produto_id')::bigint then
        raise exception 'Não é possível trocar o produto de um item que já teve recebimento.';
      end if;
      if v_base < v_pi.qtd_recebida_base - 0.0001 then
        raise exception 'A quantidade não pode ficar menor do que já foi recebido.';
      end if;
      update public.pedido_itens set produto_id = (it->>'produto_id')::bigint, quantidade = v_qtd,
        unidade = it->>'unidade', quantidade_base = v_base, preco_unitario = v_preco,
        valor_total = round(v_qtd * v_preco, 2)
      where id = v_pi.id;
    end if;
  end loop;

  perform public._atualizar_status_pedido(v_id);
  return v_id;
end $$;

create or replace function public.cancelar_pedido(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_recebeu boolean;
begin
  perform public._exigir('pedido');
  if nullif(btrim(p_motivo), '') is null then raise exception 'Informe o motivo.'; end if;
  select status into v_status from public.pedidos where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_status not in ('aberto','parcial') then
    raise exception 'Pedido já está % .', v_status;
  end if;
  select exists (select 1 from public.pedido_itens where pedido_id = p_id and qtd_recebida_base > 0)
    into v_recebeu;
  update public.pedidos set status = case when v_recebeu then 'encerrado' else 'cancelado' end,
         motivo_cancelamento = btrim(p_motivo)
   where id = p_id;
end $$;

-- =====================================================================
-- RECEBIMENTO (entrada de mercadoria, com ou sem pedido)
-- =====================================================================
create or replace function public.registrar_recebimento(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_ped public.pedidos; v_pi public.pedido_itens; v_prod public.produtos; v_rec bigint; it jsonb;
  v_qbase numeric; v_custo numeric; v_fator numeric; v_fpi numeric; v_pend numeric; v_base_ped numeric;
  v_preco_base numeric; v_n int := 0; v_det text[] := '{}'; v_ids bigint[] := '{}'; r record;
  v_pedido bigint := (p->>'pedido_id')::bigint;
  v_encerrar boolean := coalesce((p->>'encerrar_pendente')::boolean, false);
begin
  perform public._exigir('recebimento');
  if v_pedido is not null then
    select * into v_ped from public.pedidos where id = v_pedido for update;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if v_ped.status not in ('aberto','parcial') then
      raise exception 'Pedido PC-% está % e não aceita recebimento.', lpad(v_pedido::text,6,'0'), v_ped.status;
    end if;
  end if;

  insert into public.recebimentos (pedido_id, fornecedor_id, nota_fiscal, observacao, usuario_id, comprador_avisado)
  values (v_pedido, coalesce(v_ped.fornecedor_id, (p->>'fornecedor_id')::bigint),
          public._texto(p,'nota_fiscal'), public._texto(p,'observacao'), auth.uid(),
          coalesce((p->>'comprador_avisado')::boolean, false))
  returning id into v_rec;

  for it in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    if coalesce((it->>'quantidade')::numeric, 0) < 0 then
      raise exception 'Quantidade recebida não pode ser negativa.';
    end if;
    select * into v_prod from public.produtos where id = (it->>'produto_id')::bigint;
    v_fator := public._fator(v_prod.id, it->>'unidade');
    v_qbase := coalesce((it->>'quantidade')::numeric, 0) * v_fator;
    v_custo := null;
    if it->>'pedido_item_id' is not null then
      select * into v_pi from public.pedido_itens
       where id = (it->>'pedido_item_id')::bigint and pedido_id = v_pedido for update;
      if not found then raise exception 'Item não pertence ao pedido.'; end if;
      v_ids := v_ids || v_pi.id;
      v_fpi := public._fator(v_pi.produto_id, v_pi.unidade);
      v_pend := greatest(v_pi.quantidade_base - v_pi.qtd_recebida_base, 0);
      -- quantidade diferente do pedido
      if v_qbase > v_pend + 0.0001 then
        v_det := v_det || format('%s: veio A MAIS — pedido %s %s, recebido no total %s %s (+%s)', v_prod.descricao,
          public._fmt(v_pi.quantidade), public._un(v_pi.unidade, v_pi.quantidade),
          public._fmt((v_pi.qtd_recebida_base + v_qbase) / v_fpi), public._un(v_pi.unidade, (v_pi.qtd_recebida_base + v_qbase) / v_fpi),
          public._fmt((v_pi.qtd_recebida_base + v_qbase - v_pi.quantidade_base) / v_fpi));
      elsif v_qbase < v_pend - 0.0001 and v_encerrar then
        v_det := v_det || format('%s: veio A MENOS — pedido %s %s, recebido no total %s %s (−%s); o restante não virá', v_prod.descricao,
          public._fmt(v_pi.quantidade), public._un(v_pi.unidade, v_pi.quantidade),
          public._fmt((v_pi.qtd_recebida_base + v_qbase) / v_fpi), public._un(v_pi.unidade, (v_pi.qtd_recebida_base + v_qbase) / v_fpi),
          public._fmt((v_pi.quantidade_base - v_pi.qtd_recebida_base - v_qbase) / v_fpi));
      end if;
      -- custo: o do pedido, ou o da nota se for diferente
      v_base_ped := case when v_pi.quantidade_base > 0 then v_pi.valor_total / v_pi.quantidade_base end;
      v_custo := v_base_ped;
      if (it->>'preco_nota') is not null then
        v_preco_base := (it->>'preco_nota')::numeric / v_fator;
        if abs(v_preco_base * v_fpi - v_pi.preco_unitario) >= 0.005 then
          v_det := v_det || format('%s: PREÇO diferente — pedido R$ %s por %s, nota R$ %s por %s', v_prod.descricao,
            public._fmt2(v_pi.preco_unitario), v_pi.unidade, public._fmt2(v_preco_base * v_fpi), v_pi.unidade);
          v_custo := v_preco_base;
        end if;
      end if;
      if v_qbase = 0 then continue; end if;
      update public.pedido_itens set qtd_recebida_base = qtd_recebida_base + v_qbase where id = v_pi.id;
    else
      if v_qbase = 0 then continue; end if;
      if v_pedido is not null then
        v_det := v_det || format('%s: item FORA do pedido (%s %s)', v_prod.descricao, public._fmt((it->>'quantidade')::numeric),
          public._un(it->>'unidade', (it->>'quantidade')::numeric));
      end if;
      if coalesce(it->>'preco_nota', it->>'custo_unitario') is not null then
        v_custo := coalesce(it->>'preco_nota', it->>'custo_unitario')::numeric / v_fator;
      end if;
    end if;
    perform public._movimentar(v_prod.id, 'entrada', v_qbase, v_custo,
      jsonb_build_object('recebimento_id', v_rec, 'pedido_item_id', (it->>'pedido_item_id')::bigint,
                         'qtd_informada', (it->>'quantidade')::numeric, 'unidade_informada', it->>'unidade',
                         'observacao', it->>'observacao'));
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then raise exception 'Nenhuma quantidade recebida foi informada.'; end if;

  if v_pedido is null then
    -- sem pedido: sempre exige ressalva e ciência do comprador
    select array_agg(format('%s: %s %s', pr.descricao, public._fmt(m.qtd_informada), public._un(m.unidade_informada, m.qtd_informada)) order by m.id)
      into v_det from public.movimentos m join public.produtos pr on pr.id = m.produto_id where m.recebimento_id = v_rec;
    v_det := array['Recebido SEM PEDIDO de compra — ' || array_to_string(v_det, '; ')];
  end if;

  if v_pedido is not null then
    -- itens do pedido que nem vieram nesta entrega, quando o restante não virá mais
    if v_encerrar then
      for r in select pi.*, pr.descricao from public.pedido_itens pi join public.produtos pr on pr.id = pi.produto_id
                where pi.pedido_id = v_pedido and not (pi.id = any(v_ids))
                  and pi.qtd_recebida_base < pi.quantidade_base - 0.0001 loop
        v_det := v_det || format('%s: NÃO VEIO — faltam %s %s; o restante não virá', r.descricao,
          public._fmt((r.quantidade_base - r.qtd_recebida_base) / public._fator(r.produto_id, r.unidade)),
          public._un(r.unidade, (r.quantidade_base - r.qtd_recebida_base) / public._fator(r.produto_id, r.unidade)));
      end loop;
    end if;
    if v_encerrar and exists (select 1 from public.pedido_itens where pedido_id = v_pedido
                              and qtd_recebida_base < quantidade_base - 0.0001) then
      update public.pedidos set status = 'encerrado',
             motivo_cancelamento = 'Encerrado no recebimento: entrega menor que o pedido (o restante não virá).'
       where id = v_pedido;
    else
      perform public._atualizar_status_pedido(v_pedido);
    end if;
  end if;

  if coalesce(array_length(v_det, 1), 0) > 0 then
    if public._texto(p,'observacao') is null then
      raise exception 'Recebimento com divergência: escreva a ressalva (o que aconteceu e com quem foi combinado).';
    end if;
    update public.recebimentos set divergencia = true, divergencia_detalhe = array_to_string(v_det, E'\n') where id = v_rec;
  end if;
  return v_rec;
end $$;

-- Comprador confirma que está ciente de um recebimento com divergência
create or replace function public.dar_ciencia_divergencia(p_recebimento bigint, p_obs text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.recebimentos;
begin
  perform public._exigir('pedido');
  select * into r from public.recebimentos where id = p_recebimento for update;
  if not found then raise exception 'Recebimento não encontrado.'; end if;
  if not r.divergencia then raise exception 'Este recebimento não tem divergência.'; end if;
  if r.ciente_por is not null then raise exception 'A ciência deste recebimento já foi registrada.'; end if;
  update public.recebimentos set ciente_por = auth.uid(), ciente_em = now(), ciente_obs = nullif(btrim(p_obs), '')
   where id = p_recebimento;
end $$;

-- =====================================================================
-- SAÍDAS
-- =====================================================================
-- Saída por ficha técnica (receita inteira x multiplicador, ou receita alterada)
create or replace function public.registrar_producao(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_prod bigint; v_mult numeric := (p->>'multiplicador')::numeric;
        v_alt boolean := coalesce((p->>'alterada')::boolean, false); it record; itj jsonb; v_q numeric;
        v_itens jsonb := p->'itens'; v_ficha bigint := (p->>'ficha_id')::bigint;
        v_progid bigint := (p->>'programacao_id')::bigint; v_prog public.programacoes;
begin
  perform public._exigir('saida_receita');
  if coalesce(v_mult, 0) <= 0 then raise exception 'Informe quantas receitas foram feitas.'; end if;
  -- baixa de uma programação: a receita é a programada (e a alteração programada, se houver)
  if v_progid is not null then
    select * into v_prog from public.programacoes where id = v_progid for update;
    if not found or v_prog.situacao <> 'ativa' then raise exception 'Programação não encontrada ou cancelada.'; end if;
    if v_prog.finalizada_em is not null then raise exception 'Esta programação já foi finalizada pela engenharia; lance como saída fora da programação.'; end if;
    if v_ficha is null then v_ficha := v_prog.ficha_id; end if;
    if v_ficha <> v_prog.ficha_id then raise exception 'A receita não confere com a programação.'; end if;
    if not v_alt and v_prog.itens_alterados is not null then v_alt := true; v_itens := v_prog.itens_alterados; end if;
  end if;
  if not exists (select 1 from public.fichas_tecnicas where id = v_ficha and ativo) then
    raise exception 'Ficha técnica não encontrada ou inativa.';
  end if;
  insert into public.producoes (ficha_id, multiplicador, alterada, observacao, programacao_id, usuario_id)
  values (v_ficha, v_mult, v_alt, public._texto(p,'observacao'), v_progid, auth.uid())
  returning id into v_prod;

  if not v_alt then
    for it in select fi.produto_id, fi.quantidade from public.ficha_itens fi
               where fi.ficha_id = v_ficha loop
      perform public._movimentar(it.produto_id, 'saida_receita', -(it.quantidade * v_mult), null,
        jsonb_build_object('producao_id', v_prod));
    end loop;
  else
    if jsonb_array_length(coalesce(v_itens,'[]'::jsonb)) = 0 then
      raise exception 'A receita alterada precisa de pelo menos 1 ingrediente.';
    end if;
    -- itens = quantidade POR RECEITA (já com a alteração), vezes o multiplicador
    for itj in select * from jsonb_array_elements(v_itens) loop
      if not exists (select 1 from public.produtos where id = (itj->>'produto_id')::bigint
                     and categoria = 'materia_prima') then
        raise exception 'Saída por receita só aceita matéria-prima.';
      end if;
      v_q := coalesce((itj->>'quantidade')::numeric, 0)
             * public._fator((itj->>'produto_id')::bigint, itj->>'unidade') * v_mult;
      if v_q > 0 then
        perform public._movimentar((itj->>'produto_id')::bigint, 'saida_receita', -v_q, null,
          jsonb_build_object('producao_id', v_prod));
      end if;
    end loop;
  end if;
  return v_prod;
end $$;

-- ---------------------------------------------------------------------
-- PROGRAMAÇÃO DE PRODUÇÃO (engenharia)
-- p: {id?, data, ficha_id, quantidade, itens?:[{produto_id, quantidade, unidade}], observacao}
-- ---------------------------------------------------------------------
create or replace function public.salvar_programacao(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := (p->>'id')::bigint; v_old public.programacoes; v_feito numeric := 0;
        v_qtd numeric := (p->>'quantidade')::numeric; v_data date := (p->>'data')::date;
        v_ficha bigint := (p->>'ficha_id')::bigint; v_itens jsonb := null; itj jsonb;
begin
  perform public._exigir('programacao');
  if v_data is null then raise exception 'Informe o dia da produção.'; end if;
  if coalesce(v_qtd, 0) <= 0 then raise exception 'Informe quantas receitas programar.'; end if;
  if not exists (select 1 from public.fichas_tecnicas where id = v_ficha and ativo) then
    raise exception 'Receita não encontrada ou inativa.';
  end if;
  if jsonb_array_length(coalesce(p->'itens','[]'::jsonb)) > 0 then
    v_itens := '[]'::jsonb;
    for itj in select * from jsonb_array_elements(p->'itens') loop
      if coalesce((itj->>'quantidade')::numeric, 0) <= 0 then continue; end if;
      if not exists (select 1 from public.produtos where id = (itj->>'produto_id')::bigint and categoria = 'materia_prima') then
        raise exception 'A receita só aceita matéria-prima.';
      end if;
      perform public._fator((itj->>'produto_id')::bigint, itj->>'unidade');   -- confere a unidade
      v_itens := v_itens || jsonb_build_array(jsonb_build_object('produto_id', (itj->>'produto_id')::bigint,
        'quantidade', (itj->>'quantidade')::numeric, 'unidade', itj->>'unidade'));
    end loop;
    if jsonb_array_length(v_itens) = 0 then raise exception 'A receita alterada precisa de pelo menos 1 ingrediente.'; end if;
  end if;

  if v_id is null then
    insert into public.programacoes (data, ficha_id, quantidade, itens_alterados, observacao, criado_por, atualizado_em, atualizado_por)
    values (v_data, v_ficha, v_qtd, v_itens, public._texto(p,'observacao'), auth.uid(), now(), auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  select * into v_old from public.programacoes where id = v_id for update;
  if not found then raise exception 'Programação não encontrada.'; end if;
  if v_old.situacao <> 'ativa' then raise exception 'Esta programação foi cancelada.'; end if;
  if v_old.finalizada_em is not null then raise exception 'Esta programação já foi finalizada.'; end if;
  select coalesce(sum(multiplicador), 0) into v_feito from public.producoes where programacao_id = v_id;
  if v_feito > 0 and (v_data <> v_old.data or v_ficha <> v_old.ficha_id) then
    raise exception 'Já houve baixa nesta programação: o dia e a receita não podem mudar. Programe o restante em outro dia.';
  end if;
  if v_qtd < v_feito then
    raise exception 'Já foram feitas % receitas desta programação; a quantidade não pode ficar menor.', public._fmt(v_feito);
  end if;
  update public.programacoes set data = v_data, ficha_id = v_ficha, quantidade = v_qtd, itens_alterados = v_itens,
    observacao = public._texto(p,'observacao'), atualizado_em = now(), atualizado_por = auth.uid()
  where id = v_id;
  return v_id;
end $$;

create or replace function public.cancelar_programacao(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._exigir('programacao');
  if nullif(btrim(coalesce(p_motivo,'')), '') is null then raise exception 'Informe o motivo do cancelamento.'; end if;
  update public.programacoes set situacao = 'cancelada', cancelado_motivo = btrim(p_motivo),
    atualizado_em = now(), atualizado_por = auth.uid()
  where id = p_id and situacao = 'ativa' and finalizada_em is null;
  if not found then raise exception 'Programação não encontrada, já cancelada ou já finalizada.'; end if;
end $$;

-- ---------------------------------------------------------------------
-- FINANCEIRO
-- ---------------------------------------------------------------------
-- Marca se o pedido já foi lançado no contas a pagar (ou volta para pendente)
create or replace function public.financeiro_marcar(p_pedido bigint, p_lancado boolean, p_obs text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._exigir('financeiro');
  update public.pedidos set fin_lancado = coalesce(p_lancado, false),
    fin_lancado_em = case when coalesce(p_lancado, false) then now() else null end,
    fin_lancado_por = case when coalesce(p_lancado, false) then auth.uid() else null end,
    fin_obs = coalesce(nullif(btrim(coalesce(p_obs,'')), ''), fin_obs),
    atualizado_em = now(), atualizado_por = auth.uid()
  where id = p_pedido;
  if not found then raise exception 'Pedido não encontrado.'; end if;
end $$;

-- Comprador ou financeiro ajusta a previsão de pagamento (com motivo; fica na auditoria)
create or replace function public.ajustar_previsao_pagamento(p_pedido bigint, p_data date, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.pedidos;
begin
  perform public._exigir('data_pagamento');
  if p_data is null then raise exception 'Informe a nova data de pagamento.'; end if;
  if nullif(btrim(coalesce(p_motivo,'')), '') is null then raise exception 'Informe o motivo da mudança da data.'; end if;
  select * into v from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if p_data < v.data_pedido then raise exception 'A previsão de pagamento não pode ser antes da data do pedido.'; end if;
  update public.pedidos set previsao_pagamento = p_data,
    fin_obs = left(concat_ws(' | ', fin_obs, to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || ' data '
      || coalesce(to_char(v.previsao_pagamento, 'DD/MM/YYYY'), '—') || ' → ' || to_char(p_data, 'DD/MM/YYYY') || ': ' || btrim(p_motivo)), 2000),
    atualizado_em = now(), atualizado_por = auth.uid()
  where id = p_pedido;
end $$;

-- Engenharia confere com a pesagem e finaliza a produção programada
create or replace function public.finalizar_programacao(p_id bigint, p_obs text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.programacoes; v_feito numeric;
begin
  perform public._exigir('programacao');
  select * into v from public.programacoes where id = p_id for update;
  if not found or v.situacao <> 'ativa' then raise exception 'Programação não encontrada ou cancelada.'; end if;
  if v.finalizada_em is not null then raise exception 'Esta programação já foi finalizada.'; end if;
  select coalesce(sum(multiplicador), 0) into v_feito from public.producoes where programacao_id = p_id;
  if v_feito < v.quantidade - 0.0005 and nullif(btrim(coalesce(p_obs,'')), '') is null then
    raise exception 'Foram feitas % de % receitas: explique a diferença na observação.', public._fmt(v_feito), public._fmt(v.quantidade);
  end if;
  update public.programacoes set finalizada_em = now(), finalizada_por = auth.uid(),
    finalizada_obs = nullif(btrim(coalesce(p_obs,'')), ''), atualizado_em = now(), atualizado_por = auth.uid()
  where id = p_id;
end $$;

-- Registro de acesso (entrada, saída, "ver como", troca de senha)
create or replace function public.registrar_acesso(p_evento text, p_detalhe text, p_agente text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sem sessão.'; end if;
  if p_evento not in ('entrada','saida','ver_como','senha_trocada') then raise exception 'Evento inválido.'; end if;
  if p_evento = 'ver_como' and not ('admin' = any(public.meus_papeis())) then raise exception 'Só o administrador usa "ver como".'; end if;
  insert into public.acessos (usuario_id, evento, detalhe, agente)
  values (auth.uid(), p_evento, left(p_detalhe, 300), left(p_agente, 300));
end $$;

-- Saída avulsa de matéria-prima (pesagem, observação obrigatória)
-- ou saída do almoxarifado (embalagens, escritório, limpeza...)
create or replace function public.registrar_saida(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_tipo text := p->>'tipo'; itj jsonb; v_q numeric; v_n int := 0; v_cat text;
begin
  if v_tipo not in ('saida_avulsa','saida_almox') then raise exception 'Tipo de saída inválido.'; end if;
  perform public._exigir(v_tipo);
  if v_tipo = 'saida_avulsa' and public._texto(p,'observacao') is null then
    raise exception 'Na saída avulsa a observação (justificativa) é obrigatória.';
  end if;
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    select categoria into v_cat from public.produtos where id = (itj->>'produto_id')::bigint;
    if v_tipo = 'saida_avulsa' and v_cat <> 'materia_prima' then
      raise exception 'Saída avulsa da pesagem só aceita matéria-prima.';
    end if;
    v_q := coalesce((itj->>'quantidade')::numeric, 0) * public._fator((itj->>'produto_id')::bigint, itj->>'unidade');
    if v_q < 0 then raise exception 'Quantidade não pode ser negativa.'; end if;
    if v_q = 0 then continue; end if;
    perform public._movimentar((itj->>'produto_id')::bigint, v_tipo, -v_q, null,
      jsonb_build_object('qtd_informada', (itj->>'quantidade')::numeric, 'unidade_informada', itj->>'unidade',
                         'observacao', coalesce(public._texto(itj,'observacao'), public._texto(p,'observacao')),
                         'destino', public._texto(p,'destino'), 'motivo', public._texto(p,'motivo')));
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhuma quantidade informada.'; end if;
  return v_n;
end $$;

-- =====================================================================
-- INVENTÁRIO (contagem física -> ajuste das diferenças)
-- =====================================================================
create or replace function public.registrar_inventario(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_inv bigint; itj jsonb; v public.produtos; v_cont numeric; v_dif numeric; v_n int := 0;
begin
  perform public._exigir('inventario');
  insert into public.inventarios (observacao, usuario_id)
  values (public._texto(p,'observacao'), auth.uid()) returning id into v_inv;

  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    if (itj->>'contado') is null then continue; end if;
    select * into v from public.produtos where id = (itj->>'produto_id')::bigint for update;
    if not found then raise exception 'Produto não encontrado.'; end if;
    v_cont := (itj->>'contado')::numeric * public._fator(v.id, itj->>'unidade');
    if v_cont < 0 then raise exception 'Quantidade contada não pode ser negativa (%).', v.codigo; end if;
    v_dif := round(v_cont - v.saldo, 4);
    if v_dif <> 0 and public._texto(itj,'motivo') is null then
      raise exception 'Informe o motivo da diferença do item % (%).', v.codigo, v.descricao;
    end if;
    if public._texto(itj,'motivo') = 'outros' and public._texto(itj,'observacao') is null then
      raise exception 'Motivo "outros": escreva a observação do item % (%).', v.codigo, v.descricao;
    end if;
    insert into public.inventario_itens (inventario_id, produto_id, saldo_sistema, contado, diferenca, motivo, observacao)
    values (v_inv, v.id, v.saldo, v_cont, v_dif,
            case when v_dif <> 0 then public._texto(itj,'motivo') end, public._texto(itj,'observacao'));
    if v_dif <> 0 then
      perform public._movimentar(v.id, 'inventario', v_dif, null,
        jsonb_build_object('inventario_id', v_inv, 'motivo', public._texto(itj,'motivo'),
                           'observacao', public._texto(itj,'observacao'),
                           'qtd_informada', (itj->>'contado')::numeric, 'unidade_informada', itj->>'unidade'));
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhum item contado.'; end if;
  return v_inv;
end $$;

-- =====================================================================
-- CORREÇÃO DE LANÇAMENTO (o original fica, e entra uma linha de correção)
-- =====================================================================
create or replace function public.corrigir_movimento(p_id bigint, p_quantidade_correta numeric,
                                                     p_unidade text, p_motivo text)
returns bigint language plpgsql security definer set search_path = public as $$
declare o public.movimentos; v_prod public.produtos; v_efetiva numeric; v_nova numeric; v_delta numeric;
        v_custo numeric; v_novo bigint; v_proprio boolean;
begin
  if not public.usuario_ativo() then raise exception 'Usuário inativo.' using errcode = '42501'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Informe o motivo da correção.'; end if;
  select * into o from public.movimentos where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if o.tipo = 'correcao' then raise exception 'Corrija o lançamento original, não a correção.'; end if;

  v_proprio := o.usuario_id = auth.uid()
               and (o.data_hora at time zone 'America/Sao_Paulo')::date = public._hoje()
               and o.tipo in ('entrada','saida_receita','saida_avulsa','saida_almox');
  if o.tipo in ('implantacao','inventario') then
    if not ('admin' = any(public.meus_papeis())) then
      raise exception 'Só o administrador corrige implantação de saldo e inventário.' using errcode = '42501';
    end if;
  elsif not (public.pode('corrigir') or v_proprio) then
    raise exception 'Sem permissão: você só pode corrigir os seus próprios lançamentos do dia.' using errcode = '42501';
  end if;

  if p_quantidade_correta is null or p_quantidade_correta < 0 then
    raise exception 'Informe a quantidade correta (zero se o lançamento não deveria existir).';
  end if;
  select * into v_prod from public.produtos where id = o.produto_id;
  select o.quantidade + coalesce(sum(c.quantidade), 0) into v_efetiva
    from public.movimentos c where c.corrige_id = o.id;
  v_nova := sign(o.quantidade) * p_quantidade_correta * public._fator(o.produto_id, p_unidade);
  v_delta := round(v_nova - v_efetiva, 4);
  if v_delta = 0 then raise exception 'A quantidade informada é igual à atual; nada a corrigir.'; end if;

  v_custo := case when o.quantidade > 0 then o.custo_unitario end;
  v_novo := public._movimentar(o.produto_id, 'correcao', v_delta, v_custo,
    jsonb_build_object('corrige_id', o.id, 'motivo', btrim(p_motivo),
      'observacao', format('Corrige lançamento #%s: de %s para %s %s', o.id,
                           public._fmt(abs(v_efetiva)), public._fmt(abs(v_nova)), public._un(v_prod.unidade_estoque, abs(v_nova)))));

  if o.pedido_item_id is not null then
    update public.pedido_itens set qtd_recebida_base = greatest(qtd_recebida_base + v_delta, 0)
     where id = o.pedido_item_id;
    perform public._atualizar_status_pedido((select pedido_id from public.pedido_itens where id = o.pedido_item_id));
  end if;
  return v_novo;
end $$;

-- =====================================================================
-- IMPLANTAÇÃO DE SALDO (início do sistema) — só administrador
-- =====================================================================
create or replace function public.implantar_saldo(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare itj jsonb; v_f numeric; v_q numeric; v_n int := 0;
begin
  perform public._exigir('implantacao');
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    v_f := public._fator((itj->>'produto_id')::bigint, itj->>'unidade');
    v_q := coalesce((itj->>'quantidade')::numeric, 0) * v_f;
    if v_q < 0 then raise exception 'Quantidade não pode ser negativa.'; end if;
    if v_q = 0 then continue; end if;
    perform public._movimentar((itj->>'produto_id')::bigint, 'implantacao', v_q,
      coalesce((itj->>'custo_unitario')::numeric, 0) / v_f,
      jsonb_build_object('observacao', coalesce(public._texto(p,'observacao'), 'Implantação de saldo'),
                         'qtd_informada', (itj->>'quantidade')::numeric, 'unidade_informada', itj->>'unidade'));
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhuma quantidade informada.'; end if;
  return v_n;
end $$;

-- =====================================================================
-- USUÁRIOS E PARÂMETROS — só administrador
-- =====================================================================
create or replace function public.salvar_perfil(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (p->>'user_id')::uuid;
begin
  perform public._exigir('usuarios');
  if v_uid = auth.uid() and (coalesce((p->>'ativo')::boolean, true) = false
     or not coalesce(p->'papeis', '[]'::jsonb) ? 'admin') then
    raise exception 'Você não pode desativar nem tirar o papel de administrador de si mesmo.';
  end if;
  update public.perfis set nome = coalesce(public._texto(p,'nome'), nome), funcao = public._texto(p,'funcao'),
         papeis = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'papeis') x), '{}'),
         ativo = coalesce((p->>'ativo')::boolean, false)
   where user_id = v_uid;
  if not found then raise exception 'Usuário não encontrado.'; end if;
end $$;

create or replace function public.salvar_parametros(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare k text; v text;
begin
  perform public._exigir('parametros');
  for k, v in select * from jsonb_each_text(p) loop
    if k = 'empresa_cnpj' then   -- guarda sem pontuação; aceita CNPJ (ou CPF)
      v := coalesce(public._doc_limpo(v), '');
      if v <> '' and not (public._cnpj_valido(v) or public._cpf_valido(v)) then
        raise exception 'CNPJ da empresa inválido: %. Confira os números digitados.', public._doc_formatado(v);
      end if;
    end if;
    update public.parametros set valor = v where chave = k;
  end loop;
end $$;

-- =====================================================================
-- IMPORTAÇÃO EM MASSA (planilha) — somente administrador
-- p = { fornecedores:[{linha,...}], produtos:[{linha,..., fornecedor}], receitas:[{linha, codigo, nome, ...,
--       itens:[{linha, codigo_produto, quantidade, unidade}]}], saldos:[{linha, codigo_produto, quantidade, unidade, custo_unitario}] }
-- Tudo ou nada: se uma linha tiver erro, nada é gravado e a mensagem diz a aba e a linha.
-- =====================================================================
create or replace function public.importar_cadastros(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; ing jsonb; v_id bigint; v_forn bigint; v_prod bigint; v_itens jsonb; v_linha text;
        r jsonb := '{"fornecedores_novos":0,"fornecedores_atualizados":0,"produtos_novos":0,"produtos_atualizados":0,
                     "receitas_novas":0,"receitas_atualizadas":0,"saldos_implantados":0}'::jsonb;
  procedure_conta text;
begin
  perform public._exigir('importacao');

  for it in select * from jsonb_array_elements(coalesce(p->'fornecedores','[]'::jsonb)) loop
    v_linha := it->>'linha';
    begin
      select id into v_id from public.fornecedores
       where (public._doc_limpo(it->>'cnpj') is not null and public._doc_limpo(cnpj) = public._doc_limpo(it->>'cnpj'))
          or lower(nome) = lower(btrim(it->>'nome')) order by id limit 1;
      perform public.salvar_fornecedor(it || jsonb_build_object('id', v_id));
      procedure_conta := case when v_id is null then 'fornecedores_novos' else 'fornecedores_atualizados' end;
      r := jsonb_set(r, array[procedure_conta], to_jsonb((r->>procedure_conta)::int + 1));
    exception when others then
      raise exception 'Aba Fornecedores, linha %: %', v_linha, sqlerrm;
    end;
  end loop;

  for it in select * from jsonb_array_elements(coalesce(p->'produtos','[]'::jsonb)) loop
    v_linha := it->>'linha';
    begin
      v_forn := null;
      if public._texto(it,'fornecedor') is not null then
        select id into v_forn from public.fornecedores where lower(nome) = lower(btrim(it->>'fornecedor')) limit 1;
        if v_forn is null then raise exception 'fornecedor "%" não está cadastrado.', it->>'fornecedor'; end if;
      end if;
      select id into v_id from public.produtos where lower(codigo) = lower(btrim(it->>'codigo'));
      perform public.salvar_produto(it || jsonb_build_object('id', v_id, 'fornecedor_padrao_id', v_forn));
      procedure_conta := case when v_id is null then 'produtos_novos' else 'produtos_atualizados' end;
      r := jsonb_set(r, array[procedure_conta], to_jsonb((r->>procedure_conta)::int + 1));
    exception when others then
      raise exception 'Aba Produtos, linha %: %', v_linha, sqlerrm;
    end;
  end loop;

  for it in select * from jsonb_array_elements(coalesce(p->'receitas','[]'::jsonb)) loop
    v_linha := it->>'linha';
    begin
      v_itens := '[]'::jsonb;
      for ing in select * from jsonb_array_elements(coalesce(it->'itens','[]'::jsonb)) loop
        v_linha := ing->>'linha';
        select id into v_prod from public.produtos where lower(codigo) = lower(btrim(ing->>'codigo_produto'));
        if v_prod is null then raise exception 'ingrediente com código "%" não está cadastrado.', ing->>'codigo_produto'; end if;
        v_itens := v_itens || jsonb_build_object('produto_id', v_prod, 'quantidade', ing->'quantidade', 'unidade', ing->>'unidade');
      end loop;
      v_linha := it->>'linha';
      select id into v_id from public.fichas_tecnicas where lower(codigo) = lower(btrim(it->>'codigo'));
      perform public.salvar_ficha((it - 'itens') || jsonb_build_object('id', v_id, 'itens', v_itens));
      procedure_conta := case when v_id is null then 'receitas_novas' else 'receitas_atualizadas' end;
      r := jsonb_set(r, array[procedure_conta], to_jsonb((r->>procedure_conta)::int + 1));
    exception when others then
      raise exception 'Aba Receitas, linha %: %', v_linha, sqlerrm;
    end;
  end loop;

  for it in select * from jsonb_array_elements(coalesce(p->'saldos','[]'::jsonb)) loop
    v_linha := it->>'linha';
    begin
      select id into v_prod from public.produtos where lower(codigo) = lower(btrim(it->>'codigo_produto'));
      if v_prod is null then raise exception 'produto com código "%" não está cadastrado.', it->>'codigo_produto'; end if;
      perform public.implantar_saldo(jsonb_build_object('observacao', 'Implantação de saldo (planilha)',
        'itens', jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', it->'quantidade',
                                                      'unidade', it->>'unidade', 'custo_unitario', it->'custo_unitario'))));
      r := jsonb_set(r, '{saldos_implantados}', to_jsonb((r->>'saldos_implantados')::int + 1));
    exception when others then
      raise exception 'Aba Saldo inicial, linha %: %', v_linha, sqlerrm;
    end;
  end loop;
  return r;
end $$;

-- =====================================================================
-- ESTATÍSTICAS para relatórios (consumo médio, desvio, prazo de entrega)
-- =====================================================================
create or replace function public.estatisticas_estoque(p_janela integer default 90)
returns table (produto_id bigint, dias_historico integer, consumo_total numeric,
               media_dia numeric, desvio_dia numeric, a_receber numeric,
               lt_medio numeric, lt_desvio numeric, lt_qtd integer, ultima_saida timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_ini date; v_fim date := public._hoje() - 1; v_dias int;
begin
  if not public.usuario_ativo() then raise exception 'Usuário inativo.' using errcode = '42501'; end if;
  if not public.acesso_amplo() then return; end if;   -- financeiro/faturamento não veem estoque
  select coalesce(min((data_hora at time zone 'America/Sao_Paulo')::date), public._hoje())
    into v_ini from public.movimentos;
  v_ini := greatest(v_ini, public._hoje() - p_janela);
  v_dias := greatest(v_fim - v_ini + 1, 0);

  return query
  with consumo as (   -- consumo por produto e dia (saídas + correções das saídas)
    select m.produto_id,
           (coalesce(o.data_hora, m.data_hora) at time zone 'America/Sao_Paulo')::date as dia,
           -m.quantidade as q
      from public.movimentos m
      left join public.movimentos o on o.id = m.corrige_id
     where (m.tipo in ('saida_receita','saida_avulsa','saida_almox')
            or (m.tipo = 'correcao' and o.tipo in ('saida_receita','saida_avulsa','saida_almox')))
  ),
  dias as (select generate_series(v_ini, v_fim, interval '1 day')::date as dia where v_dias > 0),
  serie as (
    select p.id as produto_id, d.dia, coalesce(sum(c.q), 0) as q
      from public.produtos p cross join dias d
      left join consumo c on c.produto_id = p.id and c.dia = d.dia
     group by p.id, d.dia
  ),
  est as (
    select s.produto_id, sum(s.q) as total, avg(s.q) as media,
           coalesce(stddev_samp(s.q), 0) as desvio
      from serie s group by s.produto_id
  ),
  receber as (
    select pi.produto_id, sum(greatest(pi.quantidade_base - pi.qtd_recebida_base, 0)) as q
      from public.pedido_itens pi join public.pedidos pe on pe.id = pi.pedido_id
     where pe.status in ('aberto','parcial') group by pi.produto_id
  ),
  lt as (
    select pi.produto_id,
           (min(m.data_hora at time zone 'America/Sao_Paulo')::date - pe.data_pedido) as dias
      from public.pedido_itens pi
      join public.pedidos pe on pe.id = pi.pedido_id
      join public.movimentos m on m.pedido_item_id = pi.id and m.tipo = 'entrada'
     where pe.data_pedido >= public._hoje() - 365
     group by pi.id, pi.produto_id, pe.data_pedido
  ),
  ltp as (
    select l.produto_id, avg(l.dias) as media, coalesce(stddev_samp(l.dias), 0) as desvio, count(*) as n
      from lt l group by l.produto_id
  ),
  ult as (
    select m.produto_id, max(m.data_hora) as d from public.movimentos m
     where m.tipo in ('saida_receita','saida_avulsa','saida_almox') group by m.produto_id
  )
  select p.id, v_dias, coalesce(e.total, 0), coalesce(e.media, 0), coalesce(e.desvio, 0),
         coalesce(r.q, 0), l.media, l.desvio, coalesce(l.n, 0)::int, u.d
    from public.produtos p
    left join est e on e.produto_id = p.id
    left join receber r on r.produto_id = p.id
    left join ltp l on l.produto_id = p.id
    left join ult u on u.produto_id = p.id;
end $$;

-- ---------------------------------------------------------------------
-- PREVISÃO DE PRODUÇÃO: receitas programadas × rendimento, por dia e produto.
-- Entrega só números agregados (sem ingredientes), por isso o financeiro e o
-- faturamento podem ver sem ter acesso às fichas técnicas.
-- ---------------------------------------------------------------------
create or replace function public.previsao_producao(p_de date, p_ate date)
returns table (data date, ficha_id bigint, codigo text, nome text, produto_final text,
               receitas numeric, receitas_pesadas numeric, rendimento_qtd numeric, rendimento_unidade text,
               previsto numeric, finalizada boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir('previsao_producao');
  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'Período inválido.'; end if;
  if p_ate - p_de > 400 then raise exception 'Período máximo: 400 dias.'; end if;
  return query
  select pg.data, f.id, f.codigo, f.nome, f.produto_final,
         sum(pg.quantidade)::numeric,
         coalesce(sum((select sum(pr.multiplicador) from public.producoes pr where pr.programacao_id = pg.id)), 0)::numeric,
         f.rendimento_qtd, f.rendimento_unidade,
         case when f.rendimento_qtd is null then null else round(sum(pg.quantidade) * f.rendimento_qtd, 3) end,
         bool_and(pg.finalizada_em is not null)
    from public.programacoes pg join public.fichas_tecnicas f on f.id = pg.ficha_id
   where pg.situacao = 'ativa' and pg.data between p_de and p_ate
   group by pg.data, f.id
   order by pg.data, f.nome;
end $$;

-- ---------------------------------------------------------------------
-- GESTÃO DE CUSTOS (só administrador/controladoria): último custo de entrada
-- de cada produto, na unidade de estoque, com a data, o fornecedor e o pedido.
-- (o custo médio ponderado já está em produtos.custo_medio, mantido por _movimentar)
-- ---------------------------------------------------------------------
create or replace function public.custos_produtos()
returns table (produto_id bigint, ultimo_custo numeric, ultima_data timestamptz, ultimo_tipo text,
               ultima_qtd numeric, fornecedor_id bigint, pedido_id bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir('custos');
  return query
  select distinct on (m.produto_id) m.produto_id, m.custo_unitario::numeric, m.data_hora, m.tipo, m.quantidade::numeric,
         coalesce(r.fornecedor_id, pe.fornecedor_id), pi.pedido_id
    from public.movimentos m
    left join public.recebimentos r on r.id = m.recebimento_id
    left join public.pedido_itens pi on pi.id = m.pedido_item_id
    left join public.pedidos pe on pe.id = pi.pedido_id
   where m.tipo in ('entrada','implantacao') and m.custo_unitario > 0 and m.quantidade > 0
   order by m.produto_id, m.data_hora desc, m.id desc;
end $$;

-- =====================================================================
-- Quem pode executar o quê
-- =====================================================================
-- tira de todos (inclusive do usuário logado) e libera só o necessário
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.meus_papeis(), public.usuario_ativo(), public.pode(text) to authenticated;
grant execute on function
  public.salvar_produto(jsonb), public.salvar_fornecedor(jsonb), public.salvar_ficha(jsonb),
  public.salvar_pedido(jsonb), public.cancelar_pedido(bigint, text),
  public.registrar_recebimento(jsonb), public.dar_ciencia_divergencia(bigint, text), public.registrar_producao(jsonb), public.registrar_saida(jsonb),
  public.registrar_inventario(jsonb), public.corrigir_movimento(bigint, numeric, text, text),
  public.implantar_saldo(jsonb), public.salvar_perfil(jsonb), public.salvar_parametros(jsonb),
  public.estatisticas_estoque(integer), public.importar_cadastros(jsonb),
  public.salvar_programacao(jsonb), public.cancelar_programacao(bigint, text),
  public.finalizar_programacao(bigint, text), public.registrar_acesso(text, text, text),
  public.financeiro_marcar(bigint, boolean, text), public.ajustar_previsao_pagamento(bigint, date, text),
  public.previsao_producao(date, date), public.acesso_amplo(), public.custos_produtos()
to authenticated;
-- funções internas (_movimentar, _fator, etc.) NÃO ficam liberadas para o app
revoke execute on function public._movimentar(bigint, text, numeric, numeric, jsonb) from authenticated;
revoke execute on function public._atualizar_status_pedido(bigint) from authenticated;

-- ===================== incorporado da atualização 001 =====================
-- =====================================================================
-- 001 · CONTAGEM INICIAL (versão 1.3.0)
-- O almoxarifado conta e digita as quantidades (pode salvar aos poucos e
-- corrigir enquanto não for implantado). O administrador confere, informa
-- o custo unitário e implanta o saldo (Configurações › Implantação de saldo).
-- Só acrescenta; pode rodar duas vezes sem estragar.
-- =====================================================================

create table if not exists public.contagem_inicial (
  id                bigint generated always as identity primary key,
  produto_id        bigint not null references public.produtos(id),
  quantidade        numeric(14,4) not null check (quantidade >= 0),   -- na unidade de estoque
  qtd_informada     numeric(14,4) not null,
  unidade_informada text not null,
  observacao        text,
  situacao          text not null default 'pendente' check (situacao in ('pendente','implantada')),
  contado_por       uuid references auth.users(id),
  contado_em        timestamptz not null default now(),
  implantado_por    uuid references auth.users(id),
  implantado_em     timestamptz
);
-- só uma contagem pendente por produto (corrigir = atualizar a mesma linha)
create unique index if not exists contagem_inicial_pendente on public.contagem_inicial (produto_id) where situacao = 'pendente';

-- segurança: só leitura para os papéis da operação; gravação só pelas funções abaixo
alter table public.contagem_inicial enable row level security;
alter table public.contagem_inicial force row level security;
revoke all on public.contagem_inicial from anon, authenticated;
grant select on public.contagem_inicial to authenticated;
drop policy if exists leitura on public.contagem_inicial;
create policy leitura on public.contagem_inicial for select to authenticated using (public.acesso_amplo());
drop trigger if exists sem_exclusao on public.contagem_inicial;
create trigger sem_exclusao before delete on public.contagem_inicial
  for each row execute function public.bloquear_exclusao();

-- permissão nova: quem pode digitar a contagem inicial
create or replace function public.pode(p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meus_papeis() && (case p_acao
    when 'cadastro_produto'    then array['admin','comprador']
    when 'cadastro_fornecedor' then array['admin','comprador']
    when 'ficha_tecnica'       then array['admin','engenharia']
    when 'pedido'              then array['admin','comprador']
    when 'recebimento'         then array['admin','almoxarifado','recebimento']
    when 'saida_receita'       then array['admin','pesagem','almoxarifado']
    when 'saida_avulsa'        then array['admin','pesagem','almoxarifado']
    when 'saida_almox'         then array['admin','almoxarifado','recebimento']
    when 'inventario'          then array['admin','almoxarifado','recebimento']
    when 'corrigir'            then array['admin','almoxarifado']
    when 'implantacao'         then array['admin']
    when 'contagem_inicial'    then array['admin','almoxarifado']
    when 'usuarios'            then array['admin']
    when 'parametros'          then array['admin']
    when 'auditoria'           then array['admin','diretoria']
    when 'importacao'          then array['admin']
    when 'programacao'         then array['admin','engenharia']
    when 'financeiro'          then array['admin','financeiro']
    when 'data_pagamento'      then array['admin','comprador','financeiro']
    when 'previsao_producao'   then array['admin','engenharia','diretoria','financeiro','faturamento']
    when 'custos'              then array['admin']
    else array[]::text[] end)::text[], false)
$$;

-- salvar a contagem (vários itens de uma vez; quantidade vazia = não mexe)
create or replace function public.salvar_contagem_inicial(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare itj jsonb; v_f numeric; v_q numeric; v_n int := 0; v_ant public.contagem_inicial;
begin
  perform public._exigir('contagem_inicial');
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    if (itj->>'quantidade') is null or btrim(itj->>'quantidade') = '' then continue; end if;
    if not exists (select 1 from public.produtos where id = (itj->>'produto_id')::bigint) then
      raise exception 'Produto não encontrado.'; end if;
    v_f := public._fator((itj->>'produto_id')::bigint, itj->>'unidade');
    v_q := (itj->>'quantidade')::numeric * v_f;
    if v_q < 0 then raise exception 'Quantidade não pode ser negativa.'; end if;
    select * into v_ant from public.contagem_inicial where produto_id = (itj->>'produto_id')::bigint and situacao = 'pendente';
    if found then
      update public.contagem_inicial set quantidade = v_q, qtd_informada = (itj->>'quantidade')::numeric,
        unidade_informada = itj->>'unidade', observacao = public._texto(itj,'observacao'),
        contado_por = auth.uid(), contado_em = now()
       where id = v_ant.id;
    else
      insert into public.contagem_inicial (produto_id, quantidade, qtd_informada, unidade_informada, observacao, contado_por)
      values ((itj->>'produto_id')::bigint, v_q, (itj->>'quantidade')::numeric, itj->>'unidade', public._texto(itj,'observacao'), auth.uid());
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhuma quantidade informada.'; end if;
  return v_n;
end $$;

-- implantar saldo: igual ao anterior e marca a contagem pendente como implantada
create or replace function public.implantar_saldo(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare itj jsonb; v_f numeric; v_q numeric; v_n int := 0;
begin
  perform public._exigir('implantacao');
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    v_f := public._fator((itj->>'produto_id')::bigint, itj->>'unidade');
    v_q := coalesce((itj->>'quantidade')::numeric, 0) * v_f;
    if v_q < 0 then raise exception 'Quantidade não pode ser negativa.'; end if;
    if v_q = 0 then continue; end if;
    perform public._movimentar((itj->>'produto_id')::bigint, 'implantacao', v_q,
      coalesce((itj->>'custo_unitario')::numeric, 0) / v_f,
      jsonb_build_object('observacao', coalesce(public._texto(p,'observacao'), 'Implantação de saldo'),
                         'qtd_informada', (itj->>'quantidade')::numeric, 'unidade_informada', itj->>'unidade'));
    update public.contagem_inicial set situacao = 'implantada', implantado_por = auth.uid(), implantado_em = now()
     where produto_id = (itj->>'produto_id')::bigint and situacao = 'pendente';
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhuma quantidade informada.'; end if;
  return v_n;
end $$;

revoke execute on function public.salvar_contagem_inicial(jsonb) from public, anon;
grant execute on function public.salvar_contagem_inicial(jsonb), public.implantar_saldo(jsonb), public.pode(text) to authenticated;

insert into public.versao_banco (versao, descricao) values ('1.3.0', 'Contagem inicial pelo almoxarifado (saldo inicial em duas etapas)')
on conflict (versao) do nothing;

insert into public.versao_banco (versao, descricao) values ('1.3.3', 'Fornecedor pessoa física/jurídica; CNPJ/CPF sem pontuação e com conferência dos dígitos')
on conflict (versao) do nothing;


-- =====================================================================
-- Sistema de Compras e Estoque PSS
-- Arquivo 04 de 04: PARÂMETROS INICIAIS e PRIMEIRO ADMINISTRADOR
-- =====================================================================

insert into public.parametros (chave, valor, descricao) values
 ('empresa_nome',          'Indústria e Comércio de Pães São Sebastião', 'Nome no cabeçalho do pedido de compra'),
 ('empresa_cnpj',          '',            'CNPJ no cabeçalho do pedido'),
 ('empresa_endereco',      'Franca/SP',   'Endereço no cabeçalho do pedido'),
 ('empresa_telefone',      '',            'Telefone no cabeçalho do pedido'),
 ('pedido_rodape',         'Favor informar o número do pedido na nota fiscal.', 'Texto no rodapé do pedido'),
 ('permitir_saldo_negativo','sim',        'sim = deixa dar saída mesmo sem saldo (fica alerta); nao = bloqueia'),
 ('janela_consumo_dias',   '90',          'Quantos dias para trás usar na média de consumo'),
 ('dias_minimos_calculo',  '30',          'Dias de uso necessários para mostrar o estoque mínimo calculado'),
 ('nivel_servico_z',       '1.65',        'Fator de segurança (1,65 = 95% de chance de não faltar)'),
 ('ciclo_compra_dias',     '30',          'Para quantos dias de consumo a sugestão de compra deve abastecer'),
 ('prazo_entrega_padrao',  '7',           'Prazo de entrega (dias) usado quando não há histórico nem cadastro'),
 ('usar_minimo',           'definido',    'Qual mínimo usar nos alertas: definido, calculado ou maior')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- PRIMEIRO ADMINISTRADOR
-- 1) Crie o seu login no painel: Authentication -> Users -> Add user -> Create new user
--    e-mail: ithalo@estoque.pss   senha: (a sua; NUNCA escreva em arquivo)   marque "Auto Confirm User"
-- 2) Depois rode só a linha abaixo:
-- update public.perfis set papeis = array['admin'], ativo = true, nome = 'Ithalo', funcao = 'Controladoria' where usuario = 'ithalo';
-- 3) Os outros usuários são criados DENTRO do sistema (Usuários e acessos -> Novo usuário).
-- ---------------------------------------------------------------------


-- =====================================================================
-- 003 · VERSÃO 2.0 — ESTOQUE POR LOCAL, TRANSFERÊNCIAS, REQUISIÇÃO,
--       NOVO FLUXO DA PRODUÇÃO (PESAGEM → MISTURA → MACEIRAS) E CUSTOS
-- Rodar UMA vez no Supabase (SQL Editor › New query › colar tudo › Run).
-- Só ACRESCENTA: nenhum cadastro, pedido ou movimento é apagado.
-- Pode rodar duas vezes sem estragar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PAPEL NOVO (padeiro), CATEGORIAS NOVAS E TIPOS DE MOVIMENTO NOVOS
-- ---------------------------------------------------------------------
alter table public.perfis drop constraint if exists perfis_papeis_check;
alter table public.perfis add constraint perfis_papeis_check check (papeis <@ array['admin','comprador','almoxarifado','recebimento',
  'pesagem','engenharia','diretoria','financeiro','faturamento','padeiro']::text[]);

alter table public.produtos drop constraint if exists produtos_categoria_check;
alter table public.produtos add constraint produtos_categoria_check check (categoria in
  ('materia_prima','embalagem','escritorio','limpeza','outros','intermediario','produto_acabado'));

alter table public.movimentos drop constraint if exists movimentos_tipo_check;
alter table public.movimentos add constraint movimentos_tipo_check check (tipo in ('implantacao','entrada','saida_receita',
  'saida_avulsa','saida_almox','inventario','correcao',
  'transferencia','consumo','entrada_producao','perda','entrada_manual'));

-- ---------------------------------------------------------------------
-- 2. UNIDADES E LOCAIS
-- ---------------------------------------------------------------------
create table if not exists public.unidades (
  id        bigint generated always as identity primary key,
  nome      text not null unique,                 -- ex.: Matriz
  cidade    text,
  ativa     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.locais (
  id         bigint generated always as identity primary key,
  unidade_id bigint not null references public.unidades(id),
  nome       text not null,                       -- ex.: Almoxarifado
  tipo       text not null default 'outro' check (tipo in ('almoxarifado','deposito','pesagem','maceiras','pcp','expedicao','outro')),
  papeis     text[] not null default '{}',        -- quem opera este local (separa, envia, recebe, baixa)
  ordem      integer not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  unique (unidade_id, nome)
);

-- saldo de cada produto em cada local
--   disponivel = livre para usar · separado = reservado para uma transferência (ainda no local)
--   qtd2 = segunda medida (ex.: nº de bobinas), quando o produto tem
create table if not exists public.estoque_local (
  produto_id     bigint not null references public.produtos(id),
  local_id       bigint not null references public.locais(id),
  disponivel     numeric(14,4) not null default 0,
  separado       numeric(14,4) not null default 0,
  qtd2_disponivel numeric(14,4) not null default 0,
  qtd2_separado   numeric(14,4) not null default 0,
  primary key (produto_id, local_id)
);

-- ---------------------------------------------------------------------
-- 3. PRODUTO: controle e forma de baixa, local padrão, 2ª medida, peso por embalagem
-- ---------------------------------------------------------------------
alter table public.produtos add column if not exists controla_estoque boolean not null default true;
alter table public.produtos add column if not exists baixa_producao   boolean not null default false;
alter table public.produtos add column if not exists baixa_requisicao boolean not null default true;
alter table public.produtos add column if not exists usado_na         text check (usado_na in ('pesagem','maceira'));
alter table public.produtos add column if not exists local_padrao_id  bigint references public.locais(id);
alter table public.produtos add column if not exists unidade2         text;          -- 2ª medida (ex.: bobina)
alter table public.produtos add column if not exists peso_embalagem_g numeric(12,4); -- embalagem controlada em kg
alter table public.produtos add column if not exists ficha_id         bigint;        -- mistura: de qual receita
alter table public.produtos drop constraint if exists produtos_baixa_check;
alter table public.produtos add constraint produtos_baixa_check
  check (not controla_estoque or baixa_producao or baixa_requisicao);

-- ---------------------------------------------------------------------
-- 4. PRODUÇÃO: linhas, maceiras, padeiros (operadores), receita
-- ---------------------------------------------------------------------
create table if not exists public.linhas_producao (
  id        bigint generated always as identity primary key,
  nome      text not null unique,                 -- pão de forma, hot dog, hambúrguer...
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.operadores (     -- padeiros (entram no tablet com nome + senha de 6 números)
  id        bigint generated always as identity primary key,
  nome      text not null,
  pin_sal   text,
  pin_hash  text,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.maceiras (
  id            bigint generated always as identity primary key,
  local_id      bigint not null references public.locais(id),
  nome          text not null,
  capacidade_kg numeric(10,2),
  linhas        bigint[] not null default '{}',     -- linhas que costuma bater
  operadores    bigint[] not null default '{}',     -- padeiros habituais (só orientação)
  tempo_min     integer,                            -- tempo próprio da maceira (opcional)
  ordem         integer not null default 0,
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now()
);

alter table public.fichas_tecnicas add column if not exists linha_id bigint references public.linhas_producao(id);
alter table public.fichas_tecnicas add column if not exists tempo_batelada_min integer check (tempo_batelada_min is null or tempo_batelada_min > 0);

alter table public.programacoes add column if not exists maceira_id  bigint references public.maceiras(id);
alter table public.programacoes add column if not exists operador_id bigint references public.operadores(id);
alter table public.programacoes add column if not exists prioridade  integer not null default 0;
alter table public.programacoes add column if not exists origem_id   bigint references public.programacoes(id);  -- dividida de outra

alter table public.producoes add column if not exists local_id bigint references public.locais(id);

-- ---------------------------------------------------------------------
-- 5. TRANSFERÊNCIAS E REQUISIÇÕES
-- ---------------------------------------------------------------------
create table if not exists public.requisicoes (
  id              bigint generated always as identity primary key,
  origem_id       bigint not null references public.locais(id),   -- quem atende (ex.: Almoxarifado)
  destino_id      bigint not null references public.locais(id),   -- quem pediu (ex.: PCP)
  situacao        text not null default 'pendente' check (situacao in ('pendente','parcial','atendida','encerrada','cancelada')),
  observacao      text,
  solicitante_id  uuid references auth.users(id) default auth.uid(),
  criado_em       timestamptz not null default now(),
  encerrada_em    timestamptz,
  encerrada_por   uuid references auth.users(id),
  encerrada_motivo text
);
create table if not exists public.requisicao_itens (
  id             bigint generated always as identity primary key,
  requisicao_id  bigint not null references public.requisicoes(id),
  produto_id     bigint not null references public.produtos(id),
  quantidade     numeric(14,4) not null check (quantidade > 0),   -- unidade de estoque
  qtd2           numeric(14,4),                                    -- se pediu em bobinas (informativo)
  atendido       numeric(14,4) not null default 0                  -- separado/enviado até agora
);
create index if not exists requisicao_itens_req_idx on public.requisicao_itens (requisicao_id);

create table if not exists public.anexos (
  id         bigint generated always as identity primary key,
  nome       text not null,
  tipo       text,
  conteudo   text not null,                           -- base64 (até ~3 MB)
  criado_por uuid references auth.users(id) default auth.uid(),
  criado_em  timestamptz not null default now()
);

create table if not exists public.transferencias (
  id               bigint generated always as identity primary key,
  origem_id        bigint not null references public.locais(id),
  destino_id       bigint not null references public.locais(id),
  situacao         text not null default 'separada' check (situacao in ('separada','enviada','recebida','cancelada')),
  requisicao_id    bigint references public.requisicoes(id),
  anterior_id      bigint references public.transferencias(id),    -- volta de diferença no recebimento
  observacao       text,
  anexo_id         bigint references public.anexos(id),
  separado_por     uuid references auth.users(id),
  separado_em      timestamptz not null default now(),
  enviado_por      uuid references auth.users(id),
  enviado_em       timestamptz,
  recebido_por     uuid references auth.users(id),
  recebido_em      timestamptz,
  recebido_obs     text,
  cancelado_por    uuid references auth.users(id),
  cancelado_em     timestamptz,
  cancelado_motivo text,
  operador_id      bigint references public.operadores(id)          -- padeiro que recebeu (tablet)
);
create index if not exists transferencias_sit_idx on public.transferencias (situacao);
create table if not exists public.transferencia_itens (
  id                 bigint generated always as identity primary key,
  transferencia_id   bigint not null references public.transferencias(id),
  produto_id         bigint not null references public.produtos(id),
  quantidade         numeric(14,4) not null check (quantidade > 0),   -- separada/enviada
  qtd2               numeric(14,4),
  recebido           numeric(14,4),
  qtd2_recebido      numeric(14,4),
  requisicao_item_id bigint references public.requisicao_itens(id),
  programacao_id     bigint references public.programacoes(id)       -- misturas: de qual programação
);
create index if not exists transferencia_itens_t_idx on public.transferencia_itens (transferencia_id);

-- ---------------------------------------------------------------------
-- 6. BATELADAS (cada batida da maceira) E SEU CUSTO
-- ---------------------------------------------------------------------
create table if not exists public.bateladas (
  id                bigint generated always as identity primary key,
  programacao_id    bigint references public.programacoes(id),
  ficha_id          bigint not null references public.fichas_tecnicas(id),
  maceira_id        bigint references public.maceiras(id),
  operador_id       bigint references public.operadores(id),
  usuario_id        uuid references auth.users(id) default auth.uid(),
  iniciada_em       timestamptz not null default now(),
  situacao          text not null default 'em_producao' check (situacao in ('em_producao','finalizada','cancelada')),
  itens             jsonb,          -- farinha/fermento usados [{produto_id, quantidade, padrao, trocou_de}]
  rendimento_padrao numeric(12,3),
  quantidade_produzida numeric(12,3),
  finalizada_em     timestamptz,
  finalizada_por    uuid references auth.users(id),
  cancelada_motivo  text,
  observacao        text
);
create index if not exists bateladas_prog_idx on public.bateladas (programacao_id);
create index if not exists bateladas_ini_idx on public.bateladas (iniciada_em);

-- custo fica numa tabela só para quem vê custos (controladoria e diretoria)
create table if not exists public.batelada_custos (
  batelada_id      bigint primary key references public.bateladas(id),
  custo_mistura    numeric(16,4) not null default 0,
  custo_maceira    numeric(16,4) not null default 0,    -- farinha + fermento usados
  custo_embalagem  numeric(16,4) not null default 0,    -- calculado (não baixa estoque enquanto a embalagem for "por requisição")
  custo_total      numeric(16,4) not null default 0,
  custo_unitario   numeric(16,6),
  custo_padrao     numeric(16,4),                       -- ficha × custo médio do dia (comparação)
  detalhe          jsonb
);

-- ---------------------------------------------------------------------
-- 7. MOVIMENTOS: local, transferência, batelada, 2ª medida
-- ---------------------------------------------------------------------
alter table public.movimentos add column if not exists local_id         bigint references public.locais(id);
alter table public.movimentos add column if not exists qtd_local        numeric(14,4);   -- efeito no saldo físico do local
alter table public.movimentos add column if not exists disp_delta       numeric(14,4);
alter table public.movimentos add column if not exists sep_delta        numeric(14,4);
alter table public.movimentos add column if not exists saldo_local_apos numeric(14,4);
alter table public.movimentos add column if not exists qtd2             numeric(14,4);
alter table public.movimentos add column if not exists transferencia_id bigint references public.transferencias(id);
alter table public.movimentos add column if not exists batelada_id      bigint references public.bateladas(id);
alter table public.movimentos add column if not exists requisicao_id    bigint references public.requisicoes(id);
alter table public.movimentos add column if not exists programacao_id   bigint references public.programacoes(id);
alter table public.movimentos add column if not exists operador_id      bigint references public.operadores(id);
alter table public.movimentos add column if not exists etapa            text;    -- transferência: separacao, envio, recebimento, cancelamento...
create index if not exists movimentos_local_idx on public.movimentos (local_id, data_hora);
create index if not exists movimentos_transf_idx on public.movimentos (transferencia_id);

-- ---------------------------------------------------------------------
-- 8. DADOS INICIAIS: unidade Matriz, locais, parâmetros, local padrão
-- ---------------------------------------------------------------------
insert into public.unidades (nome, cidade) values ('Matriz', 'Franca/SP') on conflict (nome) do nothing;
insert into public.locais (unidade_id, nome, tipo, papeis, ordem)
select u.id, l.nome, l.tipo, l.papeis, l.ordem
  from public.unidades u,
       (values ('Almoxarifado',      'almoxarifado', array['almoxarifado','recebimento'], 1),
               ('Depósito Produção', 'deposito',     array['almoxarifado','recebimento','padeiro'], 2),
               ('Pesagem',           'pesagem',      array['pesagem'], 3),
               ('Produção Maceiras', 'maceiras',     array['padeiro'], 4),
               ('PCP',               'pcp',          array['engenharia'], 5)) as l(nome, tipo, papeis, ordem)
 where u.nome = 'Matriz'
on conflict (unidade_id, nome) do nothing;

insert into public.parametros (chave, valor, descricao) values
  ('producao_tolerancia_min', '10', 'Produção: minutos de tolerância no início do dia, depois da primeira mistura recebida'),
  ('producao_tempo_padrao_min', '20', 'Produção: tempo médio da batelada quando a receita não tem tempo próprio (minutos)'),
  ('producao_prazo_finalizar_h', '12', 'Produção: horas para avisar batelada sem finalizar'),
  ('mistura_parada_h', '4', 'Produção: horas para avisar mistura pesada e não enviada')
on conflict (chave) do nothing;

-- forma de baixa e local padrão dos produtos que já existem (só onde ainda está vazio)
update public.produtos set baixa_producao = true, baixa_requisicao = true
 where categoria = 'materia_prima' and local_padrao_id is null;
update public.produtos set baixa_producao = false, baixa_requisicao = true
 where categoria <> 'materia_prima' and local_padrao_id is null;
update public.produtos set usado_na = case when coalesce(grupo,'') ~* '(farinha|fermento)' or descricao ~* '^(farinha|fermento)' then 'maceira' else 'pesagem' end
 where categoria = 'materia_prima' and usado_na is null;
update public.produtos p set local_padrao_id = (
    select l.id from public.locais l join public.unidades u on u.id = l.unidade_id
     where u.nome = 'Matriz' and l.tipo = case
       when p.categoria = 'materia_prima' and p.usado_na = 'maceira' then 'deposito'
       when p.categoria = 'materia_prima' then 'pesagem'
       else 'almoxarifado' end)
 where p.local_padrao_id is null;
update public.produtos set unidade2 = 'bobina' where unidade2 is null and coalesce(unidade_compra,'') = 'bobina';

-- saldo atual de cada produto vai para o seu local padrão (uma vez só)
insert into public.estoque_local (produto_id, local_id, disponivel)
select p.id, p.local_padrao_id, p.saldo from public.produtos p
 where p.local_padrao_id is not null
   and not exists (select 1 from public.estoque_local e where e.produto_id = p.id)
   and p.saldo <> 0;

-- ---------------------------------------------------------------------
-- 9. FUNÇÕES DE APOIO
-- ---------------------------------------------------------------------
create or replace function public._matriz()
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select id from public.unidades where nome = 'Matriz'), (select min(id) from public.unidades))
$$;

create or replace function public._local_tipo(p_tipo text, p_unidade bigint default null)
returns bigint language sql stable security definer set search_path = public as $$
  select id from public.locais where tipo = p_tipo and ativo and unidade_id = coalesce(p_unidade, public._matriz())
  order by ordem, id limit 1
$$;

create or replace function public._local_do_produto(p_produto bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select local_padrao_id from public.produtos where id = p_produto), public._local_tipo('almoxarifado'))
$$;

-- o usuário opera este local? (administrador opera todos)
create or replace function public._opera_local(p_local bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce('admin' = any(public.meus_papeis())
      or exists (select 1 from public.locais l where l.id = p_local and l.papeis && public.meus_papeis()), false)
$$;

create or replace function public._exigir_local(p_local bigint)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.usuario_ativo() then raise exception 'Usuário inativo.' using errcode = '42501'; end if;
  if not public._opera_local(p_local) then
    raise exception 'Você não opera o local %.', coalesce((select nome from public.locais where id = p_local), p_local::text)
      using errcode = '42501';
  end if;
end $$;

create or replace function public._nome_local(p_local bigint)
returns text language sql stable security definer set search_path = public as $$
  select l.nome || case when (select count(*) from public.unidades where ativa) > 1 then ' (' || u.nome || ')' else '' end
    from public.locais l join public.unidades u on u.id = l.unidade_id where l.id = p_local
$$;

-- padeiro: confere a senha de 6 números
create or replace function public._operador_ok(p_operador bigint, p_pin text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.operadores o where o.id = p_operador and o.ativo
                   and o.pin_hash = encode(sha256(convert_to(coalesce(o.pin_sal,'') || coalesce(p_pin,''), 'UTF8')), 'hex'))
$$;

-- ---------------------------------------------------------------------
-- 10. MOVIMENTAR (agora com local): todo movimento de empresa passa aqui
--     extra: local_id (padrão = local do produto), qtd2, transferencia_id, batelada_id, ...
-- ---------------------------------------------------------------------
create or replace function public._movimentar(p_produto bigint, p_tipo text, p_qtd numeric,
                                              p_custo numeric, p_extra jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v public.produtos;
  v_custo_mov numeric;
  v_novo_medio numeric;
  v_base numeric;
  v_id bigint;
  v_local bigint;
  v_q2 numeric := (p_extra->>'qtd2')::numeric;
  e public.estoque_local;
begin
  if p_qtd is null or p_qtd = 0 then
    raise exception 'Quantidade zerada não gera movimento.';
  end if;
  select * into v from public.produtos where id = p_produto for update;
  if not found then raise exception 'Produto % não encontrado.', p_produto; end if;
  if not v.controla_estoque then return null; end if;   -- produto sem controle de estoque: não movimenta
  v_local := coalesce((p_extra->>'local_id')::bigint, v.local_padrao_id, public._local_tipo('almoxarifado'));

  insert into public.estoque_local (produto_id, local_id) values (p_produto, v_local) on conflict do nothing;
  select * into e from public.estoque_local where produto_id = p_produto and local_id = v_local for update;

  if coalesce(public._param('permitir_saldo_negativo'), 'sim') = 'nao' and p_qtd < 0
     and (v.saldo + p_qtd < 0 or e.disponivel + p_qtd < 0) then
    raise exception 'Saldo insuficiente de % (%) em %: disponível % %, saída de % %.',
      v.codigo, v.descricao, public._nome_local(v_local), round(e.disponivel, 3), v.unidade_estoque, round(-p_qtd, 3), v.unidade_estoque;
  end if;

  v_novo_medio := v.custo_medio;
  if p_custo is not null and p_custo >= 0 then
    v_custo_mov := p_custo;
    v_base := greatest(v.saldo, 0);
    if v_base + p_qtd > 0 then
      v_novo_medio := (v_base * v.custo_medio + p_qtd * p_custo) / (v_base + p_qtd);
    end if;
    if v_novo_medio < 0 or (v.saldo <= 0 and p_qtd > 0) then
      v_novo_medio := case when p_qtd > 0 then p_custo else v.custo_medio end;
    end if;
  else
    v_custo_mov := v.custo_medio;
  end if;

  update public.produtos
     set saldo = saldo + p_qtd, custo_medio = round(v_novo_medio, 6)
   where id = p_produto;

  -- 2ª medida (bobinas): entra/sai junto; se zerou o kg, zera as bobinas também
  if v_q2 is null and v.unidade2 is not null and p_qtd < 0 and e.qtd2_disponivel > 0 and e.disponivel > 0 then
    v_q2 := -round(e.qtd2_disponivel * least(-p_qtd / e.disponivel, 1), 4);
  end if;
  update public.estoque_local
     set disponivel = disponivel + p_qtd,
         qtd2_disponivel = case when disponivel + p_qtd <= 0.0001 and p_qtd < 0 then 0
                                else greatest(qtd2_disponivel + coalesce(v_q2, 0), 0) end
   where produto_id = p_produto and local_id = v_local;

  insert into public.movimentos (produto_id, tipo, quantidade, qtd_informada, unidade_informada,
      custo_unitario, valor, saldo_apos, motivo, observacao, destino, usuario_id,
      recebimento_id, pedido_item_id, producao_id, inventario_id, corrige_id,
      local_id, qtd_local, disp_delta, sep_delta, saldo_local_apos, qtd2,
      transferencia_id, batelada_id, requisicao_id, programacao_id, operador_id, etapa)
  values (p_produto, p_tipo, p_qtd,
      (p_extra->>'qtd_informada')::numeric, p_extra->>'unidade_informada',
      round(v_custo_mov, 6), round(p_qtd * v_custo_mov, 2), v.saldo + p_qtd,
      public._texto(p_extra, 'motivo'), public._texto(p_extra, 'observacao'),
      public._texto(p_extra, 'destino'), auth.uid(),
      (p_extra->>'recebimento_id')::bigint, (p_extra->>'pedido_item_id')::bigint,
      (p_extra->>'producao_id')::bigint, (p_extra->>'inventario_id')::bigint,
      (p_extra->>'corrige_id')::bigint,
      v_local, p_qtd, p_qtd, 0, e.disponivel + e.separado + p_qtd, v_q2,
      (p_extra->>'transferencia_id')::bigint, (p_extra->>'batelada_id')::bigint,
      (p_extra->>'requisicao_id')::bigint, (p_extra->>'programacao_id')::bigint,
      (p_extra->>'operador_id')::bigint, public._texto(p_extra, 'etapa'))
  returning id into v_id;
  return v_id;
end $$;

-- movimento SÓ do local (transferência): não muda o saldo nem o custo da empresa
create or replace function public._mov_local(p_produto bigint, p_local bigint, p_disp numeric, p_sep numeric,
                                             p_q2disp numeric, p_q2sep numeric, p_extra jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v public.produtos; e public.estoque_local; v_id bigint;
begin
  select * into v from public.produtos where id = p_produto for update;
  if not v.controla_estoque then return null; end if;
  insert into public.estoque_local (produto_id, local_id) values (p_produto, p_local) on conflict do nothing;
  select * into e from public.estoque_local where produto_id = p_produto and local_id = p_local for update;
  if coalesce(public._param('permitir_saldo_negativo'), 'sim') = 'nao' and e.disponivel + p_disp < -0.0001 then
    raise exception 'Saldo insuficiente de % em %: disponível %.', v.descricao, public._nome_local(p_local), round(e.disponivel, 3);
  end if;
  update public.estoque_local set disponivel = disponivel + p_disp, separado = greatest(separado + p_sep, 0),
         qtd2_disponivel = greatest(qtd2_disponivel + coalesce(p_q2disp, 0), 0),
         qtd2_separado = greatest(qtd2_separado + coalesce(p_q2sep, 0), 0)
   where produto_id = p_produto and local_id = p_local;
  insert into public.movimentos (produto_id, tipo, quantidade, custo_unitario, valor, saldo_apos, observacao, motivo, usuario_id,
      local_id, qtd_local, disp_delta, sep_delta, saldo_local_apos, qtd2, transferencia_id, requisicao_id, programacao_id, operador_id, etapa)
  values (p_produto, 'transferencia', 0, round(v.custo_medio, 6), round((p_disp + p_sep) * v.custo_medio, 2), v.saldo,
      public._texto(p_extra,'observacao'), public._texto(p_extra,'motivo'), auth.uid(),
      p_local, p_disp + p_sep, p_disp, p_sep, e.disponivel + e.separado + p_disp + p_sep,
      coalesce(p_q2disp, 0) + coalesce(p_q2sep, 0),
      (p_extra->>'transferencia_id')::bigint, (p_extra->>'requisicao_id')::bigint, (p_extra->>'programacao_id')::bigint,
      (p_extra->>'operador_id')::bigint, public._texto(p_extra,'etapa'))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 11. PERMISSÕES (matriz nova)
-- ---------------------------------------------------------------------
create or replace function public.acesso_amplo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.usuario_ativo() and public.meus_papeis() &&
         array['admin','comprador','almoxarifado','recebimento','pesagem','engenharia','diretoria','padeiro']::text[]
$$;

create or replace function public.pode(p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meus_papeis() && (case p_acao
    when 'cadastro_produto'    then array['admin','comprador']
    when 'cadastro_fornecedor' then array['admin','comprador']
    when 'ficha_tecnica'       then array['admin','engenharia']
    when 'pedido'              then array['admin','comprador']
    when 'recebimento'         then array['admin','almoxarifado','recebimento']
    when 'saida_receita'       then array['admin','pesagem','almoxarifado']
    when 'saida_avulsa'        then array['admin','pesagem','almoxarifado','padeiro','engenharia']
    when 'saida_almox'         then array['admin','almoxarifado','recebimento']
    when 'inventario'          then array['admin','almoxarifado','recebimento']
    when 'corrigir'            then array['admin','almoxarifado']
    when 'implantacao'         then array['admin']
    when 'contagem_inicial'    then array['admin','almoxarifado']
    when 'usuarios'            then array['admin']
    when 'parametros'          then array['admin']
    when 'auditoria'           then array['admin','diretoria']
    when 'importacao'          then array['admin']
    when 'programacao'         then array['admin','engenharia']
    when 'financeiro'          then array['admin','financeiro']
    when 'data_pagamento'      then array['admin','comprador','financeiro']
    when 'previsao_producao'   then array['admin','engenharia','diretoria','financeiro','faturamento']
    when 'custos'              then array['admin','diretoria']
    when 'requisicao'          then array['admin','engenharia']
    when 'producao_config'     then array['admin','engenharia']
    when 'batelada'            then array['admin','padeiro','engenharia']
    when 'finalizar_batelada'  then array['admin','engenharia']
    when 'consumo'             then array['admin','engenharia','almoxarifado','padeiro','pesagem']
    when 'locais'              then array['admin']
    else array[]::text[] end)::text[], false)
$$;

-- ---------------------------------------------------------------------
-- 12. CADASTROS: produto (campos novos), unidades, locais, linhas, maceiras, padeiros
-- ---------------------------------------------------------------------
create or replace function public.salvar_produto(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := (p->>'id')::bigint; v_old public.produtos;
        v_ucompra text := public._texto(p, 'unidade_compra');
        v_fator numeric := coalesce((p->>'fator_compra')::numeric, 1);
        v_cat text := p->>'categoria';
        v_ctrl boolean := coalesce((p->>'controla_estoque')::boolean, true);
        v_bp boolean := coalesce((p->>'baixa_producao')::boolean, p->>'categoria' = 'materia_prima');
        v_br boolean := coalesce((p->>'baixa_requisicao')::boolean, true);
        v_local bigint := (p->>'local_padrao_id')::bigint;
        v_usado text := public._texto(p,'usado_na');
        v_peso numeric := (p->>'peso_embalagem_g')::numeric;
begin
  perform public._exigir('cadastro_produto');
  if public._texto(p,'codigo') is null then raise exception 'Informe o código do produto.'; end if;
  if public._texto(p,'descricao') is null then raise exception 'Informe a descrição do produto.'; end if;
  if public._texto(p,'unidade_estoque') is null then raise exception 'Informe a unidade de estoque.'; end if;
  if coalesce(v_cat,'') not in ('materia_prima','embalagem','escritorio','limpeza','outros','intermediario','produto_acabado') then
    raise exception 'Categoria inválida: "%". Use: materia_prima, embalagem, escritorio, limpeza ou outros.', v_cat;
  end if;
  if v_ucompra is null or v_ucompra = p->>'unidade_estoque' then v_ucompra := null; v_fator := 1; end if;
  if v_fator <= 0 then raise exception 'O fator de conversão precisa ser maior que zero.'; end if;
  if v_ctrl and not (v_bp or v_br) then
    raise exception 'Produto que controla estoque precisa de pelo menos uma forma de baixa: por produção e/ou por requisição.';
  end if;
  if v_usado is not null and v_usado not in ('pesagem','maceira') then raise exception 'Usado na: pesagem ou maceira.'; end if;
  if v_cat = 'embalagem' and v_ctrl and lower(btrim(p->>'unidade_estoque')) in ('kg','g') and coalesce(v_peso, 0) <= 0 then
    raise exception 'Embalagem controlada em % : informe o peso médio por embalagem (g).', btrim(p->>'unidade_estoque');
  end if;
  if v_local is not null and not exists (select 1 from public.locais where id = v_local) then raise exception 'Local padrão inválido.'; end if;
  if v_local is null then
    v_local := public._local_tipo(case when v_cat = 'materia_prima' and v_usado = 'maceira' then 'deposito'
                                       when v_cat = 'materia_prima' then 'pesagem' else 'almoxarifado' end);
  end if;
  if exists (select 1 from public.produtos where lower(codigo) = lower(btrim(p->>'codigo'))
             and id is distinct from v_id) then
    raise exception 'Já existe um produto com o código %.', p->>'codigo';
  end if;

  if v_id is null then
    insert into public.produtos (codigo, codigo_erp, descricao, categoria, grupo, classificacao, marca, unidade_estoque, unidade_compra,
        fator_compra, estoque_minimo, prazo_entrega_dias, fornecedor_padrao_id, observacao, ativo,
        controla_estoque, baixa_producao, baixa_requisicao, usado_na, local_padrao_id, unidade2, peso_embalagem_g, ficha_id)
    values (btrim(p->>'codigo'), public._texto(p,'codigo_erp'), btrim(p->>'descricao'), v_cat,
        public._texto(p,'grupo'), upper(public._texto(p,'classificacao')), public._texto(p,'marca'), btrim(p->>'unidade_estoque'),
        v_ucompra, v_fator, (p->>'estoque_minimo')::numeric, (p->>'prazo_entrega_dias')::int,
        (p->>'fornecedor_padrao_id')::bigint, public._texto(p,'observacao'),
        coalesce((p->>'ativo')::boolean, true),
        v_ctrl, v_bp, v_br, v_usado, v_local, public._texto(p,'unidade2'), v_peso, (p->>'ficha_id')::bigint)
    returning id into v_id;
    update public.produtos set atualizado_em = now(), atualizado_por = auth.uid() where id = v_id;
  else
    select * into v_old from public.produtos where id = v_id;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if v_old.unidade_estoque <> btrim(p->>'unidade_estoque')
       and exists (select 1 from public.movimentos where produto_id = v_id) then
      raise exception 'A unidade de estoque não pode mudar depois que o produto já tem movimentos.';
    end if;
    update public.produtos set
      codigo = btrim(p->>'codigo'), codigo_erp = public._texto(p,'codigo_erp'), descricao = btrim(p->>'descricao'), categoria = v_cat,
      grupo = public._texto(p,'grupo'), classificacao = upper(public._texto(p,'classificacao')), marca = public._texto(p,'marca'),
      unidade_estoque = btrim(p->>'unidade_estoque'), unidade_compra = v_ucompra, fator_compra = v_fator,
      estoque_minimo = (p->>'estoque_minimo')::numeric, prazo_entrega_dias = (p->>'prazo_entrega_dias')::int,
      fornecedor_padrao_id = (p->>'fornecedor_padrao_id')::bigint, observacao = public._texto(p,'observacao'),
      ativo = coalesce((p->>'ativo')::boolean, true),
      controla_estoque = v_ctrl, baixa_producao = v_bp, baixa_requisicao = v_br, usado_na = v_usado,
      local_padrao_id = v_local, unidade2 = public._texto(p,'unidade2'), peso_embalagem_g = v_peso,
      atualizado_em = now(), atualizado_por = auth.uid()
    where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.salvar_unidade(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := (p->>'id')::bigint;
begin
  perform public._exigir('locais');
  if public._texto(p,'nome') is null then raise exception 'Informe o nome da unidade.'; end if;
  if exists (select 1 from public.unidades where lower(nome) = lower(btrim(p->>'nome')) and id is distinct from v_id) then
    raise exception 'Já existe uma unidade com este nome.'; end if;
  if v_id is null then
    insert into public.unidades (nome, cidade, ativa) values (btrim(p->>'nome'), public._texto(p,'cidade'), coalesce((p->>'ativa')::boolean, true))
    returning id into v_id;
  else
    update public.unidades set nome = btrim(p->>'nome'), cidade = public._texto(p,'cidade'), ativa = coalesce((p->>'ativa')::boolean, true)
     where id = v_id;
    if not found then raise exception 'Unidade não encontrada.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.salvar_local(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := (p->>'id')::bigint;
        v_papeis text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(p->'papeis') x), '{}');
begin
  perform public._exigir('locais');
  if public._texto(p,'nome') is null then raise exception 'Informe o nome do local.'; end if;
  if (p->>'unidade_id') is null or not exists (select 1 from public.unidades where id = (p->>'unidade_id')::bigint) then
    raise exception 'Escolha a unidade do local.'; end if;
  if coalesce(p->>'tipo','outro') not in ('almoxarifado','deposito','pesagem','maceiras','pcp','expedicao','outro') then
    raise exception 'Tipo de local inválido.'; end if;
  if not (v_papeis <@ array['admin','comprador','almoxarifado','recebimento','pesagem','engenharia','diretoria','padeiro']::text[]) then
    raise exception 'Papel inválido no local.'; end if;
  if exists (select 1 from public.locais where unidade_id = (p->>'unidade_id')::bigint and lower(nome) = lower(btrim(p->>'nome'))
             and id is distinct from v_id) then raise exception 'Já existe um local com este nome nesta unidade.'; end if;
  if v_id is null then
    insert into public.locais (unidade_id, nome, tipo, papeis, ordem, ativo)
    values ((p->>'unidade_id')::bigint, btrim(p->>'nome'), coalesce(p->>'tipo','outro'), v_papeis,
            coalesce((p->>'ordem')::int, 0), coalesce((p->>'ativo')::boolean, true))
    returning id into v_id;
  else
    if coalesce((p->>'ativo')::boolean, true) = false and exists (select 1 from public.estoque_local
        where local_id = v_id and (abs(disponivel) > 0.0001 or abs(separado) > 0.0001)) then
      raise exception 'Este local ainda tem estoque: transfira ou ajuste antes de desativar.';
    end if;
    update public.locais set unidade_id = (p->>'unidade_id')::bigint, nome = btrim(p->>'nome'), tipo = coalesce(p->>'tipo','outro'),
           papeis = v_papeis, ordem = coalesce((p->>'ordem')::int, 0), ativo = coalesce((p->>'ativo')::boolean, true)
     where id = v_id;
    if not found then raise exception 'Local não encontrado.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.salvar_linha(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := (p->>'id')::bigint;
begin
  perform public._exigir('producao_config');
  if public._texto(p,'nome') is null then raise exception 'Informe o nome da linha.'; end if;
  if exists (select 1 from public.linhas_producao where lower(nome) = lower(btrim(p->>'nome')) and id is distinct from v_id) then
    raise exception 'Já existe uma linha com este nome.'; end if;
  if v_id is null then
    insert into public.linhas_producao (nome, ativo) values (btrim(p->>'nome'), coalesce((p->>'ativo')::boolean, true)) returning id into v_id;
  else
    update public.linhas_producao set nome = btrim(p->>'nome'), ativo = coalesce((p->>'ativo')::boolean, true) where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.salvar_maceira(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := (p->>'id')::bigint;
        v_lin bigint[] := coalesce((select array_agg(x::bigint) from jsonb_array_elements_text(p->'linhas') x), '{}');
        v_op bigint[] := coalesce((select array_agg(x::bigint) from jsonb_array_elements_text(p->'operadores') x), '{}');
        v_local bigint := coalesce((p->>'local_id')::bigint, public._local_tipo('maceiras'));
begin
  perform public._exigir('producao_config');
  if public._texto(p,'nome') is null then raise exception 'Informe o nome da maceira.'; end if;
  if v_local is null then raise exception 'Cadastre antes o local Produção Maceiras.'; end if;
  if v_id is null then
    insert into public.maceiras (local_id, nome, capacidade_kg, linhas, operadores, tempo_min, ordem, ativa)
    values (v_local, btrim(p->>'nome'), (p->>'capacidade_kg')::numeric, v_lin, v_op, (p->>'tempo_min')::int,
            coalesce((p->>'ordem')::int, (select coalesce(max(ordem),0)+1 from public.maceiras)), coalesce((p->>'ativa')::boolean, true))
    returning id into v_id;
  else
    update public.maceiras set local_id = v_local, nome = btrim(p->>'nome'), capacidade_kg = (p->>'capacidade_kg')::numeric,
           linhas = v_lin, operadores = v_op, tempo_min = (p->>'tempo_min')::int,
           ordem = coalesce((p->>'ordem')::int, ordem), ativa = coalesce((p->>'ativa')::boolean, true)
     where id = v_id;
    if not found then raise exception 'Maceira não encontrada.'; end if;
  end if;
  return v_id;
end $$;

-- padeiro: nome e senha de 6 números (a senha nunca volta para a tela)
create or replace function public.salvar_operador(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := (p->>'id')::bigint; v_pin text := public._texto(p,'pin'); v_sal text;
begin
  perform public._exigir('producao_config');
  if public._texto(p,'nome') is null then raise exception 'Informe o nome do padeiro.'; end if;
  if v_pin is not null and v_pin !~ '^[0-9]{6}$' then raise exception 'A senha do padeiro precisa ter exatamente 6 números.'; end if;
  if v_id is null and v_pin is null then raise exception 'Informe a senha de 6 números do padeiro.'; end if;
  if v_pin is not null then v_sal := md5(random()::text || clock_timestamp()::text); end if;
  if v_id is null then
    insert into public.operadores (nome, pin_sal, pin_hash, ativo)
    values (btrim(p->>'nome'), v_sal, encode(sha256(convert_to(v_sal || v_pin, 'UTF8')), 'hex'), coalesce((p->>'ativo')::boolean, true))
    returning id into v_id;
  else
    update public.operadores set nome = btrim(p->>'nome'), ativo = coalesce((p->>'ativo')::boolean, true),
           pin_sal = coalesce(v_sal, pin_sal),
           pin_hash = case when v_pin is not null then encode(sha256(convert_to(v_sal || v_pin, 'UTF8')), 'hex') else pin_hash end
     where id = v_id;
    if not found then raise exception 'Padeiro não encontrado.'; end if;
  end if;
  return v_id;
end $$;

-- tempos da produção (o PCP ajusta: tolerância, tempo padrão, prazo para finalizar, mistura parada)
create or replace function public.salvar_parametros_producao(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare k text; v text;
begin
  perform public._exigir('producao_config');
  for k, v in select * from jsonb_each_text(p) loop
    if k not in ('producao_tolerancia_min','producao_tempo_padrao_min','producao_prazo_finalizar_h','mistura_parada_h') then
      raise exception 'Configuração não permitida aqui: %', k; end if;
    if v !~ '^[0-9]+$' or v::int <= 0 or v::int > 1440 then raise exception 'Valor inválido para %: use um número inteiro maior que zero.', k; end if;
    update public.parametros set valor = v where chave = k;
  end loop;
end $$;

create or replace function public.entrar_operador(p_operador bigint, p_pin text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir('batelada');
  if not public._operador_ok(p_operador, p_pin) then raise exception 'Senha incorreta.'; end if;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 13. FICHA TÉCNICA: aceita embalagem (só para custo), linha e tempo da batelada
--     embalagem na ficha = quantas embalagens por unidade produzida (ex.: 1 por pão)
-- ---------------------------------------------------------------------
create or replace function public.salvar_ficha(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := (p->>'id')::bigint; v_old public.fichas_tecnicas; it jsonb; r record;
        v_novos jsonb := '{}'::jsonb; v_desc text[] := '{}'; v_pid bigint; v_q numeric;
        k text; v text; v_pr public.produtos; v_n int := 0; v_cat text;
begin
  perform public._exigir('ficha_tecnica');
  if public._texto(p,'nome') is null then raise exception 'Informe o nome da ficha técnica.'; end if;
  if public._texto(p,'rendimento_qtd') is null and public._texto(p,'rendimento') ~ '^\s*[0-9][0-9.]*(,[0-9]+)?\s*\S' then
    p := p || jsonb_build_object(
      'rendimento_qtd', replace(replace(substring(p->>'rendimento' from '^\s*([0-9][0-9.]*(,[0-9]+)?)'), '.', ''), ',', '.'),
      'rendimento_unidade', coalesce(public._texto(p,'rendimento_unidade'), btrim(regexp_replace(p->>'rendimento', '^\s*[0-9][0-9.]*(,[0-9]+)?\s*', ''))));
  end if;
  if public._texto(p,'rendimento_qtd') is not null and (p->>'rendimento_qtd')::numeric <= 0 then
    raise exception 'O rendimento precisa ser maior que zero.';
  end if;
  if (p->>'tempo_batelada_min') is not null and (p->>'tempo_batelada_min')::int <= 0 then
    raise exception 'O tempo da batelada precisa ser maior que zero.';
  end if;
  if jsonb_array_length(coalesce(p->'itens','[]'::jsonb)) = 0 then
    raise exception 'A ficha técnica precisa de pelo menos 1 ingrediente.';
  end if;
  if public._texto(p,'codigo') is not null and exists (select 1 from public.fichas_tecnicas
       where lower(codigo) = lower(btrim(p->>'codigo')) and id is distinct from v_id) then
    raise exception 'Já existe uma ficha técnica com o código %.', p->>'codigo';
  end if;
  for it in select * from jsonb_array_elements(p->'itens') loop
    v_pid := (it->>'produto_id')::bigint;
    select categoria into v_cat from public.produtos where id = v_pid;
    if v_cat is null or v_cat not in ('materia_prima','embalagem') then
      raise exception 'Ficha técnica só aceita matéria-prima e embalagem (produto %).', v_pid;
    end if;
    if coalesce((it->>'quantidade')::numeric, 0) <= 0 then
      raise exception 'Quantidade do ingrediente precisa ser maior que zero.';
    end if;
    v_q := case when v_cat = 'embalagem' then (it->>'quantidade')::numeric      -- por unidade produzida
                else (it->>'quantidade')::numeric * public._fator(v_pid, it->>'unidade') end;
    v_novos := jsonb_set(v_novos, array[v_pid::text], to_jsonb(coalesce((v_novos->>v_pid::text)::numeric, 0) + v_q));
  end loop;
  if not exists (select 1 from jsonb_object_keys(v_novos) k2 join public.produtos pr on pr.id = k2::bigint where pr.categoria = 'materia_prima') then
    raise exception 'A ficha técnica precisa de pelo menos 1 matéria-prima.';
  end if;

  if v_id is null then
    insert into public.fichas_tecnicas (codigo, nome, produto_final, rendimento, rendimento_qtd, rendimento_unidade, observacao, ativo,
        linha_id, tempo_batelada_min, atualizado_em, atualizado_por)
    values (coalesce(btrim(p->>'codigo'), 'R' || lpad((select coalesce(max(id),0)+1 from public.fichas_tecnicas)::text, 3, '0')),
            btrim(p->>'nome'), public._texto(p,'produto_final'), public._texto(p,'rendimento'),
            (public._texto(p,'rendimento_qtd'))::numeric, public._texto(p,'rendimento_unidade'),
            public._texto(p,'observacao'), coalesce((p->>'ativo')::boolean, true),
            (p->>'linha_id')::bigint, (p->>'tempo_batelada_min')::int, now(), auth.uid())
    returning id into v_id;
    select count(*) into v_n from jsonb_object_keys(v_novos);
    v_desc := array[format('Criou a ficha com %s %s', v_n, case when v_n = 1 then 'item' else 'itens' end)];
  else
    select * into v_old from public.fichas_tecnicas where id = v_id for update;
    if not found then raise exception 'Ficha técnica não encontrada.'; end if;
    if public._texto(p,'codigo') is not null and v_old.codigo is distinct from btrim(p->>'codigo') then
      v_desc := v_desc || format('código: "%s" → "%s"', v_old.codigo, btrim(p->>'codigo')); end if;
    if v_old.nome is distinct from btrim(p->>'nome') then
      v_desc := v_desc || format('nome: "%s" → "%s"', v_old.nome, btrim(p->>'nome')); end if;
    if v_old.produto_final is distinct from public._texto(p,'produto_final') then
      v_desc := v_desc || format('produto final: "%s" → "%s"', coalesce(v_old.produto_final,''), coalesce(public._texto(p,'produto_final'),'')); end if;
    if v_old.rendimento_qtd is distinct from (public._texto(p,'rendimento_qtd'))::numeric
       or v_old.rendimento_unidade is distinct from public._texto(p,'rendimento_unidade') then
      v_desc := v_desc || format('rendimento por receita: %s %s → %s %s', coalesce(public._fmt(v_old.rendimento_qtd),'–'), coalesce(v_old.rendimento_unidade,''),
                                 coalesce(public._fmt((public._texto(p,'rendimento_qtd'))::numeric),'–'), coalesce(public._texto(p,'rendimento_unidade'),'')); end if;
    if v_old.tempo_batelada_min is distinct from (p->>'tempo_batelada_min')::int then
      v_desc := v_desc || format('tempo da batelada: %s → %s min', coalesce(v_old.tempo_batelada_min::text,'–'), coalesce(p->>'tempo_batelada_min','–')); end if;
    if v_old.linha_id is distinct from (p->>'linha_id')::bigint then
      v_desc := v_desc || 'mudou a linha de produção'::text; end if;
    if v_old.observacao is distinct from public._texto(p,'observacao') then
      v_desc := v_desc || 'alterou a observação'::text; end if;
    if v_old.ativo is distinct from coalesce((p->>'ativo')::boolean, true) then
      v_desc := v_desc || (case when coalesce((p->>'ativo')::boolean, true) then 'reativou a ficha' else 'desativou a ficha' end); end if;
    update public.fichas_tecnicas set codigo = coalesce(btrim(p->>'codigo'), codigo), nome = btrim(p->>'nome'), produto_final = public._texto(p,'produto_final'),
      rendimento = public._texto(p,'rendimento'), rendimento_qtd = (public._texto(p,'rendimento_qtd'))::numeric,
      rendimento_unidade = public._texto(p,'rendimento_unidade'), observacao = public._texto(p,'observacao'),
      linha_id = (p->>'linha_id')::bigint, tempo_batelada_min = (p->>'tempo_batelada_min')::int,
      ativo = coalesce((p->>'ativo')::boolean, true), atualizado_em = now(), atualizado_por = auth.uid()
    where id = v_id;
    for r in select fi.id, fi.produto_id, fi.quantidade, pr.descricao, pr.unidade_estoque, pr.categoria
               from public.ficha_itens fi join public.produtos pr on pr.id = fi.produto_id
              where fi.ficha_id = v_id order by fi.id loop
      if not (v_novos ? r.produto_id::text) then
        delete from public.ficha_itens where id = r.id;
        v_desc := v_desc || format('retirou %s (%s %s)', r.descricao, public._fmt(r.quantidade),
                                   case when r.categoria = 'embalagem' then 'por unidade produzida' else public._un(r.unidade_estoque, r.quantidade) end);
      elsif abs((v_novos->>r.produto_id::text)::numeric - r.quantidade) > 0.00005 then
        update public.ficha_itens set quantidade = (v_novos->>r.produto_id::text)::numeric where id = r.id;
        v_desc := v_desc || format('%s: %s → %s %s', r.descricao, public._fmt(r.quantidade),
                                   public._fmt((v_novos->>r.produto_id::text)::numeric),
                                   case when r.categoria = 'embalagem' then 'por unidade produzida' else public._un(r.unidade_estoque, (v_novos->>r.produto_id::text)::numeric) end);
      end if;
      v_novos := v_novos - r.produto_id::text;
    end loop;
  end if;
  for k, v in select key, value from jsonb_each_text(v_novos) loop
    insert into public.ficha_itens (ficha_id, produto_id, quantidade) values (v_id, k::bigint, v::numeric);
    if v_old.id is not null then
      select * into v_pr from public.produtos where id = k::bigint;
      v_desc := v_desc || format('incluiu %s (%s %s)', v_pr.descricao, public._fmt(v::numeric),
                                 case when v_pr.categoria = 'embalagem' then 'por unidade produzida' else public._un(v_pr.unidade_estoque, v::numeric) end);
    end if;
  end loop;
  if coalesce(array_length(v_desc, 1), 0) > 0 then
    insert into public.fichas_historico (ficha_id, usuario_id, descricao)
    values (v_id, auth.uid(), array_to_string(v_desc, '; '));
  end if;
  perform public._mistura_da_ficha(v_id);
  return v_id;
end $$;

-- produto intermediário "Mistura – receita" (o balde da pesagem): criado sozinho
create or replace function public._mistura_da_ficha(p_ficha bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; f public.fichas_tecnicas;
begin
  select id into v_id from public.produtos where ficha_id = p_ficha and categoria = 'intermediario';
  select * into f from public.fichas_tecnicas where id = p_ficha;
  if v_id is not null then
    update public.produtos set descricao = 'Mistura – ' || f.nome, ativo = f.ativo
     where id = v_id and (descricao <> 'Mistura – ' || f.nome or ativo <> f.ativo);
    return v_id;
  end if;
  insert into public.produtos (codigo, descricao, categoria, grupo, unidade_estoque, controla_estoque, baixa_producao, baixa_requisicao,
                               local_padrao_id, ficha_id, ativo, observacao)
  values ('MIS-' || f.codigo, 'Mistura – ' || f.nome, 'intermediario', 'Mistura', 'un', true, true, false,
          public._local_tipo('pesagem'), p_ficha, f.ativo, 'Produto intermediário: 1 un = 1 receita pesada (balde). Criado pelo sistema.')
  on conflict (codigo) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.produtos where codigo = 'MIS-' || f.codigo; end if;
  return v_id;
end $$;

-- misturas das fichas que já existem
do $$ declare r record; begin
  for r in select id from public.fichas_tecnicas loop perform public._mistura_da_ficha(r.id); end loop;
end $$;

-- ---------------------------------------------------------------------
-- 14. RECEBIMENTO: local de entrada e 2ª medida (bobinas)
-- ---------------------------------------------------------------------
create or replace function public.registrar_recebimento(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_ped public.pedidos; v_pi public.pedido_itens; v_prod public.produtos; v_rec bigint; it jsonb;
  v_qbase numeric; v_custo numeric; v_fator numeric; v_fpi numeric; v_pend numeric; v_base_ped numeric;
  v_preco_base numeric; v_n int := 0; v_det text[] := '{}'; v_ids bigint[] := '{}'; r record;
  v_pedido bigint := (p->>'pedido_id')::bigint;
  v_encerrar boolean := coalesce((p->>'encerrar_pendente')::boolean, false);
begin
  perform public._exigir('recebimento');
  if v_pedido is not null then
    select * into v_ped from public.pedidos where id = v_pedido for update;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if v_ped.status not in ('aberto','parcial') then
      raise exception 'Pedido PC-% está % e não aceita recebimento.', lpad(v_pedido::text,6,'0'), v_ped.status;
    end if;
  end if;

  insert into public.recebimentos (pedido_id, fornecedor_id, nota_fiscal, observacao, usuario_id, comprador_avisado)
  values (v_pedido, coalesce(v_ped.fornecedor_id, (p->>'fornecedor_id')::bigint),
          public._texto(p,'nota_fiscal'), public._texto(p,'observacao'), auth.uid(),
          coalesce((p->>'comprador_avisado')::boolean, false))
  returning id into v_rec;

  for it in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    if coalesce((it->>'quantidade')::numeric, 0) < 0 then
      raise exception 'Quantidade recebida não pode ser negativa.';
    end if;
    select * into v_prod from public.produtos where id = (it->>'produto_id')::bigint;
    v_fator := public._fator(v_prod.id, it->>'unidade');
    v_qbase := coalesce((it->>'quantidade')::numeric, 0) * v_fator;
    v_custo := null;
    if it->>'pedido_item_id' is not null then
      select * into v_pi from public.pedido_itens
       where id = (it->>'pedido_item_id')::bigint and pedido_id = v_pedido for update;
      if not found then raise exception 'Item não pertence ao pedido.'; end if;
      v_ids := v_ids || v_pi.id;
      v_fpi := public._fator(v_pi.produto_id, v_pi.unidade);
      v_pend := greatest(v_pi.quantidade_base - v_pi.qtd_recebida_base, 0);
      if v_qbase > v_pend + 0.0001 then
        v_det := v_det || format('%s: veio A MAIS — pedido %s %s, recebido no total %s %s (+%s)', v_prod.descricao,
          public._fmt(v_pi.quantidade), public._un(v_pi.unidade, v_pi.quantidade),
          public._fmt((v_pi.qtd_recebida_base + v_qbase) / v_fpi), public._un(v_pi.unidade, (v_pi.qtd_recebida_base + v_qbase) / v_fpi),
          public._fmt((v_pi.qtd_recebida_base + v_qbase - v_pi.quantidade_base) / v_fpi));
      elsif v_qbase < v_pend - 0.0001 and v_encerrar then
        v_det := v_det || format('%s: veio A MENOS — pedido %s %s, recebido no total %s %s (−%s); o restante não virá', v_prod.descricao,
          public._fmt(v_pi.quantidade), public._un(v_pi.unidade, v_pi.quantidade),
          public._fmt((v_pi.qtd_recebida_base + v_qbase) / v_fpi), public._un(v_pi.unidade, (v_pi.qtd_recebida_base + v_qbase) / v_fpi),
          public._fmt((v_pi.quantidade_base - v_pi.qtd_recebida_base - v_qbase) / v_fpi));
      end if;
      v_base_ped := case when v_pi.quantidade_base > 0 then v_pi.valor_total / v_pi.quantidade_base end;
      v_custo := v_base_ped;
      if (it->>'preco_nota') is not null then
        v_preco_base := (it->>'preco_nota')::numeric / v_fator;
        if abs(v_preco_base * v_fpi - v_pi.preco_unitario) >= 0.005 then
          v_det := v_det || format('%s: PREÇO diferente — pedido R$ %s por %s, nota R$ %s por %s', v_prod.descricao,
            public._fmt2(v_pi.preco_unitario), v_pi.unidade, public._fmt2(v_preco_base * v_fpi), v_pi.unidade);
          v_custo := v_preco_base;
        end if;
      end if;
      if v_qbase = 0 then continue; end if;
      update public.pedido_itens set qtd_recebida_base = qtd_recebida_base + v_qbase where id = v_pi.id;
    else
      if v_qbase = 0 then continue; end if;
      if v_pedido is not null then
        v_det := v_det || format('%s: item FORA do pedido (%s %s)', v_prod.descricao, public._fmt((it->>'quantidade')::numeric),
          public._un(it->>'unidade', (it->>'quantidade')::numeric));
      end if;
      if coalesce(it->>'preco_nota', it->>'custo_unitario') is not null then
        v_custo := coalesce(it->>'preco_nota', it->>'custo_unitario')::numeric / v_fator;
      end if;
    end if;
    if (it->>'qtd2') is not null and (it->>'qtd2')::numeric < 0 then raise exception 'Nº de % não pode ser negativo.', coalesce(v_prod.unidade2,'volumes'); end if;
    perform public._movimentar(v_prod.id, 'entrada', v_qbase, v_custo,
      jsonb_build_object('recebimento_id', v_rec, 'pedido_item_id', (it->>'pedido_item_id')::bigint,
                         'qtd_informada', (it->>'quantidade')::numeric, 'unidade_informada', it->>'unidade',
                         'observacao', it->>'observacao', 'local_id', (it->>'local_id')::bigint,
                         'qtd2', (it->>'qtd2')::numeric));
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then raise exception 'Nenhuma quantidade recebida foi informada.'; end if;

  if v_pedido is null then
    select array_agg(format('%s: %s %s', pr.descricao, public._fmt(m.qtd_informada), public._un(m.unidade_informada, m.qtd_informada)) order by m.id)
      into v_det from public.movimentos m join public.produtos pr on pr.id = m.produto_id where m.recebimento_id = v_rec;
    v_det := array['Recebido SEM PEDIDO de compra — ' || coalesce(array_to_string(v_det, '; '), 'itens sem controle de estoque')];
  end if;

  if v_pedido is not null then
    if v_encerrar then
      for r in select pi.*, pr.descricao from public.pedido_itens pi join public.produtos pr on pr.id = pi.produto_id
                where pi.pedido_id = v_pedido and not (pi.id = any(v_ids))
                  and pi.qtd_recebida_base < pi.quantidade_base - 0.0001 loop
        v_det := v_det || format('%s: NÃO VEIO — faltam %s %s; o restante não virá', r.descricao,
          public._fmt((r.quantidade_base - r.qtd_recebida_base) / public._fator(r.produto_id, r.unidade)),
          public._un(r.unidade, (r.quantidade_base - r.qtd_recebida_base) / public._fator(r.produto_id, r.unidade)));
      end loop;
    end if;
    if v_encerrar and exists (select 1 from public.pedido_itens where pedido_id = v_pedido
                              and qtd_recebida_base < quantidade_base - 0.0001) then
      update public.pedidos set status = 'encerrado',
             motivo_cancelamento = 'Encerrado no recebimento: entrega menor que o pedido (o restante não virá).'
       where id = v_pedido;
    else
      perform public._atualizar_status_pedido(v_pedido);
    end if;
  end if;

  if coalesce(array_length(v_det, 1), 0) > 0 then
    if public._texto(p,'observacao') is null then
      raise exception 'Recebimento com divergência: escreva a ressalva (o que aconteceu e com quem foi combinado).';
    end if;
    update public.recebimentos set divergencia = true, divergencia_detalhe = array_to_string(v_det, E'\n') where id = v_rec;
  end if;
  return v_rec;
end $$;

-- ---------------------------------------------------------------------
-- 15. SAÍDAS (avulsa e almoxarifado) com local; avulsa sempre permitida
-- ---------------------------------------------------------------------
create or replace function public.registrar_saida(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_tipo text := p->>'tipo'; itj jsonb; v_q numeric; v_n int := 0; v_local bigint := (p->>'local_id')::bigint;
        v_oper bigint := (p->>'operador_id')::bigint;
begin
  if v_tipo not in ('saida_avulsa','saida_almox') then raise exception 'Tipo de saída inválido.'; end if;
  perform public._exigir(v_tipo);
  if v_local is not null then perform public._exigir_local(v_local); end if;
  if v_oper is not null and not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  if v_tipo = 'saida_avulsa' and public._texto(p,'observacao') is null and public._texto(p,'motivo') is null then
    raise exception 'Na saída avulsa informe o motivo.';
  end if;
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    v_q := coalesce((itj->>'quantidade')::numeric, 0) * public._fator((itj->>'produto_id')::bigint, itj->>'unidade');
    if v_q < 0 then raise exception 'Quantidade não pode ser negativa.'; end if;
    if v_q = 0 then continue; end if;
    perform public._movimentar((itj->>'produto_id')::bigint, v_tipo, -v_q, null,
      jsonb_build_object('qtd_informada', (itj->>'quantidade')::numeric, 'unidade_informada', itj->>'unidade',
                         'observacao', coalesce(public._texto(itj,'observacao'), public._texto(p,'observacao')),
                         'destino', public._texto(p,'destino'), 'motivo', public._texto(p,'motivo'),
                         'local_id', coalesce(v_local, (itj->>'local_id')::bigint), 'operador_id', v_oper));
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhuma quantidade informada.'; end if;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- 16. INVENTÁRIO por local (conta o que está fisicamente no local)
-- ---------------------------------------------------------------------
create or replace function public.registrar_inventario(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_inv bigint; itj jsonb; v public.produtos; v_cont numeric; v_dif numeric; v_n int := 0;
        v_local bigint; v_fis numeric;
begin
  perform public._exigir('inventario');
  insert into public.inventarios (observacao, usuario_id)
  values (public._texto(p,'observacao'), auth.uid()) returning id into v_inv;

  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    if (itj->>'contado') is null then continue; end if;
    select * into v from public.produtos where id = (itj->>'produto_id')::bigint for update;
    if not found then raise exception 'Produto não encontrado.'; end if;
    v_local := coalesce((itj->>'local_id')::bigint, (p->>'local_id')::bigint, v.local_padrao_id, public._local_tipo('almoxarifado'));
    select coalesce(sum(disponivel + separado), 0) into v_fis from public.estoque_local where produto_id = v.id and local_id = v_local;
    v_cont := (itj->>'contado')::numeric * public._fator(v.id, itj->>'unidade');
    if v_cont < 0 then raise exception 'Quantidade contada não pode ser negativa (%).', v.codigo; end if;
    v_dif := round(v_cont - v_fis, 4);
    if v_dif <> 0 and public._texto(itj,'motivo') is null then
      raise exception 'Informe o motivo da diferença do item % (%).', v.codigo, v.descricao;
    end if;
    if public._texto(itj,'motivo') = 'outros' and public._texto(itj,'observacao') is null then
      raise exception 'Motivo "outros": escreva a observação do item % (%).', v.codigo, v.descricao;
    end if;
    insert into public.inventario_itens (inventario_id, produto_id, saldo_sistema, contado, diferenca, motivo, observacao)
    values (v_inv, v.id, v_fis, v_cont, v_dif,
            case when v_dif <> 0 then public._texto(itj,'motivo') end, public._texto(itj,'observacao'));
    if v_dif <> 0 then
      perform public._movimentar(v.id, 'inventario', v_dif, null,
        jsonb_build_object('inventario_id', v_inv, 'motivo', public._texto(itj,'motivo'),
                           'observacao', public._texto(itj,'observacao'), 'local_id', v_local,
                           'qtd_informada', (itj->>'contado')::numeric, 'unidade_informada', itj->>'unidade'));
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhum item contado.'; end if;
  return v_inv;
end $$;

-- correção usa o mesmo local do lançamento original
create or replace function public.corrigir_movimento(p_id bigint, p_quantidade_correta numeric,
                                                     p_unidade text, p_motivo text)
returns bigint language plpgsql security definer set search_path = public as $$
declare o public.movimentos; v_prod public.produtos; v_efetiva numeric; v_nova numeric; v_delta numeric;
        v_custo numeric; v_novo bigint; v_proprio boolean;
begin
  if not public.usuario_ativo() then raise exception 'Usuário inativo.' using errcode = '42501'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Informe o motivo da correção.'; end if;
  select * into o from public.movimentos where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if o.tipo = 'correcao' then raise exception 'Corrija o lançamento original, não a correção.'; end if;
  if o.tipo in ('transferencia','entrada_producao') or o.batelada_id is not null then
    raise exception 'Este lançamento é automático (transferência ou produção): corrija pela própria tela de origem.';
  end if;

  v_proprio := o.usuario_id = auth.uid()
               and (o.data_hora at time zone 'America/Sao_Paulo')::date = public._hoje()
               and o.tipo in ('entrada','saida_receita','saida_avulsa','saida_almox','consumo');
  if o.tipo in ('implantacao','inventario') then
    if not ('admin' = any(public.meus_papeis())) then
      raise exception 'Só o administrador corrige implantação de saldo e inventário.' using errcode = '42501';
    end if;
  elsif not (public.pode('corrigir') or v_proprio) then
    raise exception 'Sem permissão: você só pode corrigir os seus próprios lançamentos do dia.' using errcode = '42501';
  end if;

  if p_quantidade_correta is null or p_quantidade_correta < 0 then
    raise exception 'Informe a quantidade correta (zero se o lançamento não deveria existir).';
  end if;
  select * into v_prod from public.produtos where id = o.produto_id;
  select o.quantidade + coalesce(sum(c.quantidade), 0) into v_efetiva
    from public.movimentos c where c.corrige_id = o.id;
  v_nova := sign(o.quantidade) * p_quantidade_correta * public._fator(o.produto_id, p_unidade);
  v_delta := round(v_nova - v_efetiva, 4);
  if v_delta = 0 then raise exception 'A quantidade informada é igual à atual; nada a corrigir.'; end if;

  v_custo := case when o.quantidade > 0 then o.custo_unitario end;
  v_novo := public._movimentar(o.produto_id, 'correcao', v_delta, v_custo,
    jsonb_build_object('corrige_id', o.id, 'motivo', btrim(p_motivo), 'local_id', o.local_id,
      'observacao', format('Corrige lançamento #%s: de %s para %s %s', o.id,
                           public._fmt(abs(v_efetiva)), public._fmt(abs(v_nova)), public._un(v_prod.unidade_estoque, abs(v_nova)))));

  if o.pedido_item_id is not null then
    update public.pedido_itens set qtd_recebida_base = greatest(qtd_recebida_base + v_delta, 0)
     where id = o.pedido_item_id;
    perform public._atualizar_status_pedido((select pedido_id from public.pedido_itens where id = o.pedido_item_id));
  end if;
  return v_novo;
end $$;

-- ---------------------------------------------------------------------
-- 17. TRANSFERÊNCIAS
--   criar_transferencia(p): {origem_id, destino_id, itens:[{produto_id, quantidade, unidade?, qtd2?, programacao_id?, requisicao_item_id?}],
--                            enviar?: bool, observacao?, requisicao_id?, anexo?: {nome, tipo, conteudo}}
--   separar → sai do disponível e fica "separado" na origem; enviar → sai da origem (em trânsito)
-- ---------------------------------------------------------------------
create or replace function public.criar_transferencia(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_org bigint := (p->>'origem_id')::bigint; v_dst bigint := (p->>'destino_id')::bigint;
        itj jsonb; v_q numeric; v_n int := 0; v_anexo bigint; v_req bigint := (p->>'requisicao_id')::bigint;
        v_oper bigint := (p->>'operador_id')::bigint; v_prod public.produtos;
begin
  perform public._exigir_local(v_org);
  if v_dst is null or not exists (select 1 from public.locais where id = v_dst and ativo) then raise exception 'Escolha o local de destino.'; end if;
  if v_org = v_dst then raise exception 'Origem e destino precisam ser diferentes.'; end if;
  if v_oper is not null and not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  if p->'anexo' is not null and public._texto(p->'anexo','conteudo') is not null then
    if length(p->'anexo'->>'conteudo') > 4500000 then raise exception 'Anexo muito grande (máximo ~3 MB).'; end if;
    insert into public.anexos (nome, tipo, conteudo) values (coalesce(public._texto(p->'anexo','nome'),'anexo'), public._texto(p->'anexo','tipo'), p->'anexo'->>'conteudo')
    returning id into v_anexo;
  end if;
  insert into public.transferencias (origem_id, destino_id, situacao, requisicao_id, observacao, anexo_id, separado_por, operador_id)
  values (v_org, v_dst, 'separada', v_req, public._texto(p,'observacao'), v_anexo, auth.uid(), v_oper)
  returning id into v_id;
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    select * into v_prod from public.produtos where id = (itj->>'produto_id')::bigint;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if not v_prod.controla_estoque then raise exception '% não controla estoque e não pode ser transferido.', v_prod.descricao; end if;
    v_q := coalesce((itj->>'quantidade')::numeric, 0) * public._fator(v_prod.id, coalesce(itj->>'unidade', v_prod.unidade_estoque));
    if v_q < 0 then raise exception 'Quantidade não pode ser negativa.'; end if;
    if v_q = 0 then continue; end if;
    insert into public.transferencia_itens (transferencia_id, produto_id, quantidade, qtd2, requisicao_item_id, programacao_id)
    values (v_id, v_prod.id, v_q, (itj->>'qtd2')::numeric, (itj->>'requisicao_item_id')::bigint, (itj->>'programacao_id')::bigint);
    perform public._mov_local(v_prod.id, v_org, -v_q, v_q, -(itj->>'qtd2')::numeric, (itj->>'qtd2')::numeric,
      jsonb_build_object('transferencia_id', v_id, 'etapa', 'separacao', 'requisicao_id', v_req, 'operador_id', v_oper,
                         'programacao_id', (itj->>'programacao_id')::bigint,
                         'observacao', format('Separado para %s', public._nome_local(v_dst))));
    if (itj->>'requisicao_item_id') is not null then
      update public.requisicao_itens set atendido = atendido + v_q where id = (itj->>'requisicao_item_id')::bigint;
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhuma quantidade informada.'; end if;
  if v_req is not null then perform public._situacao_requisicao(v_req); end if;
  if coalesce((p->>'enviar')::boolean, false) then perform public.enviar_transferencia(v_id); end if;
  return v_id;
end $$;

create or replace function public.enviar_transferencia(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare t public.transferencias; it record;
begin
  select * into t from public.transferencias where id = p_id for update;
  if not found then raise exception 'Transferência não encontrada.'; end if;
  perform public._exigir_local(t.origem_id);
  if t.situacao <> 'separada' then raise exception 'Só dá para enviar uma transferência separada (esta está %).', t.situacao; end if;
  for it in select * from public.transferencia_itens where transferencia_id = p_id loop
    perform public._mov_local(it.produto_id, t.origem_id, 0, -it.quantidade, 0, -it.qtd2,
      jsonb_build_object('transferencia_id', p_id, 'etapa', 'envio', 'requisicao_id', t.requisicao_id, 'programacao_id', it.programacao_id,
                         'observacao', format('Enviado para %s', public._nome_local(t.destino_id))));
  end loop;
  update public.transferencias set situacao = 'enviada', enviado_por = auth.uid(), enviado_em = now() where id = p_id;
end $$;

create or replace function public.cancelar_transferencia(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
-- enviada → volta para separada · separada → volta para o disponível (cancelada)
declare t public.transferencias; it record;
begin
  select * into t from public.transferencias where id = p_id for update;
  if not found then raise exception 'Transferência não encontrada.'; end if;
  perform public._exigir_local(t.origem_id);
  if nullif(btrim(coalesce(p_motivo,'')), '') is null then raise exception 'Informe o motivo do cancelamento.'; end if;
  if t.situacao = 'enviada' then
    for it in select * from public.transferencia_itens where transferencia_id = p_id loop
      perform public._mov_local(it.produto_id, t.origem_id, 0, it.quantidade, 0, it.qtd2,
        jsonb_build_object('transferencia_id', p_id, 'etapa', 'cancelamento_envio', 'motivo', btrim(p_motivo), 'programacao_id', it.programacao_id,
                           'observacao', 'Envio cancelado: voltou para separado'));
    end loop;
    update public.transferencias set situacao = 'separada', enviado_por = null, enviado_em = null,
           observacao = left(concat_ws(' | ', observacao, 'Envio cancelado: ' || btrim(p_motivo)), 2000) where id = p_id;
  elsif t.situacao = 'separada' then
    for it in select * from public.transferencia_itens where transferencia_id = p_id loop
      perform public._mov_local(it.produto_id, t.origem_id, it.quantidade, -it.quantidade, it.qtd2, -it.qtd2,
        jsonb_build_object('transferencia_id', p_id, 'etapa', 'cancelamento_separacao', 'motivo', btrim(p_motivo), 'programacao_id', it.programacao_id,
                           'observacao', 'Separação cancelada: voltou para o disponível'));
      if it.requisicao_item_id is not null then
        update public.requisicao_itens set atendido = greatest(atendido - it.quantidade, 0) where id = it.requisicao_item_id;
      end if;
    end loop;
    update public.transferencias set situacao = 'cancelada', cancelado_por = auth.uid(), cancelado_em = now(), cancelado_motivo = btrim(p_motivo)
     where id = p_id;
    if t.requisicao_id is not null then perform public._situacao_requisicao(t.requisicao_id); end if;
  else
    raise exception 'Esta transferência já está % e não pode ser cancelada.', t.situacao;
  end if;
end $$;

-- receber: p {id, itens?:[{item_id, recebido, qtd2?}], observacao?, operador_id?, pin?}
-- sem itens = recebe tudo. Diferença (chegou menos) volta para a origem como "separado" (nova transferência separada)
create or replace function public.receber_transferencia(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare t public.transferencias; it record; v_rec numeric; v_q2 numeric; v_dif numeric; v_nova bigint; v_tem_dif boolean := false;
        v_oper bigint := (p->>'operador_id')::bigint; v_j jsonb;
begin
  select * into t from public.transferencias where id = (p->>'id')::bigint for update;
  if not found then raise exception 'Transferência não encontrada.'; end if;
  perform public._exigir_local(t.destino_id);
  if v_oper is not null and not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  if t.situacao <> 'enviada' then raise exception 'Esta transferência está % (só dá para receber o que foi enviado).', t.situacao; end if;
  for it in select * from public.transferencia_itens where transferencia_id = t.id loop
    select x into v_j from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) x where (x->>'item_id')::bigint = it.id;
    v_rec := coalesce((v_j->>'recebido')::numeric, it.quantidade);
    v_q2 := coalesce((v_j->>'qtd2')::numeric, it.qtd2);
    if v_rec < 0 then raise exception 'Quantidade recebida não pode ser negativa.'; end if;
    if v_rec > it.quantidade + 0.0001 then raise exception 'Recebido maior que o enviado: confira (para sobras, use ajuste no destino).'; end if;
    update public.transferencia_itens set recebido = v_rec, qtd2_recebido = v_q2 where id = it.id;
    if v_rec > 0 then
      perform public._mov_local(it.produto_id, t.destino_id, v_rec, 0, v_q2, 0,
        jsonb_build_object('transferencia_id', t.id, 'etapa', 'recebimento', 'requisicao_id', t.requisicao_id, 'operador_id', v_oper,
                           'programacao_id', it.programacao_id,
                           'observacao', format('Recebido de %s', public._nome_local(t.origem_id))));
    end if;
    v_dif := round(it.quantidade - v_rec, 4);
    if v_dif > 0 then
      if not v_tem_dif then
        insert into public.transferencias (origem_id, destino_id, situacao, requisicao_id, anterior_id, observacao, separado_por)
        values (t.origem_id, t.destino_id, 'separada', t.requisicao_id, t.id,
                format('Diferença do recebimento da transferência nº %s: voltou para separado na origem (enviar de novo ou cancelar).', t.id), auth.uid())
        returning id into v_nova;
        v_tem_dif := true;
      end if;
      insert into public.transferencia_itens (transferencia_id, produto_id, quantidade, qtd2, requisicao_item_id, programacao_id)
      values (v_nova, it.produto_id, v_dif, case when it.qtd2 is not null then greatest(it.qtd2 - coalesce(v_q2,0), 0) end,
              it.requisicao_item_id, it.programacao_id);
      perform public._mov_local(it.produto_id, t.origem_id, 0, v_dif, 0, case when it.qtd2 is not null then greatest(it.qtd2 - coalesce(v_q2,0), 0) end,
        jsonb_build_object('transferencia_id', v_nova, 'etapa', 'diferenca_volta', 'programacao_id', it.programacao_id,
                           'observacao', format('Diferença do recebimento nº %s voltou para separado', t.id)));
    end if;
  end loop;
  if v_tem_dif and public._texto(p,'observacao') is null then
    raise exception 'Chegou menos do que foi enviado: escreva uma observação (o que aconteceu).';
  end if;
  update public.transferencias set situacao = 'recebida', recebido_por = auth.uid(), recebido_em = now(),
         recebido_obs = public._texto(p,'observacao'), operador_id = coalesce(v_oper, operador_id)
   where id = t.id;
  return v_nova;
end $$;

-- ---------------------------------------------------------------------
-- 18. REQUISIÇÕES (embalagens agora; outras áreas no futuro)
-- ---------------------------------------------------------------------
create or replace function public._situacao_requisicao(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_tot int; v_ok int; v_alg int; v_sit text;
begin
  select situacao into v_sit from public.requisicoes where id = p_id;
  if v_sit in ('encerrada','cancelada') then return; end if;
  select count(*), count(*) filter (where atendido >= quantidade - 0.0005), count(*) filter (where atendido > 0)
    into v_tot, v_ok, v_alg from public.requisicao_itens where requisicao_id = p_id;
  update public.requisicoes set situacao = case when v_tot > 0 and v_ok = v_tot then 'atendida'
                                                 when v_alg > 0 then 'parcial' else 'pendente' end
   where id = p_id;
end $$;

create or replace function public.criar_requisicao(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; itj jsonb; v_q numeric; v_n int := 0; v_prod public.produtos;
        v_org bigint := coalesce((p->>'origem_id')::bigint, public._local_tipo('almoxarifado'));
        v_dst bigint := coalesce((p->>'destino_id')::bigint, public._local_tipo('pcp'));
begin
  perform public._exigir('requisicao');
  if v_org is null or v_dst is null or v_org = v_dst then raise exception 'Escolha de onde sai e para onde vai o material.'; end if;
  insert into public.requisicoes (origem_id, destino_id, observacao) values (v_org, v_dst, public._texto(p,'observacao'))
  returning id into v_id;
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    select * into v_prod from public.produtos where id = (itj->>'produto_id')::bigint;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if not (v_prod.controla_estoque and v_prod.baixa_requisicao) then
      raise exception '% não é baixado por requisição (veja o cadastro do produto).', v_prod.descricao;
    end if;
    v_q := coalesce((itj->>'quantidade')::numeric, 0) * public._fator(v_prod.id, coalesce(itj->>'unidade', v_prod.unidade_estoque));
    if v_q <= 0 then continue; end if;
    insert into public.requisicao_itens (requisicao_id, produto_id, quantidade, qtd2)
    values (v_id, v_prod.id, v_q, (itj->>'qtd2')::numeric);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Adicione pelo menos um item com quantidade.'; end if;
  return v_id;
end $$;

create or replace function public.cancelar_requisicao(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requisicoes;
begin
  select * into r from public.requisicoes where id = p_id for update;
  if not found then raise exception 'Requisição não encontrada.'; end if;
  if not (public.pode('requisicao') or public._opera_local(r.origem_id)) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_motivo,'')), '') is null then raise exception 'Informe o motivo.'; end if;
  if r.situacao in ('atendida','encerrada','cancelada') then raise exception 'Esta requisição já está %.', r.situacao; end if;
  if exists (select 1 from public.requisicao_itens where requisicao_id = p_id and atendido > 0) then
    -- já teve atendimento: encerra o que falta
    update public.requisicoes set situacao = 'encerrada', encerrada_em = now(), encerrada_por = auth.uid(), encerrada_motivo = btrim(p_motivo) where id = p_id;
  else
    update public.requisicoes set situacao = 'cancelada', encerrada_em = now(), encerrada_por = auth.uid(), encerrada_motivo = btrim(p_motivo) where id = p_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 19. CONSUMO NO SETOR (baixa manual: ex.: bobinas no PCP)
--   p {local_id, itens:[{produto_id, quantidade?, unidade?, qtd2?}], observacao?}
--   qtd2 sem quantidade = consumo por bobina: converte pela média das bobinas do local
-- ---------------------------------------------------------------------
create or replace function public.registrar_consumo(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare itj jsonb; v_q numeric; v_q2 numeric; v_n int := 0; v_local bigint := (p->>'local_id')::bigint; e public.estoque_local;
        v_prod public.produtos; v_oper bigint := (p->>'operador_id')::bigint;
begin
  perform public._exigir('consumo');
  if v_local is null then raise exception 'Escolha o local.'; end if;
  perform public._exigir_local(v_local);
  if v_oper is not null and not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    select * into v_prod from public.produtos where id = (itj->>'produto_id')::bigint;
    if not found then raise exception 'Produto não encontrado.'; end if;
    select * into e from public.estoque_local where produto_id = v_prod.id and local_id = v_local;
    v_q2 := (itj->>'qtd2')::numeric;
    if (itj->>'quantidade') is not null then
      v_q := (itj->>'quantidade')::numeric * public._fator(v_prod.id, coalesce(itj->>'unidade', v_prod.unidade_estoque));
    elsif v_q2 is not null and v_q2 > 0 then
      if coalesce(e.qtd2_disponivel, 0) <= 0 then raise exception 'Não há % de % neste local para converter.', coalesce(v_prod.unidade2,'volumes'), v_prod.descricao; end if;
      v_q := case when v_q2 >= e.qtd2_disponivel - 0.0001 then e.disponivel       -- última(s): leva todo o resto
                  else round(e.disponivel / e.qtd2_disponivel * v_q2, 4) end;
    else
      continue;
    end if;
    if v_q <= 0 then continue; end if;
    perform public._movimentar(v_prod.id, 'consumo', -v_q, null,
      jsonb_build_object('local_id', v_local, 'qtd2', case when v_q2 is not null then -v_q2 end, 'operador_id', v_oper,
                         'qtd_informada', coalesce((itj->>'quantidade')::numeric, v_q2),
                         'unidade_informada', case when (itj->>'quantidade') is not null then coalesce(itj->>'unidade', v_prod.unidade_estoque) else v_prod.unidade2 end,
                         'observacao', coalesce(public._texto(itj,'observacao'), public._texto(p,'observacao'))));
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhuma quantidade informada.'; end if;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- 20. PESAGEM: baixa só os itens da pesagem e gera a MISTURA
--   p {ficha_id?, programacao_id?, multiplicador, alterada?, itens?, observacao?, enviar?: bool (manda para Produção Maceiras)}
-- ---------------------------------------------------------------------
create or replace function public.registrar_producao(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_prod bigint; v_mult numeric := (p->>'multiplicador')::numeric;
        v_alt boolean := coalesce((p->>'alterada')::boolean, false); it record; itj jsonb; v_q numeric;
        v_itens jsonb := p->'itens'; v_ficha bigint := (p->>'ficha_id')::bigint;
        v_progid bigint := (p->>'programacao_id')::bigint; v_prog public.programacoes;
        v_pes bigint := public._local_tipo('pesagem'); v_mac bigint := public._local_tipo('maceiras');
        v_mis bigint; v_custo numeric := 0; v_pr public.produtos; v_mov bigint;
begin
  perform public._exigir('saida_receita');
  if coalesce(v_mult, 0) <= 0 then raise exception 'Informe quantas receitas foram pesadas.'; end if;
  if v_progid is not null then
    select * into v_prog from public.programacoes where id = v_progid for update;
    if not found or v_prog.situacao <> 'ativa' then raise exception 'Programação não encontrada ou cancelada.'; end if;
    if v_prog.finalizada_em is not null then raise exception 'Esta programação já foi finalizada pela engenharia; lance como pesagem fora da programação.'; end if;
    if v_ficha is null then v_ficha := v_prog.ficha_id; end if;
    if v_ficha <> v_prog.ficha_id then raise exception 'A receita não confere com a programação.'; end if;
    if not v_alt and v_prog.itens_alterados is not null then v_alt := true; v_itens := v_prog.itens_alterados; end if;
  end if;
  if not exists (select 1 from public.fichas_tecnicas where id = v_ficha and ativo) then
    raise exception 'Ficha técnica não encontrada ou inativa.';
  end if;
  insert into public.producoes (ficha_id, multiplicador, alterada, observacao, programacao_id, usuario_id, local_id)
  values (v_ficha, v_mult, v_alt, public._texto(p,'observacao'), v_progid, auth.uid(), v_pes)
  returning id into v_prod;

  -- só os itens da PESAGEM (pós); farinha e fermento ficam para a maceira; embalagem não baixa aqui
  if not v_alt then
    for it in select fi.produto_id, fi.quantidade from public.ficha_itens fi join public.produtos pr on pr.id = fi.produto_id
               where fi.ficha_id = v_ficha and pr.categoria = 'materia_prima' and coalesce(pr.usado_na,'pesagem') = 'pesagem'
                 and pr.baixa_producao and pr.controla_estoque loop
      v_mov := public._movimentar(it.produto_id, 'saida_receita', -(it.quantidade * v_mult), null,
        jsonb_build_object('producao_id', v_prod, 'local_id', v_pes, 'programacao_id', v_progid));
      v_custo := v_custo + coalesce((select -valor from public.movimentos where id = v_mov), 0);
    end loop;
  else
    if jsonb_array_length(coalesce(v_itens,'[]'::jsonb)) = 0 then
      raise exception 'A receita alterada precisa de pelo menos 1 ingrediente.';
    end if;
    for itj in select * from jsonb_array_elements(v_itens) loop
      select * into v_pr from public.produtos where id = (itj->>'produto_id')::bigint;
      if v_pr.categoria <> 'materia_prima' then raise exception 'Pesagem só aceita matéria-prima.'; end if;
      if coalesce(v_pr.usado_na,'pesagem') <> 'pesagem' or not v_pr.baixa_producao or not v_pr.controla_estoque then continue; end if;
      v_q := coalesce((itj->>'quantidade')::numeric, 0) * public._fator(v_pr.id, itj->>'unidade') * v_mult;
      if v_q > 0 then
        v_mov := public._movimentar(v_pr.id, 'saida_receita', -v_q, null,
          jsonb_build_object('producao_id', v_prod, 'local_id', v_pes, 'programacao_id', v_progid));
        v_custo := v_custo + coalesce((select -valor from public.movimentos where id = v_mov), 0);
      end if;
    end loop;
  end if;

  -- entra a mistura (1 por receita) na Pesagem, com o custo dos pós
  v_mis := public._mistura_da_ficha(v_ficha);
  perform public._movimentar(v_mis, 'entrada_producao', v_mult, v_custo / v_mult,
    jsonb_build_object('producao_id', v_prod, 'local_id', v_pes, 'programacao_id', v_progid,
                       'observacao', 'Mistura pesada'));

  if coalesce((p->>'enviar')::boolean, false) and v_mac is not null then
    perform public.criar_transferencia(jsonb_build_object('origem_id', v_pes, 'destino_id', v_mac, 'enviar', true,
      'observacao', 'Misturas da pesagem',
      'itens', jsonb_build_array(jsonb_build_object('produto_id', v_mis, 'quantidade', v_mult, 'programacao_id', v_progid))));
  end if;
  return v_prod;
end $$;

-- ---------------------------------------------------------------------
-- 21. PROGRAMAÇÃO: maceira, padeiro sugerido, prioridade, dividir, reordenar
-- ---------------------------------------------------------------------
create or replace function public.salvar_programacao(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := (p->>'id')::bigint; v_old public.programacoes; v_feito numeric := 0;
        v_qtd numeric := (p->>'quantidade')::numeric; v_data date := (p->>'data')::date;
        v_ficha bigint := (p->>'ficha_id')::bigint; v_itens jsonb := null; itj jsonb;
        v_mac bigint := (p->>'maceira_id')::bigint; v_op bigint := (p->>'operador_id')::bigint; v_pri int := (p->>'prioridade')::int;
begin
  perform public._exigir('programacao');
  if v_data is null then raise exception 'Informe o dia da produção.'; end if;
  if coalesce(v_qtd, 0) <= 0 then raise exception 'Informe quantas receitas programar.'; end if;
  if not exists (select 1 from public.fichas_tecnicas where id = v_ficha and ativo) then
    raise exception 'Receita não encontrada ou inativa.';
  end if;
  if v_mac is null and v_id is null then   -- sugestão: primeira maceira da linha da receita
    select m.id into v_mac from public.maceiras m join public.fichas_tecnicas f on f.id = v_ficha
     where m.ativa and f.linha_id = any(m.linhas) order by m.ordem, m.id limit 1;
  end if;
  if jsonb_array_length(coalesce(p->'itens','[]'::jsonb)) > 0 then
    v_itens := '[]'::jsonb;
    for itj in select * from jsonb_array_elements(p->'itens') loop
      if coalesce((itj->>'quantidade')::numeric, 0) <= 0 then continue; end if;
      if not exists (select 1 from public.produtos where id = (itj->>'produto_id')::bigint and categoria = 'materia_prima') then
        raise exception 'A receita só aceita matéria-prima.';
      end if;
      perform public._fator((itj->>'produto_id')::bigint, itj->>'unidade');
      v_itens := v_itens || jsonb_build_array(jsonb_build_object('produto_id', (itj->>'produto_id')::bigint,
        'quantidade', (itj->>'quantidade')::numeric, 'unidade', itj->>'unidade'));
    end loop;
    if jsonb_array_length(v_itens) = 0 then raise exception 'A receita alterada precisa de pelo menos 1 ingrediente.'; end if;
  end if;

  if v_id is null then
    if v_pri is null then
      select coalesce(max(prioridade), 0) + 1 into v_pri from public.programacoes
       where data = v_data and situacao = 'ativa' and maceira_id is not distinct from v_mac;
    end if;
    insert into public.programacoes (data, ficha_id, quantidade, itens_alterados, observacao, criado_por, atualizado_em, atualizado_por,
                                     maceira_id, operador_id, prioridade)
    values (v_data, v_ficha, v_qtd, v_itens, public._texto(p,'observacao'), auth.uid(), now(), auth.uid(), v_mac, v_op, v_pri)
    returning id into v_id;
    return v_id;
  end if;

  select * into v_old from public.programacoes where id = v_id for update;
  if not found then raise exception 'Programação não encontrada.'; end if;
  if v_old.situacao <> 'ativa' then raise exception 'Esta programação foi cancelada.'; end if;
  if v_old.finalizada_em is not null then raise exception 'Esta programação já foi finalizada.'; end if;
  select coalesce(sum(multiplicador), 0) into v_feito from public.producoes where programacao_id = v_id;
  if v_feito > 0 and (v_data <> v_old.data or v_ficha <> v_old.ficha_id) then
    raise exception 'Já houve pesagem nesta programação: o dia e a receita não podem mudar. Programe o restante em outro dia.';
  end if;
  if v_qtd < v_feito then
    raise exception 'Já foram pesadas % receitas desta programação; a quantidade não pode ficar menor.', public._fmt(v_feito);
  end if;
  update public.programacoes set data = v_data, ficha_id = v_ficha, quantidade = v_qtd, itens_alterados = v_itens,
    observacao = public._texto(p,'observacao'), maceira_id = case when p ? 'maceira_id' then v_mac else maceira_id end,
    operador_id = case when p ? 'operador_id' then v_op else operador_id end, prioridade = coalesce(v_pri, prioridade),
    atualizado_em = now(), atualizado_por = auth.uid()
  where id = v_id;
  return v_id;
end $$;

-- quadro do PCP: p [{id, maceira_id, prioridade, operador_id?}]
create or replace function public.reordenar_programacao(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare itj jsonb; v_n int := 0;
begin
  perform public._exigir('programacao');
  for itj in select * from jsonb_array_elements(coalesce(p,'[]'::jsonb)) loop
    update public.programacoes set maceira_id = (itj->>'maceira_id')::bigint, prioridade = coalesce((itj->>'prioridade')::int, prioridade),
           operador_id = case when itj ? 'operador_id' then (itj->>'operador_id')::bigint else operador_id end,
           atualizado_em = now(), atualizado_por = auth.uid()
     where id = (itj->>'id')::bigint and situacao = 'ativa' and finalizada_em is null;
    v_n := v_n + found::int;
  end loop;
  return v_n;
end $$;

-- divide: tira p_qtd receitas da programação e cria outra na maceira escolhida
create or replace function public.dividir_programacao(p_id bigint, p_qtd numeric, p_maceira bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v public.programacoes; v_feito numeric; v_novo bigint;
begin
  perform public._exigir('programacao');
  select * into v from public.programacoes where id = p_id for update;
  if not found or v.situacao <> 'ativa' or v.finalizada_em is not null then raise exception 'Programação não disponível para dividir.'; end if;
  select coalesce(sum(multiplicador), 0) into v_feito from public.producoes where programacao_id = p_id;
  if coalesce(p_qtd, 0) <= 0 or p_qtd > v.quantidade - v_feito + 0.0001 then
    raise exception 'Dá para dividir no máximo % receitas (as ainda não pesadas).', public._fmt(v.quantidade - v_feito);
  end if;
  if p_qtd >= v.quantidade - 0.0001 then raise exception 'Para mudar tudo de maceira, arraste o cartão em vez de dividir.'; end if;
  update public.programacoes set quantidade = quantidade - p_qtd, atualizado_em = now(), atualizado_por = auth.uid() where id = p_id;
  insert into public.programacoes (data, ficha_id, quantidade, itens_alterados, observacao, criado_por, atualizado_em, atualizado_por,
                                   maceira_id, operador_id, prioridade, origem_id)
  values (v.data, v.ficha_id, p_qtd, v.itens_alterados, v.observacao, auth.uid(), now(), auth.uid(), p_maceira, null,
          (select coalesce(max(prioridade),0)+1 from public.programacoes where data = v.data and maceira_id is not distinct from p_maceira and situacao = 'ativa'),
          p_id)
  returning id into v_novo;
  return v_novo;
end $$;

-- finalizar a programação: agora confere as BATELADAS finalizadas (e não só a pesagem)
create or replace function public.finalizar_programacao(p_id bigint, p_obs text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.programacoes; v_feito numeric; v_abertas int;
begin
  perform public._exigir('programacao');
  select * into v from public.programacoes where id = p_id for update;
  if not found or v.situacao <> 'ativa' then raise exception 'Programação não encontrada ou cancelada.'; end if;
  if v.finalizada_em is not null then raise exception 'Esta programação já foi finalizada.'; end if;
  select count(*) into v_abertas from public.bateladas where programacao_id = p_id and situacao = 'em_producao';
  if v_abertas > 0 then raise exception 'Há % batelada(s) em produção: finalize-as antes de fechar a programação.', v_abertas; end if;
  select greatest(coalesce((select sum(multiplicador) from public.producoes where programacao_id = p_id), 0),
                  coalesce((select count(*) from public.bateladas where programacao_id = p_id and situacao = 'finalizada'), 0))
    into v_feito;
  if v_feito < v.quantidade - 0.0005 and nullif(btrim(coalesce(p_obs,'')), '') is null then
    raise exception 'Foram feitas % de % receitas: explique a diferença na observação.', public._fmt(v_feito), public._fmt(v.quantidade);
  end if;
  update public.programacoes set finalizada_em = now(), finalizada_por = auth.uid(),
    finalizada_obs = nullif(btrim(coalesce(p_obs,'')), ''), atualizado_em = now(), atualizado_por = auth.uid()
  where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 22. BATELADAS (maceira)
--   iniciar_batelada(p): {programacao_id?, ficha_id?, maceira_id, operador_id, pin, itens:[{produto_id, quantidade}], observacao?, receber?: bool}
--   Só inicia se houver MISTURA da receita recebida em Produção Maceiras.
--   Baixa: 1 mistura (Produção Maceiras) + farinha/fermento usados (Depósito Produção ou local do produto)
-- ---------------------------------------------------------------------
create or replace function public.iniciar_batelada(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_b bigint; v_prog public.programacoes; v_ficha bigint := (p->>'ficha_id')::bigint; f public.fichas_tecnicas;
        v_mac bigint := public._local_tipo('maceiras'); v_mis bigint; e numeric; itj jsonb; v_pr public.produtos;
        v_q numeric; v_mov bigint; v_cm numeric := 0; v_cmac numeric := 0; v_oper bigint := (p->>'operador_id')::bigint;
        v_itens jsonb := '[]'::jsonb; v_padrao jsonb; t record; v_det jsonb := '[]'::jsonb; v_local bigint;
begin
  perform public._exigir('batelada');
  if v_oper is null then raise exception 'Escolha quem está batendo.'; end if;
  if not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  if (p->>'programacao_id') is not null then
    select * into v_prog from public.programacoes where id = (p->>'programacao_id')::bigint;
    if not found or v_prog.situacao <> 'ativa' then raise exception 'Programação não encontrada ou cancelada.'; end if;
    if v_prog.finalizada_em is not null then raise exception 'Esta programação já foi finalizada.'; end if;
    v_ficha := v_prog.ficha_id;
  end if;
  select * into f from public.fichas_tecnicas where id = v_ficha;
  if not found then raise exception 'Receita não encontrada.'; end if;
  if (p->>'maceira_id') is null or not exists (select 1 from public.maceiras where id = (p->>'maceira_id')::bigint) then
    raise exception 'Escolha a maceira.'; end if;
  v_mis := public._mistura_da_ficha(v_ficha);

  -- "Receber e iniciar": recebe as misturas desta receita que estão a caminho
  if coalesce((p->>'receber')::boolean, false) then
    for t in select distinct tr.id from public.transferencias tr join public.transferencia_itens ti on ti.transferencia_id = tr.id
              where tr.situacao = 'enviada' and tr.destino_id = v_mac and ti.produto_id = v_mis loop
      perform public.receber_transferencia(jsonb_build_object('id', t.id, 'operador_id', v_oper, 'pin', p->>'pin'));
    end loop;
  end if;

  select coalesce(disponivel, 0) into e from public.estoque_local where produto_id = v_mis and local_id = v_mac;
  if coalesce(e, 0) < 0.9999 then
    raise exception 'Ainda não há mistura de % recebida na Produção Maceiras. Receba da pesagem antes de iniciar.', f.nome;
  end if;

  insert into public.bateladas (programacao_id, ficha_id, maceira_id, operador_id, rendimento_padrao, observacao)
  values ((p->>'programacao_id')::bigint, v_ficha, (p->>'maceira_id')::bigint, v_oper, f.rendimento_qtd, public._texto(p,'observacao'))
  returning id into v_b;

  -- 1 mistura sai da Produção Maceiras
  v_mov := public._movimentar(v_mis, 'saida_receita', -1, null,
    jsonb_build_object('batelada_id', v_b, 'local_id', v_mac, 'programacao_id', (p->>'programacao_id')::bigint, 'operador_id', v_oper));
  v_cm := coalesce((select -valor from public.movimentos where id = v_mov), 0);

  -- itens da maceira: os informados (farinha confirmada/trocada, fermento ajustado)
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    select * into v_pr from public.produtos where id = (itj->>'produto_id')::bigint;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if v_pr.categoria <> 'materia_prima' then raise exception 'Na maceira só entra matéria-prima.'; end if;
    v_q := coalesce((itj->>'quantidade')::numeric, 0) * public._fator(v_pr.id, coalesce(itj->>'unidade', v_pr.unidade_estoque));
    if v_q < 0 then raise exception 'Quantidade não pode ser negativa.'; end if;
    v_itens := v_itens || jsonb_build_array(jsonb_build_object('produto_id', v_pr.id, 'quantidade', v_q,
                 'padrao', (itj->>'padrao')::numeric, 'trocou_de', (itj->>'trocou_de')::bigint));
    if v_q = 0 or not v_pr.controla_estoque or not v_pr.baixa_producao then continue; end if;
    v_local := coalesce(v_pr.local_padrao_id, public._local_tipo('deposito'));
    v_mov := public._movimentar(v_pr.id, 'saida_receita', -v_q, null,
      jsonb_build_object('batelada_id', v_b, 'local_id', v_local, 'programacao_id', (p->>'programacao_id')::bigint, 'operador_id', v_oper));
    v_cmac := v_cmac + coalesce((select -valor from public.movimentos where id = v_mov), 0);
    v_det := v_det || jsonb_build_array(jsonb_build_object('produto_id', v_pr.id, 'quantidade', v_q,
               'valor', (select -valor from public.movimentos where id = v_mov)));
  end loop;
  update public.bateladas set itens = v_itens where id = v_b;
  insert into public.batelada_custos (batelada_id, custo_mistura, custo_maceira, custo_total, detalhe)
  values (v_b, v_cm, v_cmac, v_cm + v_cmac, jsonb_build_object('maceira', v_det));
  return v_b;
end $$;

-- finalizar (engenheiro): p {itens:[{id, quantidade?}]} — sem quantidade = rendimento padrão da ficha
-- custo: mistura + maceira + EMBALAGEM CALCULADA (qtd produzida × embalagens por unidade × custo de 1 embalagem)
-- embalagem marcada "baixa por produção" passa a BAIXAR (do PCP) — hoje fica só no custo
create or replace function public.finalizar_bateladas(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare itj jsonb; b public.bateladas; v_q numeric; v_n int := 0; r record; v_un numeric; v_emb numeric; v_cemb numeric;
        v_det jsonb; v_c public.batelada_custos; v_padrao numeric; v_mov bigint;
begin
  perform public._exigir('finalizar_batelada');
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    select * into b from public.bateladas where id = (itj->>'id')::bigint for update;
    if not found then raise exception 'Batelada % não encontrada.', itj->>'id'; end if;
    if b.situacao <> 'em_producao' then continue; end if;
    v_q := coalesce((itj->>'quantidade')::numeric, b.rendimento_padrao);
    if v_q is null then raise exception 'A receita da batelada nº % não tem rendimento padrão: digite a quantidade produzida.', b.id; end if;
    if v_q < 0 then raise exception 'Quantidade produzida não pode ser negativa.'; end if;
    v_cemb := 0; v_det := '[]'::jsonb;
    for r in select fi.produto_id, fi.quantidade, pr.* from public.ficha_itens fi join public.produtos pr on pr.id = fi.produto_id
              where fi.ficha_id = b.ficha_id and pr.categoria = 'embalagem' loop
      v_un := v_q * r.quantidade;                                         -- nº de embalagens
      v_emb := case when lower(r.unidade_estoque) = 'kg' then v_un * coalesce(r.peso_embalagem_g, 0) / 1000
                    when lower(r.unidade_estoque) = 'g' then v_un * coalesce(r.peso_embalagem_g, 0)
                    else v_un end;                                         -- na unidade de estoque
      v_cemb := v_cemb + v_emb * r.custo_medio;
      v_det := v_det || jsonb_build_array(jsonb_build_object('produto_id', r.produto_id, 'embalagens', v_un, 'qtd_estoque', v_emb,
                                                             'custo', round(v_emb * r.custo_medio, 4), 'baixou', r.baixa_producao and r.controla_estoque));
      if r.baixa_producao and r.controla_estoque and v_emb > 0 then
        v_mov := public._movimentar(r.produto_id, 'saida_receita', -v_emb, null,
          jsonb_build_object('batelada_id', b.id, 'local_id', coalesce(public._local_tipo('pcp'), r.local_padrao_id), 'programacao_id', b.programacao_id,
                             'observacao', format('Embalagem da batelada nº %s (%s un)', b.id, public._fmt(v_un))));
      end if;
    end loop;
    -- custo padrão da ficha (comparação): ficha × custo médio de hoje
    select coalesce(sum(case when pr.categoria = 'embalagem' then v_q * fi.quantidade *
                              case when lower(pr.unidade_estoque) = 'kg' then coalesce(pr.peso_embalagem_g,0)/1000
                                   when lower(pr.unidade_estoque) = 'g' then coalesce(pr.peso_embalagem_g,0) else 1 end
                             else fi.quantidade end * pr.custo_medio), 0)
      into v_padrao from public.ficha_itens fi join public.produtos pr on pr.id = fi.produto_id where fi.ficha_id = b.ficha_id;
    select * into v_c from public.batelada_custos where batelada_id = b.id;
    update public.batelada_custos set custo_embalagem = round(v_cemb, 4),
           custo_total = round(coalesce(v_c.custo_mistura,0) + coalesce(v_c.custo_maceira,0) + v_cemb, 4),
           custo_unitario = case when v_q > 0 then round((coalesce(v_c.custo_mistura,0) + coalesce(v_c.custo_maceira,0) + v_cemb) / v_q, 6) end,
           custo_padrao = round(v_padrao, 4),
           detalhe = coalesce(detalhe, '{}'::jsonb) || jsonb_build_object('embalagem', v_det)
     where batelada_id = b.id;
    update public.bateladas set situacao = 'finalizada', quantidade_produzida = v_q, finalizada_em = now(), finalizada_por = auth.uid()
     where id = b.id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhuma batelada em produção foi selecionada.'; end if;
  return v_n;
end $$;

-- cancelar uma batelada iniciada por engano: devolve mistura e insumos (correção)
create or replace function public.cancelar_batelada(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare b public.bateladas; m record;
begin
  perform public._exigir('finalizar_batelada');
  if nullif(btrim(coalesce(p_motivo,'')), '') is null then raise exception 'Informe o motivo.'; end if;
  select * into b from public.bateladas where id = p_id for update;
  if not found or b.situacao <> 'em_producao' then raise exception 'Só dá para cancelar batelada em produção.'; end if;
  for m in select * from public.movimentos where batelada_id = p_id and tipo = 'saida_receita' loop
    perform public._movimentar(m.produto_id, 'correcao', -m.quantidade, m.custo_unitario,
      jsonb_build_object('corrige_id', m.id, 'local_id', m.local_id, 'batelada_id', p_id, 'motivo', btrim(p_motivo),
                         'observacao', format('Batelada nº %s cancelada: devolvido', p_id)));
  end loop;
  update public.bateladas set situacao = 'cancelada', cancelada_motivo = btrim(p_motivo), finalizada_em = now(), finalizada_por = auth.uid()
   where id = p_id;
  delete from public.batelada_custos where batelada_id = p_id;
end $$;

-- perda de mistura (não volta a ser matéria-prima)
create or replace function public.registrar_perda(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_local bigint := (p->>'local_id')::bigint; v_oper bigint := (p->>'operador_id')::bigint; v_q numeric := (p->>'quantidade')::numeric;
begin
  if not (public.pode('batelada') or public.pode('saida_receita') or public.pode('programacao')) then
    raise exception 'Sem permissão.' using errcode = '42501'; end if;
  perform public._exigir_local(v_local);
  if v_oper is not null and not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  if public._texto(p,'motivo') is null then raise exception 'Informe o motivo da perda.'; end if;
  if coalesce(v_q, 0) <= 0 then raise exception 'Informe a quantidade perdida.'; end if;
  return public._movimentar((p->>'produto_id')::bigint, 'perda', -v_q, null,
    jsonb_build_object('local_id', v_local, 'motivo', public._texto(p,'motivo'), 'observacao', public._texto(p,'observacao'),
                       'programacao_id', (p->>'programacao_id')::bigint, 'operador_id', v_oper));
end $$;

-- ---------------------------------------------------------------------
-- 23. FLUXO DA PRODUÇÃO (painel): uma linha por programação, com o funil
-- ---------------------------------------------------------------------
create or replace function public.fluxo_producao(p_de date, p_ate date)
returns table (programacao_id bigint, data date, ficha_id bigint, maceira_id bigint, operador_id bigint, prioridade integer,
               programado numeric, pesado numeric, enviado numeric, recebido numeric, devolvido numeric, perdido numeric,
               iniciado numeric, finalizado numeric, produzido numeric, finalizada boolean,
               a_pesar numeric, na_pesagem numeric, a_caminho numeric, pronto numeric, em_producao numeric,
               primeiro_recebimento timestamptz, ultimo_inicio timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_mac bigint := public._local_tipo('maceiras'); v_pes bigint := public._local_tipo('pesagem');
begin
  if not (public.acesso_amplo() or public.pode('previsao_producao')) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query
  with pg as (select * from public.programacoes g where g.situacao = 'ativa' and g.data between p_de and p_ate),
  pes as (select pr.programacao_id, sum(pr.multiplicador) q from public.producoes pr where pr.programacao_id in (select id from pg) group by 1),
  ti as (select ti.programacao_id,
                sum(ti.quantidade) filter (where t.origem_id = v_pes and t.destino_id = v_mac and t.situacao in ('enviada','recebida')) env,
                sum(coalesce(ti.recebido,0)) filter (where t.origem_id = v_pes and t.destino_id = v_mac and t.situacao = 'recebida') rec,
                sum(ti.quantidade) filter (where t.origem_id = v_mac and t.situacao in ('enviada','recebida')) dev,
                min(t.recebido_em) filter (where t.destino_id = v_mac and t.situacao = 'recebida') prim
           from public.transferencia_itens ti join public.transferencias t on t.id = ti.transferencia_id
          where ti.programacao_id in (select id from pg) group by 1),
  per as (select m.programacao_id, sum(-m.quantidade) q from public.movimentos m
           where m.tipo = 'perda' and m.local_id = v_mac and m.programacao_id in (select id from pg) group by 1),
  bt as (select b.programacao_id, count(*) filter (where b.situacao <> 'cancelada') ini,
                count(*) filter (where b.situacao = 'finalizada') fin,
                sum(b.quantidade_produzida) filter (where b.situacao = 'finalizada') prod,
                max(b.iniciada_em) filter (where b.situacao <> 'cancelada') ult
           from public.bateladas b where b.programacao_id in (select id from pg) group by 1)
  select g.id, g.data, g.ficha_id, g.maceira_id, g.operador_id, g.prioridade,
         g.quantidade, coalesce(pes.q,0), coalesce(ti.env,0), coalesce(ti.rec,0), coalesce(ti.dev,0), coalesce(per.q,0),
         coalesce(bt.ini,0)::numeric, coalesce(bt.fin,0)::numeric, coalesce(bt.prod,0), g.finalizada_em is not null,
         greatest(g.quantidade - coalesce(pes.q,0), 0),
         greatest(coalesce(pes.q,0) - coalesce(ti.env,0), 0),
         greatest(coalesce(ti.env,0) - coalesce(ti.rec,0) - 0, 0),
         greatest(coalesce(ti.rec,0) - coalesce(ti.dev,0) - coalesce(per.q,0) - coalesce(bt.ini,0), 0),
         greatest(coalesce(bt.ini,0) - coalesce(bt.fin,0), 0)::numeric,
         ti.prim, bt.ult
    from pg g left join pes on pes.programacao_id = g.id left join ti on ti.programacao_id = g.id
    left join per on per.programacao_id = g.id left join bt on bt.programacao_id = g.id
   order by g.data, g.maceira_id nulls last, g.prioridade, g.id;
end $$;

-- previsão (faturamento): programado × produzido (pães das bateladas finalizadas)
drop function if exists public.previsao_producao(date, date);
create or replace function public.previsao_producao(p_de date, p_ate date)
returns table (data date, ficha_id bigint, codigo text, nome text, produto_final text,
               receitas numeric, receitas_pesadas numeric, rendimento_qtd numeric, rendimento_unidade text,
               previsto numeric, finalizada boolean, produzido numeric, bateladas_finalizadas numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir('previsao_producao');
  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'Período inválido.'; end if;
  if p_ate - p_de > 400 then raise exception 'Período máximo: 400 dias.'; end if;
  return query
  select pg.data, f.id, f.codigo, f.nome, f.produto_final,
         sum(pg.quantidade)::numeric,
         coalesce(sum((select sum(pr.multiplicador) from public.producoes pr where pr.programacao_id = pg.id)), 0)::numeric,
         f.rendimento_qtd, f.rendimento_unidade,
         case when f.rendimento_qtd is null then null else round(sum(pg.quantidade) * f.rendimento_qtd, 3) end,
         bool_and(pg.finalizada_em is not null),
         coalesce(sum((select sum(b.quantidade_produzida) from public.bateladas b where b.programacao_id = pg.id and b.situacao = 'finalizada')), 0)::numeric,
         coalesce(sum((select count(*) from public.bateladas b where b.programacao_id = pg.id and b.situacao = 'finalizada')), 0)::numeric
    from public.programacoes pg join public.fichas_tecnicas f on f.id = pg.ficha_id
   where pg.situacao = 'ativa' and pg.data between p_de and p_ate
   group by pg.data, f.id
   order by pg.data, f.nome;
end $$;

-- custos das bateladas (controladoria e diretoria)
create or replace function public.custos_bateladas(p_de date, p_ate date)
returns table (batelada_id bigint, data date, ficha_id bigint, programacao_id bigint, maceira_id bigint, operador_id bigint,
               quantidade_produzida numeric, custo_mistura numeric, custo_maceira numeric, custo_embalagem numeric,
               custo_total numeric, custo_unitario numeric, custo_padrao numeric, detalhe jsonb, itens jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir('custos');
  return query
  select b.id, (b.iniciada_em at time zone 'America/Sao_Paulo')::date, b.ficha_id, b.programacao_id, b.maceira_id, b.operador_id,
         b.quantidade_produzida, c.custo_mistura, c.custo_maceira, c.custo_embalagem, c.custo_total, c.custo_unitario, c.custo_padrao,
         c.detalhe, b.itens
    from public.bateladas b join public.batelada_custos c on c.batelada_id = b.id
   where b.situacao = 'finalizada' and (b.iniciada_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
   order by b.iniciada_em;
end $$;

-- consumo agora inclui "consumo" (baixa manual) nas estatísticas de estoque
create or replace function public.estatisticas_estoque(p_janela integer default 90)
returns table (produto_id bigint, dias_historico integer, consumo_total numeric,
               media_dia numeric, desvio_dia numeric, a_receber numeric,
               lt_medio numeric, lt_desvio numeric, lt_qtd integer, ultima_saida timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_ini date; v_fim date := public._hoje() - 1; v_dias int;
begin
  if not public.usuario_ativo() then raise exception 'Usuário inativo.' using errcode = '42501'; end if;
  if not public.acesso_amplo() then return; end if;
  select coalesce(min((data_hora at time zone 'America/Sao_Paulo')::date), public._hoje())
    into v_ini from public.movimentos;
  v_ini := greatest(v_ini, public._hoje() - p_janela);
  v_dias := greatest(v_fim - v_ini + 1, 0);

  return query
  with consumo as (
    select m.produto_id,
           (coalesce(o.data_hora, m.data_hora) at time zone 'America/Sao_Paulo')::date as dia,
           -m.quantidade as q
      from public.movimentos m
      left join public.movimentos o on o.id = m.corrige_id
     where (m.tipo in ('saida_receita','saida_avulsa','saida_almox','consumo')
            or (m.tipo = 'correcao' and o.tipo in ('saida_receita','saida_avulsa','saida_almox','consumo')))
  ),
  dias as (select generate_series(v_ini, v_fim, interval '1 day')::date as dia where v_dias > 0),
  serie as (
    select p.id as produto_id, d.dia, coalesce(sum(c.q), 0) as q
      from public.produtos p cross join dias d
      left join consumo c on c.produto_id = p.id and c.dia = d.dia
     group by p.id, d.dia
  ),
  est as (
    select s.produto_id, sum(s.q) as total, avg(s.q) as media,
           coalesce(stddev_samp(s.q), 0) as desvio
      from serie s group by s.produto_id
  ),
  receber as (
    select pi.produto_id, sum(greatest(pi.quantidade_base - pi.qtd_recebida_base, 0)) as q
      from public.pedido_itens pi join public.pedidos pe on pe.id = pi.pedido_id
     where pe.status in ('aberto','parcial') group by pi.produto_id
  ),
  lt as (
    select pi.produto_id,
           (min(m.data_hora at time zone 'America/Sao_Paulo')::date - pe.data_pedido) as dias
      from public.pedido_itens pi
      join public.pedidos pe on pe.id = pi.pedido_id
      join public.movimentos m on m.pedido_item_id = pi.id and m.tipo = 'entrada'
     where pe.data_pedido >= public._hoje() - 365
     group by pi.id, pi.produto_id, pe.data_pedido
  ),
  ltp as (
    select l.produto_id, avg(l.dias) as media, coalesce(stddev_samp(l.dias), 0) as desvio, count(*) as n
      from lt l group by l.produto_id
  ),
  ult as (
    select m.produto_id, max(m.data_hora) as d from public.movimentos m
     where m.tipo in ('saida_receita','saida_avulsa','saida_almox','consumo') group by m.produto_id
  )
  select p.id, v_dias, coalesce(e.total, 0), coalesce(e.media, 0), coalesce(e.desvio, 0),
         coalesce(r.q, 0), l.media, l.desvio, coalesce(l.n, 0)::int, u.d
    from public.produtos p
    left join est e on e.produto_id = p.id
    left join receber r on r.produto_id = p.id
    left join ltp l on l.produto_id = p.id
    left join ult u on u.produto_id = p.id;
end $$;

-- anexo de uma transferência (abre a nota fiscal anexada)
create or replace function public.ler_anexo(p_id bigint)
returns table (nome text, tipo text, conteudo text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.acesso_amplo() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query select a.nome, a.tipo, a.conteudo from public.anexos a where a.id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 24. SEGURANÇA DAS TABELAS NOVAS (leitura para a operação; gravação só pelas funções)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['unidades','locais','estoque_local','linhas_producao','operadores','maceiras',
    'requisicoes','requisicao_itens','transferencias','transferencia_itens','bateladas','batelada_custos','anexos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop policy if exists leitura on public.%I', t);
    if t = 'batelada_custos' then
      execute format('grant select on public.%I to authenticated', t);
      execute format('create policy leitura on public.%I for select to authenticated using (public.pode(''custos''))', t);
    elsif t = 'anexos' then
      null;   -- só pela função ler_anexo
    elsif t = 'operadores' then
      -- a senha (sal e hash) nunca é lida pela tela
      execute format('grant select (id, nome, ativo, criado_em) on public.%I to authenticated', t);
      execute format('create policy leitura on public.%I for select to authenticated using (public.acesso_amplo())', t);
    elsif t in ('unidades','locais') then
      execute format('grant select on public.%I to authenticated', t);
      execute format('create policy leitura on public.%I for select to authenticated using (public.usuario_ativo())', t);
    else
      execute format('grant select on public.%I to authenticated', t);
      execute format('create policy leitura on public.%I for select to authenticated using (public.acesso_amplo())', t);
    end if;
  end loop;
end $$;

-- auditoria dos cadastros novos
drop trigger if exists aud on public.unidades;
create trigger aud after insert or update or delete on public.unidades for each row execute function public.auditar();
drop trigger if exists aud on public.locais;
create trigger aud after insert or update or delete on public.locais for each row execute function public.auditar();
drop trigger if exists aud on public.linhas_producao;
create trigger aud after insert or update or delete on public.linhas_producao for each row execute function public.auditar();
drop trigger if exists aud on public.maceiras;
create trigger aud after insert or update or delete on public.maceiras for each row execute function public.auditar();
drop trigger if exists aud on public.operadores;
create trigger aud after insert or update or delete on public.operadores for each row execute function public.auditar('pin_sal','pin_hash');
drop trigger if exists aud on public.requisicoes;
create trigger aud after insert or update or delete on public.requisicoes for each row execute function public.auditar();
drop trigger if exists aud on public.transferencias;
create trigger aud after insert or update or delete on public.transferencias for each row execute function public.auditar();
drop trigger if exists aud on public.bateladas;
create trigger aud after insert or update or delete on public.bateladas for each row execute function public.auditar();

-- nada de apagar movimentação/registro de produção
drop trigger if exists protege on public.transferencia_itens;
create trigger protege before delete on public.transferencia_itens for each row execute function public.bloquear_alteracao();
drop trigger if exists protege on public.bateladas;
create trigger protege before delete on public.bateladas for each row execute function public.bloquear_alteracao();

-- ---------------------------------------------------------------------
-- 25. QUEM EXECUTA O QUÊ
-- ---------------------------------------------------------------------
revoke execute on function public._matriz(), public._local_tipo(text, bigint), public._local_do_produto(bigint),
  public._opera_local(bigint), public._exigir_local(bigint), public._nome_local(bigint), public._operador_ok(bigint, text),
  public._movimentar(bigint, text, numeric, numeric, jsonb),
  public._mov_local(bigint, bigint, numeric, numeric, numeric, numeric, jsonb), public._mistura_da_ficha(bigint),
  public._situacao_requisicao(bigint) from public, anon, authenticated;
grant execute on function
  public.acesso_amplo(), public.pode(text), public.salvar_produto(jsonb), public.salvar_ficha(jsonb),
  public.salvar_unidade(jsonb), public.salvar_local(jsonb), public.salvar_linha(jsonb), public.salvar_maceira(jsonb),
  public.salvar_operador(jsonb), public.entrar_operador(bigint, text), public.salvar_parametros_producao(jsonb),
  public.registrar_recebimento(jsonb), public.registrar_saida(jsonb), public.registrar_inventario(jsonb),
  public.corrigir_movimento(bigint, numeric, text, text),
  public.criar_transferencia(jsonb), public.enviar_transferencia(bigint), public.cancelar_transferencia(bigint, text),
  public.receber_transferencia(jsonb), public.criar_requisicao(jsonb), public.cancelar_requisicao(bigint, text),
  public.registrar_consumo(jsonb), public.registrar_producao(jsonb), public.salvar_programacao(jsonb),
  public.reordenar_programacao(jsonb), public.dividir_programacao(bigint, numeric, bigint), public.finalizar_programacao(bigint, text),
  public.iniciar_batelada(jsonb), public.finalizar_bateladas(jsonb), public.cancelar_batelada(bigint, text),
  public.registrar_perda(jsonb), public.fluxo_producao(date, date), public.previsao_producao(date, date),
  public.custos_bateladas(date, date), public.estatisticas_estoque(integer), public.ler_anexo(bigint)
to authenticated;

-- ---------------------------------------------------------------------
-- 26. TEMPO REAL (as telas abertas se atualizam sozinhas quando algo muda)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['movimentos','estoque_local','transferencias','requisicoes','bateladas','programacoes','producoes']
    loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

insert into public.versao_banco (versao, descricao) values ('2.0.0',
  'Estoque por unidade e local, transferências, requisição, bobinas, novo fluxo da produção (pesagem → mistura → maceiras), bateladas, painel e custos')
on conflict (versao) do nothing;


-- =====================================================================
-- Atualização 005 — versão 2.3.0 do banco
-- Acrescenta o parâmetro "Início do turno" (semáforo das maceiras) e deixa o PCP ajustá-lo.
-- Só acrescenta; não apaga nada. Pode rodar mais de uma vez.
-- =====================================================================
insert into public.parametros (chave, valor, descricao) values
  ('producao_inicio_turno', '04:00', 'Produção: hora em que o turno das maceiras começa. Se houver mistura pronta e nenhuma batelada até essa hora + tolerância, a maceira fica laranja "Ainda não iniciou".')
on conflict (chave) do nothing;

update public.parametros
   set descricao = 'Produção: minutos de tolerância para começar (depois do início do turno ou da chegada de mistura com a maceira parada)'
 where chave = 'producao_tolerancia_min';

create or replace function public.salvar_parametros_producao(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare k text; v text;
begin
  perform public._exigir('producao_config');
  for k, v in select * from jsonb_each_text(p) loop
    if k = 'producao_inicio_turno' then
      if v !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Início do turno inválido: use hora no formato 04:00.'; end if;
    elsif k in ('producao_tolerancia_min','producao_tempo_padrao_min','producao_prazo_finalizar_h','mistura_parada_h') then
      if v !~ '^[0-9]+$' or v::int <= 0 or v::int > 1440 then raise exception 'Valor inválido para %: use um número inteiro maior que zero.', k; end if;
    else
      raise exception 'Configuração não permitida aqui: %', k;
    end if;
    update public.parametros set valor = v where chave = k;
  end loop;
end $$;
grant execute on function public.salvar_parametros_producao(jsonb) to authenticated;

insert into public.versao_banco (versao, descricao) values ('2.3.0', 'Parâmetro início do turno das maceiras (semáforo)')
on conflict (versao) do nothing;


-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.6 · SEGURANÇA + TEMPO REAL
--
-- COMO APLICAR (uma vez só, leva poucos segundos):
--   Supabase › SQL Editor › New query › colar este arquivo inteiro › Run.
--   Pode rodar de novo sem problema. NÃO apaga nem altera nenhum dado: só reforça
--   as regras de acesso. No fim aparece uma CONFERÊNCIA: todas as linhas devem dizer "OK".
--
-- O QUE FAZ:
--  1. Ninguém sem login executa função nenhuma do sistema (antes elas recusavam lá dentro;
--     agora nem chegam a rodar).
--  2. Tabelas só podem ser LIDAS pelo app; gravar, apagar ou esvaziar só pelas funções
--     do sistema (que conferem o papel de quem pede). Sem login: nem leitura.
--  3. Funções com privilégio elevado: caminho de busca travado (public, pg_temp), boa
--     prática do PostgreSQL contra tabelas "falsas".
--  4. Tablet do padeiro (papel só "padeiro"): deixa de ler pedidos de compra, preços,
--     fornecedores, recebimentos, movimentações e o log de auditoria (não usa nenhum deles).
--  5. Anexos (nota fiscal das transferências): só PDF e fotos, conferidos pelo conteúdo
--     real do arquivo, com nome limpo. Bloqueia arquivo disfarçado (ex.: página web maliciosa).
--  6. Tempo real para pedidos, recebimentos e cadastros (mesmo conteúdo do tempo-real-v2.5.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 e 3. FUNÇÕES
-- ---------------------------------------------------------------------
do $$
declare f record; tinha boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as assin, p.prosecdef
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f', 'p')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- não mexe em extensões
  loop
    tinha := has_function_privilege('authenticated', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', f.assin);
    -- quem é logado continua exatamente com o que já podia (nem mais, nem menos)
    if tinha and not has_function_privilege('authenticated', f.oid, 'execute') then
      execute format('grant execute on function %s to authenticated', f.assin);
    end if;
    if f.prosecdef then
      execute format('alter function %s set search_path = public, pg_temp', f.assin);
    end if;
  end loop;
end $$;
-- funções criadas no futuro também nascem fechadas para quem não tem login
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------
-- 2. TABELAS: app só lê; gravação só pelas funções do sistema
-- ---------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke select on all tables in schema public from anon;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public revoke select on tables from anon;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. MENOR ACESSO PARA O TABLET DO PADEIRO
-- ---------------------------------------------------------------------
create or replace function public.so_padeiro()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.usuario_ativo() and public.meus_papeis() <@ array['padeiro']::text[]
$$;
revoke execute on function public.so_padeiro() from public, anon;
grant execute on function public.so_padeiro() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['pedidos', 'pedido_itens', 'recebimentos', 'fornecedores'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists leitura on public.%I', t);
      execute format('create policy leitura on public.%I for select to authenticated using ((public.acesso_amplo() and not public.so_padeiro()) or (public.usuario_ativo() and ''financeiro'' = any(public.meus_papeis())))', t);
    end if;
  end loop;
  foreach t in array array['auditoria', 'fichas_historico', 'movimentos'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists leitura on public.%I', t);
      execute format('create policy leitura on public.%I for select to authenticated using (public.acesso_amplo() and not public.so_padeiro())', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. ANEXOS: só PDF e fotos, conferidos pelos bytes do arquivo
-- ---------------------------------------------------------------------
create or replace function public._anexo_valido()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare b bytea; t text; c text;
begin
  c := regexp_replace(coalesce(new.conteudo, ''), '\s', '', 'g');
  if c = '' or length(c) > 4500000 then raise exception 'Anexo vazio ou muito grande (máximo ~3 MB).'; end if;
  begin
    b := decode(substr(c, 1, 24), 'base64');
  exception when others then
    raise exception 'Anexo recusado: arquivo corrompido.';
  end;
  t := case
    when substr(b, 1, 4) = '\x25504446'::bytea then 'application/pdf'                                   -- %PDF
    when substr(b, 1, 3) = '\xffd8ff'::bytea then 'image/jpeg'
    when substr(b, 1, 4) = '\x89504e47'::bytea then 'image/png'
    when substr(b, 1, 4) = '\x52494646'::bytea and substr(b, 9, 4) = '\x57454250'::bytea then 'image/webp' -- RIFF....WEBP
    when substr(b, 5, 4) = '\x66747970'::bytea then 'image/heic'                                        -- ....ftyp
    else null end;
  if t is null then raise exception 'Anexo recusado: envie a nota em PDF ou uma foto (JPG, PNG, WEBP ou HEIC).'; end if;
  new.conteudo := c;
  new.tipo := t;                                                            -- o tipo vem do conteúdo, nunca de quem enviou
  new.nome := left(regexp_replace(coalesce(nullif(btrim(new.nome), ''), 'anexo'), '[^[:alnum:] ._()-]', '_', 'g'), 120);
  return new;
end $$;
revoke execute on function public._anexo_valido() from public, anon, authenticated;
do $$
begin
  if to_regclass('public.anexos') is not null then
    execute 'drop trigger if exists valida on public.anexos';
    execute 'create trigger valida before insert or update on public.anexos for each row execute function public._anexo_valido()';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. TEMPO REAL (pedidos, recebimentos e cadastros)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['pedidos','pedido_itens','recebimentos','produtos','fornecedores','fichas_tecnicas','ficha_itens',
                             'parametros','perfis','locais','unidades','maceiras','operadores','linhas_producao']
    loop
      if to_regclass('public.' || t) is not null
         and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Funções que alguém SEM LOGIN pode executar' as verificacao,
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end as resultado
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Tabelas que alguém SEM LOGIN pode ler',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'select')
union all
select 'Tabelas que o app consegue gravar direto (sem as funções)',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')
        or has_table_privilege('authenticated', c.oid, 'delete') or has_table_privilege('authenticated', c.oid, 'truncate'))
union all
select 'Tabelas SEM proteção por linha (RLS)',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'Funções privilegiadas sem caminho de busca travado',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=public, pg_temp%', false);


-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.7 · PRODUÇÃO
-- (aplicar DEPOIS da v2.6; pode rodar de novo sem problema; não apaga dados)
--
--  1. Papel "Gestor da produção" (gestor_producao): mesmas permissões de produção da
--     engenharia (programar, mudar masseira/ordem, finalizar e corrigir bateladas).
--  2. Avisos de mudança na programação para o tablet: criados AUTOMATICAMENTE quando a
--     ordem, a masseira, a quantidade muda, entra produção nova ou uma sai (só a do dia).
--     O padeiro confirma com nome + senha ("ciente"). Recado manual do engenheiro também.
--  3. Batelada iniciada "fora da nova ordem": marcada automaticamente (não trava nada).
--  4. Correções de batelada (trocar masseira / trocar padeiro) só por engenharia, gestor
--     da produção ou admin, com motivo obrigatório; nada é apagado (fica antes/depois).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PAPEL "GESTOR DA PRODUÇÃO"
-- ---------------------------------------------------------------------
alter table public.perfis drop constraint if exists perfis_papeis_check;
alter table public.perfis add constraint perfis_papeis_check check (papeis <@ array['admin','comprador','almoxarifado','recebimento',
  'pesagem','engenharia','diretoria','financeiro','faturamento','padeiro','gestor_producao']::text[]);

create or replace function public.acesso_amplo()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.usuario_ativo() and public.meus_papeis() &&
         array['admin','comprador','almoxarifado','recebimento','pesagem','engenharia','diretoria','padeiro','gestor_producao']::text[]
$$;

create or replace function public.pode(p_acao text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.meus_papeis() && (case p_acao
    when 'cadastro_produto'    then array['admin','comprador']
    when 'cadastro_fornecedor' then array['admin','comprador']
    when 'ficha_tecnica'       then array['admin','engenharia']
    when 'pedido'              then array['admin','comprador']
    when 'recebimento'         then array['admin','almoxarifado','recebimento']
    when 'saida_receita'       then array['admin','pesagem','almoxarifado']
    when 'saida_avulsa'        then array['admin','pesagem','almoxarifado','padeiro','engenharia','gestor_producao']
    when 'saida_almox'         then array['admin','almoxarifado','recebimento']
    when 'inventario'          then array['admin','almoxarifado','recebimento']
    when 'corrigir'            then array['admin','almoxarifado']
    when 'implantacao'         then array['admin']
    when 'contagem_inicial'    then array['admin','almoxarifado']
    when 'usuarios'            then array['admin']
    when 'parametros'          then array['admin']
    when 'auditoria'           then array['admin','diretoria']
    when 'importacao'          then array['admin']
    when 'programacao'         then array['admin','engenharia','gestor_producao']
    when 'financeiro'          then array['admin','financeiro']
    when 'data_pagamento'      then array['admin','comprador','financeiro']
    when 'previsao_producao'   then array['admin','engenharia','diretoria','financeiro','faturamento','gestor_producao']
    when 'custos'              then array['admin','diretoria']
    when 'requisicao'          then array['admin','engenharia','gestor_producao']
    when 'producao_config'     then array['admin','engenharia','gestor_producao']
    when 'batelada'            then array['admin','padeiro','engenharia','gestor_producao']
    when 'finalizar_batelada'  then array['admin','engenharia','gestor_producao']
    when 'consumo'             then array['admin','engenharia','almoxarifado','padeiro','pesagem','gestor_producao']
    when 'locais'              then array['admin']
    else array[]::text[] end)::text[], false)
$$;

-- ---------------------------------------------------------------------
-- 2. AVISOS DE MUDANÇA NA PROGRAMAÇÃO (tablet da produção)
-- ---------------------------------------------------------------------
create table if not exists public.avisos_producao (
  id                 bigint generated always as identity primary key,
  criado_em          timestamptz not null default now(),
  criado_por         uuid references auth.users(id) default auth.uid(),
  maceira_id         bigint references public.maceiras(id),
  programacao_id     bigint references public.programacoes(id),
  tipo               text not null check (tipo in ('ordem','masseira','nova','retirada','quantidade','recado')),
  texto              text not null check (length(texto) between 1 and 500),
  ciente_em          timestamptz,
  ciente_operador_id bigint references public.operadores(id),
  ciente_por         uuid references auth.users(id)
);
create index if not exists avisos_producao_pendentes on public.avisos_producao (maceira_id) where ciente_em is null;
create index if not exists avisos_producao_data on public.avisos_producao (criado_em);
alter table public.avisos_producao enable row level security;
alter table public.avisos_producao force row level security;
revoke all on public.avisos_producao from anon, authenticated;
grant select on public.avisos_producao to authenticated;
drop policy if exists leitura on public.avisos_producao;
create policy leitura on public.avisos_producao for select to authenticated using (public.acesso_amplo());

-- texto curto e simples ("Pão de forma: passou de 2º para 1º.")
create or replace function public._aviso_programacao()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ficha text; v_mac_old text; v_mac_new text; v_q text;
begin
  if new.data is distinct from public._hoje() then return new; end if;              -- só a produção do dia
  select nome into v_ficha from public.fichas_tecnicas where id = new.ficha_id;
  v_q := trim(to_char(new.quantidade, 'FM999990.##')); v_q := rtrim(v_q, '.');
  if tg_op = 'INSERT' then
    if new.situacao = 'ativa' and new.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (new.maceira_id, new.id, 'nova',
        format('NOVA produção: %s, %s bateladas, em %sº lugar.', v_ficha, v_q, coalesce(new.prioridade::text, '?')));
    end if;
    return new;
  end if;
  if new.finalizada_em is not null and old.finalizada_em is null then return new; end if;   -- finalização não é mudança
  if new.situacao = 'cancelada' and old.situacao is distinct from 'cancelada' then
    if old.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (old.maceira_id, new.id, 'retirada',
        format('CANCELADA: %s não é mais para fazer.', v_ficha));
    end if;
    return new;
  end if;
  if new.situacao <> 'ativa' then return new; end if;
  if new.maceira_id is distinct from old.maceira_id then
    select nome into v_mac_old from public.maceiras where id = old.maceira_id;
    select nome into v_mac_new from public.maceiras where id = new.maceira_id;
    if old.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (old.maceira_id, new.id, 'masseira',
        format('SAIU daqui: %s foi para %s.', v_ficha, coalesce(v_mac_new, 'outra masseira')));
    end if;
    if new.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (new.maceira_id, new.id, 'masseira',
        format('VEIO para cá: %s (%s bateladas), em %sº lugar%s.', v_ficha, v_q, coalesce(new.prioridade::text, '?'),
               case when v_mac_old is not null then ', vindo da ' || v_mac_old else '' end));
    end if;
    return new;
  end if;
  if new.maceira_id is not null and new.prioridade is distinct from old.prioridade then
    insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (new.maceira_id, new.id, 'ordem',
      format('ORDEM mudou: %s passou de %sº para %sº.', v_ficha, coalesce(old.prioridade::text, '?'), coalesce(new.prioridade::text, '?')));
  end if;
  if new.maceira_id is not null and new.quantidade is distinct from old.quantidade then
    insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (new.maceira_id, new.id, 'quantidade',
      format('QUANTIDADE mudou: %s agora são %s bateladas (antes %s).', v_ficha, v_q, rtrim(trim(to_char(old.quantidade, 'FM999990.##')), '.')));
  end if;
  return new;
end $$;
revoke execute on function public._aviso_programacao() from public, anon, authenticated;
drop trigger if exists aviso_tablet on public.programacoes;
create trigger aviso_tablet after insert or update on public.programacoes for each row execute function public._aviso_programacao();

-- recado manual do engenheiro / gestor para a masseira
create or replace function public.enviar_recado_producao(p_maceira bigint, p_texto text)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_t text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  perform public._exigir('programacao');
  if v_t is null then raise exception 'Escreva o recado.'; end if;
  if length(v_t) > 300 then raise exception 'Recado muito longo (máximo 300 letras).'; end if;
  if not exists (select 1 from public.maceiras where id = p_maceira) then raise exception 'Escolha a masseira.'; end if;
  insert into public.avisos_producao (maceira_id, tipo, texto) values (p_maceira, 'recado', 'RECADO: ' || v_t) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.enviar_recado_producao(bigint, text) from public, anon;
grant execute on function public.enviar_recado_producao(bigint, text) to authenticated;

-- o padeiro confirma que viu (nome + senha): fica registrado quem e quando
create or replace function public.confirmar_avisos_producao(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_oper bigint := (p->>'operador_id')::bigint; v_n int;
begin
  perform public._exigir('batelada');
  if v_oper is null then raise exception 'Escolha o seu nome.'; end if;
  if not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  update public.avisos_producao set ciente_em = now(), ciente_operador_id = v_oper, ciente_por = auth.uid()
   where ciente_em is null and id in (select (x)::bigint from jsonb_array_elements_text(coalesce(p->'ids', '[]'::jsonb)) x);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.confirmar_avisos_producao(jsonb) from public, anon;
grant execute on function public.confirmar_avisos_producao(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. BATELADA INICIADA FORA DA ORDEM (só marca; não trava)
--    "Na ordem" = a 1ª da fila da masseira (menor prioridade) que ainda tem batelada por
--    iniciar E tem mistura pronta na produção.
-- ---------------------------------------------------------------------
alter table public.bateladas add column if not exists fora_da_ordem boolean not null default false;
create or replace function public._batelada_ordem()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prog public.programacoes; v_esperada bigint; v_mac bigint := public._local_tipo('maceiras');
begin
  if new.programacao_id is null or new.maceira_id is null then return new; end if;
  select * into v_prog from public.programacoes where id = new.programacao_id;
  if not found then return new; end if;
  select p.id into v_esperada
    from public.programacoes p
   where p.data = v_prog.data and p.maceira_id = new.maceira_id and p.situacao = 'ativa' and p.finalizada_em is null
     and (select count(*) from public.bateladas b where b.programacao_id = p.id and b.situacao <> 'cancelada') < ceil(p.quantidade)
     and exists (select 1 from public.produtos m join public.estoque_local e on e.produto_id = m.id and e.local_id = v_mac
                  where m.ficha_id = p.ficha_id and m.categoria = 'intermediario' and e.disponivel >= 0.9999)
   order by p.prioridade nulls last, p.id
   limit 1;
  new.fora_da_ordem := v_esperada is not null and v_esperada <> new.programacao_id;
  return new;
end $$;
revoke execute on function public._batelada_ordem() from public, anon, authenticated;
drop trigger if exists ordem on public.bateladas;
create trigger ordem before insert on public.bateladas for each row execute function public._batelada_ordem();

-- ---------------------------------------------------------------------
-- 4. CORREÇÕES DE BATELADA (engenharia, gestor da produção, admin)
-- ---------------------------------------------------------------------
create table if not exists public.correcoes_producao (
  id          bigint generated always as identity primary key,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users(id) default auth.uid(),
  batelada_id bigint not null references public.bateladas(id),
  tipo        text not null check (tipo in ('masseira','padeiro')),
  antes       jsonb,
  depois      jsonb,
  motivo      text not null check (length(motivo) between 3 and 500)
);
create index if not exists correcoes_producao_batelada on public.correcoes_producao (batelada_id);
alter table public.correcoes_producao enable row level security;
alter table public.correcoes_producao force row level security;
revoke all on public.correcoes_producao from anon, authenticated;
grant select on public.correcoes_producao to authenticated;
drop policy if exists leitura on public.correcoes_producao;
create policy leitura on public.correcoes_producao for select to authenticated using (public.acesso_amplo() and not public.so_padeiro());
drop trigger if exists protege on public.correcoes_producao;
create trigger protege before update or delete on public.correcoes_producao for each row execute function public.bloquear_alteracao();

create or replace function public.corrigir_batelada(p jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.bateladas; v_mot text := nullif(btrim(coalesce(p->>'motivo', '')), '');
        v_mac bigint := (p->>'maceira_id')::bigint; v_oper bigint := (p->>'operador_id')::bigint;
begin
  perform public._exigir('finalizar_batelada');
  if v_mot is null or length(v_mot) < 3 then raise exception 'Informe o motivo da correção.'; end if;
  select * into b from public.bateladas where id = (p->>'id')::bigint for update;
  if not found then raise exception 'Batelada não encontrada.'; end if;
  if b.situacao = 'cancelada' then raise exception 'Batelada cancelada não pode ser corrigida.'; end if;
  if v_mac is not null and v_mac is distinct from b.maceira_id then
    if not exists (select 1 from public.maceiras where id = v_mac) then raise exception 'Masseira inválida.'; end if;
    insert into public.correcoes_producao (batelada_id, tipo, antes, depois, motivo)
    values (b.id, 'masseira', jsonb_build_object('maceira_id', b.maceira_id), jsonb_build_object('maceira_id', v_mac), v_mot);
    update public.bateladas set maceira_id = v_mac where id = b.id;
  end if;
  if v_oper is not null and v_oper is distinct from b.operador_id then
    if not exists (select 1 from public.operadores where id = v_oper) then raise exception 'Padeiro inválido.'; end if;
    insert into public.correcoes_producao (batelada_id, tipo, antes, depois, motivo)
    values (b.id, 'padeiro', jsonb_build_object('operador_id', b.operador_id), jsonb_build_object('operador_id', v_oper), v_mot);
    update public.bateladas set operador_id = v_oper where id = b.id;
    -- as movimentações de estoque são imutáveis (registro contábil): a correção fica registrada aqui e na batelada
  end if;
end $$;
revoke execute on function public.corrigir_batelada(jsonb) from public, anon;
grant execute on function public.corrigir_batelada(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. TEMPO REAL (o aviso aparece no tablet na hora)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['avisos_producao','correcoes_producao'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

insert into public.versao_banco (versao, descricao)
select '2.7.0', 'Gestor da produção, avisos de mudança no tablet, fora da ordem e correções de batelada'
where not exists (select 1 from public.versao_banco where versao = '2.7.0');

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Papel gestor_producao aceito' as verificacao,
       case when pg_get_constraintdef(oid) like '%gestor_producao%' then 'OK' else 'ATENÇÃO' end as resultado
  from pg_constraint where conname = 'perfis_papeis_check'
union all
select 'Aviso automático ligado na programação', case when exists (select 1 from pg_trigger where tgname = 'aviso_tablet') then 'OK' else 'ATENÇÃO' end
union all
select 'Marcação "fora da ordem" ligada', case when exists (select 1 from pg_trigger where tgname = 'ordem' and tgrelid = 'public.bateladas'::regclass) then 'OK' else 'ATENÇÃO' end
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Tabelas SEM proteção por linha (RLS)',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'Tabelas que o app consegue gravar direto',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')
        or has_table_privilege('authenticated', c.oid, 'delete'));


-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.9 · ORDEM DA PESAGEM + AVISOS + "BASE"
-- (aplicar DEPOIS da v2.7; pode rodar de novo sem problema; não apaga dados)
--
--  1. Ordem da PESAGEM (prioridade_pesagem): uma ordem única do dia para a pesagem,
--     separada da ordem de cada masseira. Só admin, engenharia e gestor da produção mudam.
--  2. Botão URGENTE: põe a produção em 1º lugar na pesagem E na masseira dela, de uma vez.
--  3. Avisos melhores: um aviso por mudança (não um por linha), com o que mudou em
--     destaque e a nova ordem. A pesagem também recebe avisos e confirma com o próprio login.
--  4. "Mistura" passa a se chamar "Base" (Base – Pão de forma).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ORDEM DA PESAGEM
-- ---------------------------------------------------------------------
alter table public.programacoes add column if not exists prioridade_pesagem integer;
alter table public.programacoes drop constraint if exists programacoes_prioridade_pesagem_check;
alter table public.programacoes add constraint programacoes_prioridade_pesagem_check
  check (prioridade_pesagem is null or prioridade_pesagem between 1 and 9999);
create index if not exists programacoes_dia_pesagem on public.programacoes (data, prioridade_pesagem);

-- as que ainda não têm ordem da pesagem: rodadas intercaladas entre as masseiras
-- (1ª de cada masseira, depois a 2ª de cada uma…)
with o as (
  select g.id, row_number() over (partition by g.data order by g.prioridade nulls last, m.ordem nulls last, g.maceira_id nulls last, g.id) n,
         coalesce((select max(x.prioridade_pesagem) from public.programacoes x where x.data = g.data), 0) base
    from public.programacoes g left join public.maceiras m on m.id = g.maceira_id
   where g.prioridade_pesagem is null)
update public.programacoes p set prioridade_pesagem = least(o.base + o.n, 9999) from o where o.id = p.id;

-- produção nova entra no FIM da fila da pesagem
create or replace function public._prioridade_pesagem_padrao()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.prioridade_pesagem is null then
    select least(coalesce(max(prioridade_pesagem), 0) + 1, 9999) into new.prioridade_pesagem
      from public.programacoes where data = new.data;
  end if;
  return new;
end $$;
revoke execute on function public._prioridade_pesagem_padrao() from public, anon, authenticated;
drop trigger if exists prioridade_pesagem on public.programacoes;
create trigger prioridade_pesagem before insert on public.programacoes for each row execute function public._prioridade_pesagem_padrao();

-- ---------------------------------------------------------------------
-- 2. AVISOS: setor (masseira ou pesagem), tipo "urgente" e detalhe (nova ordem)
-- ---------------------------------------------------------------------
alter table public.avisos_producao add column if not exists setor text not null default 'masseira';
alter table public.avisos_producao drop constraint if exists avisos_producao_setor_check;
alter table public.avisos_producao add constraint avisos_producao_setor_check check (setor in ('masseira','pesagem'));
alter table public.avisos_producao add column if not exists detalhe text;
alter table public.avisos_producao drop constraint if exists avisos_producao_detalhe_check;
alter table public.avisos_producao add constraint avisos_producao_detalhe_check check (detalhe is null or length(detalhe) <= 600);
alter table public.avisos_producao drop constraint if exists avisos_producao_tipo_check;
alter table public.avisos_producao add constraint avisos_producao_tipo_check
  check (tipo in ('ordem','masseira','nova','retirada','quantidade','recado','urgente'));
create index if not exists avisos_producao_pend_setor on public.avisos_producao (setor) where ciente_em is null;

-- "Nova ordem: 1º Pão de forma · 2º Bisnaguinha · …" (fila de uma masseira no dia)
create or replace function public._texto_ordem_masseira(p_mac bigint, p_data date)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select left('Nova ordem: ' || coalesce(string_agg(s.n || 'º ' || s.nome, ' · ' order by s.n), '–'), 600)
    from (select row_number() over (order by g.prioridade nulls last, g.id) n, f.nome
            from public.programacoes g join public.fichas_tecnicas f on f.id = g.ficha_id
           where g.maceira_id = p_mac and g.data = p_data and g.situacao = 'ativa' and g.finalizada_em is null
           order by g.prioridade nulls last, g.id limit 8) s
$$;
-- fila da PESAGEM no dia (só o que ainda falta pesar)
create or replace function public._texto_ordem_pesagem(p_data date)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select left('Ordem da pesagem: ' || coalesce(string_agg(s.n || 'º ' || s.nome, ' · ' order by s.n), '–'), 600)
    from (select row_number() over (order by g.prioridade_pesagem nulls last, g.id) n, f.nome
            from public.programacoes g join public.fichas_tecnicas f on f.id = g.ficha_id
           where g.data = p_data and g.situacao = 'ativa' and g.finalizada_em is null
             and coalesce((select sum(pr.multiplicador) from public.producoes pr where pr.programacao_id = g.id), 0) < g.quantidade - 0.0001
           order by g.prioridade_pesagem nulls last, g.id limit 8) s
$$;
revoke execute on function public._texto_ordem_masseira(bigint, date) from public, anon, authenticated;
revoke execute on function public._texto_ordem_pesagem(date) from public, anon, authenticated;

-- aviso automático da programação (mesmo de antes, com 3 mudanças):
--  · mudança de ORDEM feita pelo quadro vira UM aviso por masseira (feito em reordenar_programacao)
--  · a pesagem também fica sabendo de produção nova ou cancelada no dia
--  · nomes das receitas em MAIÚSCULAS (leitura rápida no tablet)
create or replace function public._aviso_programacao()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ficha text; v_mac_old text; v_mac_new text; v_q text; v_lote boolean := coalesce(current_setting('pss.reordenando', true), '') = '1';
begin
  if new.data is distinct from public._hoje() then return new; end if;              -- só a produção do dia
  select upper(nome) into v_ficha from public.fichas_tecnicas where id = new.ficha_id;
  v_q := trim(to_char(new.quantidade, 'FM999990.##')); v_q := rtrim(v_q, '.');
  if tg_op = 'INSERT' then
    if new.situacao = 'ativa' then
      if new.maceira_id is not null then
        insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto, detalhe) values (new.maceira_id, new.id, 'nova',
          format('NOVA produção: %s (%s bateladas), em %sº lugar.', v_ficha, v_q, coalesce(new.prioridade::text, '?')),
          public._texto_ordem_masseira(new.maceira_id, new.data));
      end if;
      insert into public.avisos_producao (setor, programacao_id, tipo, texto, detalhe) values ('pesagem', new.id, 'nova',
        format('NOVA produção para pesar: %s (%s receitas).', v_ficha, v_q), public._texto_ordem_pesagem(new.data));
    end if;
    return new;
  end if;
  if new.finalizada_em is not null and old.finalizada_em is null then return new; end if;   -- finalização não é mudança
  if new.situacao = 'cancelada' and old.situacao is distinct from 'cancelada' then
    if old.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (old.maceira_id, new.id, 'retirada',
        format('CANCELADA: %s não é mais para fazer.', v_ficha));
    end if;
    insert into public.avisos_producao (setor, programacao_id, tipo, texto) values ('pesagem', new.id, 'retirada',
      format('CANCELADA: %s não é mais para pesar.', v_ficha));
    return new;
  end if;
  if new.situacao <> 'ativa' then return new; end if;
  if new.maceira_id is distinct from old.maceira_id then
    select nome into v_mac_old from public.maceiras where id = old.maceira_id;
    select nome into v_mac_new from public.maceiras where id = new.maceira_id;
    if old.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (old.maceira_id, new.id, 'masseira',
        format('SAIU daqui: %s foi para %s.', v_ficha, coalesce(v_mac_new, 'outra masseira')));
    end if;
    if new.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (new.maceira_id, new.id, 'masseira',
        format('VEIO para cá: %s (%s bateladas), em %sº lugar%s.', v_ficha, v_q, coalesce(new.prioridade::text, '?'),
               case when v_mac_old is not null then ', vindo da ' || v_mac_old else '' end));
    end if;
    return new;
  end if;
  if not v_lote and new.maceira_id is not null and new.prioridade is distinct from old.prioridade then
    insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto, detalhe) values (new.maceira_id, new.id, 'ordem',
      case when new.prioridade = 1 then format('%s passou para o 1º lugar: PRIORIDADE MÁXIMA.', v_ficha)
           else format('%s passou de %sº para %sº lugar.', v_ficha, coalesce(old.prioridade::text, '?'), coalesce(new.prioridade::text, '?')) end,
      public._texto_ordem_masseira(new.maceira_id, new.data));
  end if;
  if new.maceira_id is not null and new.quantidade is distinct from old.quantidade then
    insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (new.maceira_id, new.id, 'quantidade',
      format('QUANTIDADE mudou: %s agora são %s bateladas (antes %s).', v_ficha, v_q, rtrim(trim(to_char(old.quantidade, 'FM999990.##')), '.')));
  end if;
  return new;
end $$;
revoke execute on function public._aviso_programacao() from public, anon, authenticated;

-- Um aviso por fila que mudou. Quem "mudou de verdade" = a única que subiu (ou a única que desceu);
-- as outras só andaram uma casa por consequência.
-- p_antes: {"<id>": {"m": masseira antes, "p": posição antes}}; p_setor: 'masseira' ou 'pesagem'
create or replace function public._avisar_nova_ordem(p_antes jsonb, p_setor text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hoje date := public._hoje(); r record; v_n int := 0; v_txt text; v_prim bigint;
begin
  for r in
    select g.maceira_id mac from public.programacoes g
     where p_setor = 'masseira' and g.id in (select k::bigint from jsonb_object_keys(p_antes) k)
       and g.data = v_hoje and g.maceira_id is not null and g.situacao = 'ativa'
    union
    select null::bigint where p_setor = 'pesagem'
  loop
    with mud as (
      select g.id, upper(f.nome) nome,
             case when p_setor = 'pesagem' then g.prioridade_pesagem else g.prioridade end nova,
             (p_antes -> g.id::text ->> 'p')::int velha
        from public.programacoes g join public.fichas_tecnicas f on f.id = g.ficha_id
       where g.id in (select k::bigint from jsonb_object_keys(p_antes) k) and g.data = v_hoje and g.situacao = 'ativa'
         and (p_setor = 'pesagem' or (g.maceira_id = r.mac and (p_antes -> g.id::text ->> 'm')::bigint is not distinct from r.mac))),
    m2 as (select * from mud where nova is distinct from velha and velha is not null),
    esc as (
      select * from m2 where nova < velha and (select count(*) from m2 where nova < velha) = 1
      union all
      select * from m2 where nova > velha and (select count(*) from m2 where nova < velha) <> 1 and (select count(*) from m2 where nova > velha) = 1
      union all
      select * from m2 where nova < velha and (select count(*) from m2 where nova < velha) > 1 and (select count(*) from m2 where nova > velha) <> 1)
    select left(string_agg(case when nova = 1 then nome || ' passou para o 1º lugar: PRIORIDADE MÁXIMA.'
                                else nome || ' passou de ' || velha || 'º para ' || nova || 'º lugar.' end, ' ' order by nova), 500),
           min(id)
      into v_txt, v_prim from esc;
    if v_txt is not null then
      if p_setor = 'pesagem' then
        insert into public.avisos_producao (setor, programacao_id, tipo, texto, detalhe)
        values ('pesagem', v_prim, 'ordem', v_txt, public._texto_ordem_pesagem(v_hoje));
      else
        insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto, detalhe)
        values (r.mac, v_prim, 'ordem', v_txt, public._texto_ordem_masseira(r.mac, v_hoje));
      end if;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public._avisar_nova_ordem(jsonb, text) from public, anon, authenticated;

-- quadro das masseiras: mesma função de antes + UM aviso por masseira
create or replace function public.reordenar_programacao(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare itj jsonb; v_n int := 0; v_antes jsonb;
begin
  perform public._exigir('programacao');
  if jsonb_typeof(coalesce(p, 'null'::jsonb)) <> 'array' then raise exception 'Lista inválida.'; end if;
  if jsonb_array_length(p) > 500 then raise exception 'Lista grande demais.'; end if;
  select coalesce(jsonb_object_agg(g.id::text, jsonb_build_object('m', g.maceira_id, 'p', g.prioridade)), '{}'::jsonb) into v_antes
    from public.programacoes g where g.id in (select (x->>'id')::bigint from jsonb_array_elements(p) x);
  perform set_config('pss.reordenando', '1', true);
  for itj in select * from jsonb_array_elements(p) loop
    if (itj->>'prioridade') is not null and (itj->>'prioridade')::int not between 1 and 9999 then raise exception 'Posição inválida.'; end if;
    update public.programacoes set maceira_id = (itj->>'maceira_id')::bigint, prioridade = coalesce((itj->>'prioridade')::int, prioridade),
           operador_id = case when itj ? 'operador_id' then (itj->>'operador_id')::bigint else operador_id end,
           atualizado_em = now(), atualizado_por = auth.uid()
     where id = (itj->>'id')::bigint and situacao = 'ativa' and finalizada_em is null;
    v_n := v_n + found::int;
  end loop;
  perform set_config('pss.reordenando', '', true);
  perform public._avisar_nova_ordem(v_antes, 'masseira');
  return v_n;
end $$;
revoke execute on function public.reordenar_programacao(jsonb) from public, anon;
grant execute on function public.reordenar_programacao(jsonb) to authenticated;

-- ordem da pesagem: recebe os ids na ordem desejada ([id1, id2, …] → 1º, 2º, …)
create or replace function public.reordenar_pesagem(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int := 0; v_antes jsonb; r record;
begin
  perform public._exigir('programacao');
  if jsonb_typeof(coalesce(p, 'null'::jsonb)) <> 'array' then raise exception 'Lista inválida.'; end if;
  if jsonb_array_length(p) > 500 then raise exception 'Lista grande demais.'; end if;
  if exists (select 1 from jsonb_array_elements(p) x where jsonb_typeof(x) <> 'number') then raise exception 'Lista inválida.'; end if;
  select coalesce(jsonb_object_agg(g.id::text, jsonb_build_object('p', g.prioridade_pesagem)), '{}'::jsonb) into v_antes
    from public.programacoes g where g.id in (select (x #>> '{}')::bigint from jsonb_array_elements(p) x);
  for r in select (x #>> '{}')::bigint id, min(o) pos from jsonb_array_elements(p) with ordinality t(x, o) group by 1 order by 2 loop
    v_n := v_n + 1;
    update public.programacoes set prioridade_pesagem = v_n, atualizado_em = now(), atualizado_por = auth.uid()
     where id = r.id and situacao = 'ativa' and finalizada_em is null and prioridade_pesagem is distinct from v_n;
  end loop;
  perform public._avisar_nova_ordem(v_antes, 'pesagem');
  return v_n;
end $$;
revoke execute on function public.reordenar_pesagem(jsonb) from public, anon;
grant execute on function public.reordenar_pesagem(jsonb) to authenticated;

-- URGENTE: 1º lugar na pesagem E na masseira dela, com aviso para os dois setores
create or replace function public.programacao_urgente(p_id bigint)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.programacoes; v_nome text;
begin
  perform public._exigir('programacao');
  select * into v from public.programacoes where id = p_id for update;
  if not found or v.situacao <> 'ativa' or v.finalizada_em is not null then raise exception 'Esta produção não está aberta.'; end if;
  select upper(nome) into v_nome from public.fichas_tecnicas where id = v.ficha_id;
  perform set_config('pss.reordenando', '1', true);
  with o as (select g.id, row_number() over (order by case when g.id = p_id then 0 else 1 end, g.prioridade_pesagem nulls last, g.id) n
               from public.programacoes g where g.data = v.data and g.situacao = 'ativa' and g.finalizada_em is null)
  update public.programacoes g set prioridade_pesagem = least(o.n, 9999), atualizado_em = now(), atualizado_por = auth.uid()
    from o where o.id = g.id and g.prioridade_pesagem is distinct from least(o.n, 9999);
  if v.maceira_id is not null then
    with o as (select g.id, row_number() over (order by case when g.id = p_id then 0 else 1 end, g.prioridade nulls last, g.id) n
                 from public.programacoes g where g.data = v.data and g.maceira_id = v.maceira_id and g.situacao = 'ativa' and g.finalizada_em is null)
    update public.programacoes g set prioridade = least(o.n, 9999), atualizado_em = now(), atualizado_por = auth.uid()
      from o where o.id = g.id and g.prioridade is distinct from least(o.n, 9999);
  end if;
  perform set_config('pss.reordenando', '', true);
  if v.data = public._hoje() then
    if v.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto, detalhe) values (v.maceira_id, p_id, 'urgente',
        format('URGENTE: %s passou para o 1º lugar. PRIORIDADE MÁXIMA.', v_nome), public._texto_ordem_masseira(v.maceira_id, v.data));
    end if;
    insert into public.avisos_producao (setor, programacao_id, tipo, texto, detalhe) values ('pesagem', p_id, 'urgente',
      format('URGENTE: pese %s primeiro. PRIORIDADE MÁXIMA.', v_nome), public._texto_ordem_pesagem(v.data));
  end if;
  return true;
end $$;
revoke execute on function public.programacao_urgente(bigint) from public, anon;
grant execute on function public.programacao_urgente(bigint) to authenticated;

-- o padeiro confirma só os avisos da MASSEIRA (nome + senha)
create or replace function public.confirmar_avisos_producao(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_oper bigint := (p->>'operador_id')::bigint; v_n int;
begin
  perform public._exigir('batelada');
  if v_oper is null then raise exception 'Escolha o seu nome.'; end if;
  if not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  update public.avisos_producao set ciente_em = now(), ciente_operador_id = v_oper, ciente_por = auth.uid()
   where ciente_em is null and setor = 'masseira'
     and id in (select (x)::bigint from jsonb_array_elements_text(coalesce(p->'ids', '[]'::jsonb)) x);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.confirmar_avisos_producao(jsonb) from public, anon;
grant execute on function public.confirmar_avisos_producao(jsonb) to authenticated;

-- a pesagem confirma os avisos dela com o próprio login (fica registrado quem e quando)
create or replace function public.confirmar_avisos_pesagem(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  perform public._exigir('saida_receita');
  if jsonb_typeof(coalesce(p->'ids', 'null'::jsonb)) <> 'array' or jsonb_array_length(p->'ids') > 500 then raise exception 'Lista inválida.'; end if;
  update public.avisos_producao set ciente_em = now(), ciente_por = auth.uid()
   where ciente_em is null and setor = 'pesagem'
     and id in (select (x)::bigint from jsonb_array_elements_text(p->'ids') x);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.confirmar_avisos_pesagem(jsonb) from public, anon;
grant execute on function public.confirmar_avisos_pesagem(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. "MISTURA" PASSA A SE CHAMAR "BASE"
-- ---------------------------------------------------------------------
create or replace function public._mistura_da_ficha(p_ficha bigint)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; f public.fichas_tecnicas;
begin
  select id into v_id from public.produtos where ficha_id = p_ficha and categoria = 'intermediario';
  select * into f from public.fichas_tecnicas where id = p_ficha;
  if v_id is not null then
    update public.produtos set descricao = 'Base – ' || f.nome, grupo = 'Base', ativo = f.ativo
     where id = v_id and (descricao <> 'Base – ' || f.nome or grupo is distinct from 'Base' or ativo <> f.ativo);
    return v_id;
  end if;
  insert into public.produtos (codigo, descricao, categoria, grupo, unidade_estoque, controla_estoque, baixa_producao, baixa_requisicao,
                               local_padrao_id, ficha_id, ativo, observacao)
  values ('MIS-' || f.codigo, 'Base – ' || f.nome, 'intermediario', 'Base', 'un', true, true, false,
          public._local_tipo('pesagem'), p_ficha, f.ativo, 'Produto intermediário: 1 un = 1 base pesada (balde). Criado pelo sistema.')
  on conflict (codigo) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.produtos where codigo = 'MIS-' || f.codigo; end if;
  return v_id;
end $$;
revoke execute on function public._mistura_da_ficha(bigint) from public, anon, authenticated;

update public.produtos p set descricao = 'Base – ' || f.nome, grupo = 'Base',
       observacao = replace(coalesce(p.observacao, ''), '1 receita pesada', '1 base pesada')
  from public.fichas_tecnicas f
 where p.ficha_id = f.id and p.categoria = 'intermediario' and (p.descricao <> 'Base – ' || f.nome or p.grupo is distinct from 'Base');

update public.parametros set descricao = replace(replace(descricao, 'mistura', 'base'), 'Mistura', 'Base')
 where descricao ilike '%mistura%';

-- iniciar batelada: igual à anterior; só a mensagem fala em "base"
create or replace function public.iniciar_batelada(p jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_b bigint; v_prog public.programacoes; v_ficha bigint := (p->>'ficha_id')::bigint; f public.fichas_tecnicas;
        v_mac bigint := public._local_tipo('maceiras'); v_mis bigint; e numeric; itj jsonb; v_pr public.produtos;
        v_q numeric; v_mov bigint; v_cm numeric := 0; v_cmac numeric := 0; v_oper bigint := (p->>'operador_id')::bigint;
        v_itens jsonb := '[]'::jsonb; v_padrao jsonb; t record; v_det jsonb := '[]'::jsonb; v_local bigint;
begin
  perform public._exigir('batelada');
  if v_oper is null then raise exception 'Escolha quem está batendo.'; end if;
  if not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  if (p->>'programacao_id') is not null then
    select * into v_prog from public.programacoes where id = (p->>'programacao_id')::bigint;
    if not found or v_prog.situacao <> 'ativa' then raise exception 'Programação não encontrada ou cancelada.'; end if;
    if v_prog.finalizada_em is not null then raise exception 'Esta programação já foi finalizada.'; end if;
    v_ficha := v_prog.ficha_id;
  end if;
  select * into f from public.fichas_tecnicas where id = v_ficha;
  if not found then raise exception 'Receita não encontrada.'; end if;
  if (p->>'maceira_id') is null or not exists (select 1 from public.maceiras where id = (p->>'maceira_id')::bigint) then
    raise exception 'Escolha a maceira.'; end if;
  v_mis := public._mistura_da_ficha(v_ficha);

  -- "Receber e iniciar": recebe as bases desta receita que estão a caminho
  if coalesce((p->>'receber')::boolean, false) then
    for t in select distinct tr.id from public.transferencias tr join public.transferencia_itens ti on ti.transferencia_id = tr.id
              where tr.situacao = 'enviada' and tr.destino_id = v_mac and ti.produto_id = v_mis loop
      perform public.receber_transferencia(jsonb_build_object('id', t.id, 'operador_id', v_oper, 'pin', p->>'pin'));
    end loop;
  end if;

  select coalesce(disponivel, 0) into e from public.estoque_local where produto_id = v_mis and local_id = v_mac;
  if coalesce(e, 0) < 0.9999 then
    raise exception 'A base de % ainda não chegou na masseira. Receba da pesagem antes de iniciar.', f.nome;
  end if;

  insert into public.bateladas (programacao_id, ficha_id, maceira_id, operador_id, rendimento_padrao, observacao)
  values ((p->>'programacao_id')::bigint, v_ficha, (p->>'maceira_id')::bigint, v_oper, f.rendimento_qtd, public._texto(p,'observacao'))
  returning id into v_b;

  -- 1 base sai da Produção Maceiras
  v_mov := public._movimentar(v_mis, 'saida_receita', -1, null,
    jsonb_build_object('batelada_id', v_b, 'local_id', v_mac, 'programacao_id', (p->>'programacao_id')::bigint, 'operador_id', v_oper));
  v_cm := coalesce((select -valor from public.movimentos where id = v_mov), 0);

  -- itens da maceira: os informados (farinha confirmada/trocada, fermento ajustado)
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    select * into v_pr from public.produtos where id = (itj->>'produto_id')::bigint;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if v_pr.categoria <> 'materia_prima' then raise exception 'Na maceira só entra matéria-prima.'; end if;
    v_q := coalesce((itj->>'quantidade')::numeric, 0) * public._fator(v_pr.id, coalesce(itj->>'unidade', v_pr.unidade_estoque));
    if v_q < 0 then raise exception 'Quantidade não pode ser negativa.'; end if;
    v_itens := v_itens || jsonb_build_array(jsonb_build_object('produto_id', v_pr.id, 'quantidade', v_q,
                 'padrao', (itj->>'padrao')::numeric, 'trocou_de', (itj->>'trocou_de')::bigint));
    if v_q = 0 or not v_pr.controla_estoque or not v_pr.baixa_producao then continue; end if;
    v_local := coalesce(v_pr.local_padrao_id, public._local_tipo('deposito'));
    v_mov := public._movimentar(v_pr.id, 'saida_receita', -v_q, null,
      jsonb_build_object('batelada_id', v_b, 'local_id', v_local, 'programacao_id', (p->>'programacao_id')::bigint, 'operador_id', v_oper));
    v_cmac := v_cmac + coalesce((select -valor from public.movimentos where id = v_mov), 0);
    v_det := v_det || jsonb_build_array(jsonb_build_object('produto_id', v_pr.id, 'quantidade', v_q,
               'valor', (select -valor from public.movimentos where id = v_mov)));
  end loop;
  update public.bateladas set itens = v_itens where id = v_b;
  insert into public.batelada_custos (batelada_id, custo_mistura, custo_maceira, custo_total, detalhe)
  values (v_b, v_cm, v_cmac, v_cm + v_cmac, jsonb_build_object('maceira', v_det));
  return v_b;
end $$;
revoke execute on function public.iniciar_batelada(jsonb) from public, anon;
grant execute on function public.iniciar_batelada(jsonb) to authenticated;

insert into public.versao_banco (versao, descricao)
select '2.9.0', 'Ordem da pesagem, botão urgente, avisos melhores (pesagem também), mistura passa a se chamar base'
where not exists (select 1 from public.versao_banco where versao = '2.9.0');

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Ordem da pesagem preenchida' as verificacao,
       case when count(*) filter (where prioridade_pesagem is null) = 0 then 'OK' else 'ATENÇÃO: ' || count(*) filter (where prioridade_pesagem is null) || ' sem ordem' end as resultado
  from public.programacoes
union all
select 'Produção nova entra no fim da pesagem', case when exists (select 1 from pg_trigger where tgname = 'prioridade_pesagem') then 'OK' else 'ATENÇÃO' end
union all
select 'Avisos com setor (masseira/pesagem)', case when exists (select 1 from information_schema.columns where table_name = 'avisos_producao' and column_name = 'setor') then 'OK' else 'ATENÇÃO' end
union all
select 'Funções novas só para quem tem login',
       case when count(*) = 3 then 'OK' else 'ATENÇÃO' end
  from pg_proc p where p.proname in ('reordenar_pesagem','programacao_urgente','confirmar_avisos_pesagem')
   and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute')
union all
select '"Mistura" virou "Base" nos produtos',
       case when count(*) = 0 then 'OK' else 'ATENÇÃO: ' || count(*) end
  from public.produtos where categoria = 'intermediario' and descricao like 'Mistura –%'
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Tabelas SEM proteção por linha (RLS)',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'Tabelas que o app consegue gravar direto',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')
        or has_table_privilege('authenticated', c.oid, 'delete'))
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.9.0') then 'OK (2.9.0)' else 'ATENÇÃO' end;


-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.10 · PADEIRO FINALIZA + TEMPO E TOLERÂNCIA
-- (aplicar DEPOIS da v2.9; pode rodar de novo sem problema; não apaga dados)
--
--  1. Tempo e TOLERÂNCIA por receita (ex.: 30 min + 10 de tolerância). Receita sem tolerância
--     usa o padrão de Parâmetros da produção (producao_tolerancia_batelada_min = 10).
--     Até o tempo: no prazo · até tempo + tolerância: atenção · depois: atrasada.
--  2. O PADEIRO finaliza a batelada (nome + senha, um toque). Não digita quantidade:
--     fica registrado o rendimento médio da receita (o definido pelo engenheiro).
--     Fica registrado qual padeiro finalizou (finalizada_operador_id), além de data e hora.
--  3. A engenharia continua podendo finalizar (bateladas esquecidas), como antes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TEMPO E TOLERÂNCIA POR RECEITA
-- ---------------------------------------------------------------------
alter table public.fichas_tecnicas add column if not exists tolerancia_batelada_min integer;
alter table public.fichas_tecnicas drop constraint if exists fichas_tecnicas_tolerancia_batelada_min_check;
alter table public.fichas_tecnicas add constraint fichas_tecnicas_tolerancia_batelada_min_check
  check (tolerancia_batelada_min is null or tolerancia_batelada_min between 0 and 600);

insert into public.parametros (chave, valor, descricao) values
  ('producao_tolerancia_batelada_min', '10', 'Produção: tolerância padrão da batelada (minutos além do tempo da receita antes de ficar atrasada)')
on conflict (chave) do nothing;

create or replace function public.salvar_parametros_producao(p jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare k text; v text;
begin
  perform public._exigir('producao_config');
  for k, v in select * from jsonb_each_text(p) loop
    if k = 'producao_inicio_turno' then
      if v !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Início do turno inválido: use hora no formato 04:00.'; end if;
    elsif k in ('producao_tolerancia_min','producao_tempo_padrao_min','producao_prazo_finalizar_h','mistura_parada_h') then
      if v !~ '^[0-9]+$' or v::int <= 0 or v::int > 1440 then raise exception 'Valor inválido para %: use um número inteiro maior que zero.', k; end if;
    elsif k = 'producao_tolerancia_batelada_min' then
      if v !~ '^[0-9]+$' or v::int > 600 then raise exception 'Tolerância inválida: use um número de 0 a 600 minutos.'; end if;
    else
      raise exception 'Configuração não permitida aqui: %', k;
    end if;
    update public.parametros set valor = v where chave = k;
  end loop;
end $$;
revoke execute on function public.salvar_parametros_producao(jsonb) from public, anon;
grant execute on function public.salvar_parametros_producao(jsonb) to authenticated;

-- salvar ficha técnica: igual à anterior + tolerância (com histórico)
create or replace function public.salvar_ficha(p jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint := (p->>'id')::bigint; v_old public.fichas_tecnicas; it jsonb; r record;
        v_novos jsonb := '{}'::jsonb; v_desc text[] := '{}'; v_pid bigint; v_q numeric;
        k text; v text; v_pr public.produtos; v_n int := 0; v_cat text;
begin
  perform public._exigir('ficha_tecnica');
  if public._texto(p,'nome') is null then raise exception 'Informe o nome da ficha técnica.'; end if;
  if public._texto(p,'rendimento_qtd') is null and public._texto(p,'rendimento') ~ '^\s*[0-9][0-9.]*(,[0-9]+)?\s*\S' then
    p := p || jsonb_build_object(
      'rendimento_qtd', replace(replace(substring(p->>'rendimento' from '^\s*([0-9][0-9.]*(,[0-9]+)?)'), '.', ''), ',', '.'),
      'rendimento_unidade', coalesce(public._texto(p,'rendimento_unidade'), btrim(regexp_replace(p->>'rendimento', '^\s*[0-9][0-9.]*(,[0-9]+)?\s*', ''))));
  end if;
  if public._texto(p,'rendimento_qtd') is not null and (p->>'rendimento_qtd')::numeric <= 0 then
    raise exception 'O rendimento precisa ser maior que zero.';
  end if;
  if (p->>'tempo_batelada_min') is not null and (p->>'tempo_batelada_min')::int <= 0 then
    raise exception 'O tempo da batelada precisa ser maior que zero.';
  end if;
  if (p->>'tolerancia_batelada_min') is not null and (p->>'tolerancia_batelada_min')::int not between 0 and 600 then
    raise exception 'A tolerância precisa ser de 0 a 600 minutos.';
  end if;
  if (p->>'tempo_batelada_min') is not null and (p->>'tempo_batelada_min')::int > 1440 then
    raise exception 'O tempo da batelada pode ser no máximo 1440 minutos.';
  end if;
  if jsonb_array_length(coalesce(p->'itens','[]'::jsonb)) = 0 then
    raise exception 'A ficha técnica precisa de pelo menos 1 ingrediente.';
  end if;
  if public._texto(p,'codigo') is not null and exists (select 1 from public.fichas_tecnicas
       where lower(codigo) = lower(btrim(p->>'codigo')) and id is distinct from v_id) then
    raise exception 'Já existe uma ficha técnica com o código %.', p->>'codigo';
  end if;
  for it in select * from jsonb_array_elements(p->'itens') loop
    v_pid := (it->>'produto_id')::bigint;
    select categoria into v_cat from public.produtos where id = v_pid;
    if v_cat is null or v_cat not in ('materia_prima','embalagem') then
      raise exception 'Ficha técnica só aceita matéria-prima e embalagem (produto %).', v_pid;
    end if;
    if coalesce((it->>'quantidade')::numeric, 0) <= 0 then
      raise exception 'Quantidade do ingrediente precisa ser maior que zero.';
    end if;
    v_q := case when v_cat = 'embalagem' then (it->>'quantidade')::numeric      -- por unidade produzida
                else (it->>'quantidade')::numeric * public._fator(v_pid, it->>'unidade') end;
    v_novos := jsonb_set(v_novos, array[v_pid::text], to_jsonb(coalesce((v_novos->>v_pid::text)::numeric, 0) + v_q));
  end loop;
  if not exists (select 1 from jsonb_object_keys(v_novos) k2 join public.produtos pr on pr.id = k2::bigint where pr.categoria = 'materia_prima') then
    raise exception 'A ficha técnica precisa de pelo menos 1 matéria-prima.';
  end if;

  if v_id is null then
    insert into public.fichas_tecnicas (codigo, nome, produto_final, rendimento, rendimento_qtd, rendimento_unidade, observacao, ativo,
        linha_id, tempo_batelada_min, tolerancia_batelada_min, atualizado_em, atualizado_por)
    values (coalesce(btrim(p->>'codigo'), 'R' || lpad((select coalesce(max(id),0)+1 from public.fichas_tecnicas)::text, 3, '0')),
            btrim(p->>'nome'), public._texto(p,'produto_final'), public._texto(p,'rendimento'),
            (public._texto(p,'rendimento_qtd'))::numeric, public._texto(p,'rendimento_unidade'),
            public._texto(p,'observacao'), coalesce((p->>'ativo')::boolean, true),
            (p->>'linha_id')::bigint, (p->>'tempo_batelada_min')::int, (p->>'tolerancia_batelada_min')::int, now(), auth.uid())
    returning id into v_id;
    select count(*) into v_n from jsonb_object_keys(v_novos);
    v_desc := array[format('Criou a ficha com %s %s', v_n, case when v_n = 1 then 'item' else 'itens' end)];
  else
    select * into v_old from public.fichas_tecnicas where id = v_id for update;
    if not found then raise exception 'Ficha técnica não encontrada.'; end if;
    if public._texto(p,'codigo') is not null and v_old.codigo is distinct from btrim(p->>'codigo') then
      v_desc := v_desc || format('código: "%s" → "%s"', v_old.codigo, btrim(p->>'codigo')); end if;
    if v_old.nome is distinct from btrim(p->>'nome') then
      v_desc := v_desc || format('nome: "%s" → "%s"', v_old.nome, btrim(p->>'nome')); end if;
    if v_old.produto_final is distinct from public._texto(p,'produto_final') then
      v_desc := v_desc || format('produto final: "%s" → "%s"', coalesce(v_old.produto_final,''), coalesce(public._texto(p,'produto_final'),'')); end if;
    if v_old.rendimento_qtd is distinct from (public._texto(p,'rendimento_qtd'))::numeric
       or v_old.rendimento_unidade is distinct from public._texto(p,'rendimento_unidade') then
      v_desc := v_desc || format('rendimento por receita: %s %s → %s %s', coalesce(public._fmt(v_old.rendimento_qtd),'–'), coalesce(v_old.rendimento_unidade,''),
                                 coalesce(public._fmt((public._texto(p,'rendimento_qtd'))::numeric),'–'), coalesce(public._texto(p,'rendimento_unidade'),'')); end if;
    if v_old.tempo_batelada_min is distinct from (p->>'tempo_batelada_min')::int then
      v_desc := v_desc || format('tempo da batelada: %s → %s min', coalesce(v_old.tempo_batelada_min::text,'–'), coalesce(p->>'tempo_batelada_min','–')); end if;
    if v_old.tolerancia_batelada_min is distinct from (p->>'tolerancia_batelada_min')::int then
      v_desc := v_desc || format('tolerância da batelada: %s → %s min', coalesce(v_old.tolerancia_batelada_min::text,'–'), coalesce(p->>'tolerancia_batelada_min','–')); end if;
    if v_old.linha_id is distinct from (p->>'linha_id')::bigint then
      v_desc := v_desc || 'mudou a linha de produção'::text; end if;
    if v_old.observacao is distinct from public._texto(p,'observacao') then
      v_desc := v_desc || 'alterou a observação'::text; end if;
    if v_old.ativo is distinct from coalesce((p->>'ativo')::boolean, true) then
      v_desc := v_desc || (case when coalesce((p->>'ativo')::boolean, true) then 'reativou a ficha' else 'desativou a ficha' end); end if;
    update public.fichas_tecnicas set codigo = coalesce(btrim(p->>'codigo'), codigo), nome = btrim(p->>'nome'), produto_final = public._texto(p,'produto_final'),
      rendimento = public._texto(p,'rendimento'), rendimento_qtd = (public._texto(p,'rendimento_qtd'))::numeric,
      rendimento_unidade = public._texto(p,'rendimento_unidade'), observacao = public._texto(p,'observacao'),
      linha_id = (p->>'linha_id')::bigint, tempo_batelada_min = (p->>'tempo_batelada_min')::int, tolerancia_batelada_min = (p->>'tolerancia_batelada_min')::int,
      ativo = coalesce((p->>'ativo')::boolean, true), atualizado_em = now(), atualizado_por = auth.uid()
    where id = v_id;
    for r in select fi.id, fi.produto_id, fi.quantidade, pr.descricao, pr.unidade_estoque, pr.categoria
               from public.ficha_itens fi join public.produtos pr on pr.id = fi.produto_id
              where fi.ficha_id = v_id order by fi.id loop
      if not (v_novos ? r.produto_id::text) then
        delete from public.ficha_itens where id = r.id;
        v_desc := v_desc || format('retirou %s (%s %s)', r.descricao, public._fmt(r.quantidade),
                                   case when r.categoria = 'embalagem' then 'por unidade produzida' else public._un(r.unidade_estoque, r.quantidade) end);
      elsif abs((v_novos->>r.produto_id::text)::numeric - r.quantidade) > 0.00005 then
        update public.ficha_itens set quantidade = (v_novos->>r.produto_id::text)::numeric where id = r.id;
        v_desc := v_desc || format('%s: %s → %s %s', r.descricao, public._fmt(r.quantidade),
                                   public._fmt((v_novos->>r.produto_id::text)::numeric),
                                   case when r.categoria = 'embalagem' then 'por unidade produzida' else public._un(r.unidade_estoque, (v_novos->>r.produto_id::text)::numeric) end);
      end if;
      v_novos := v_novos - r.produto_id::text;
    end loop;
  end if;
  for k, v in select key, value from jsonb_each_text(v_novos) loop
    insert into public.ficha_itens (ficha_id, produto_id, quantidade) values (v_id, k::bigint, v::numeric);
    if v_old.id is not null then
      select * into v_pr from public.produtos where id = k::bigint;
      v_desc := v_desc || format('incluiu %s (%s %s)', v_pr.descricao, public._fmt(v::numeric),
                                 case when v_pr.categoria = 'embalagem' then 'por unidade produzida' else public._un(v_pr.unidade_estoque, v::numeric) end);
    end if;
  end loop;
  if coalesce(array_length(v_desc, 1), 0) > 0 then
    insert into public.fichas_historico (ficha_id, usuario_id, descricao)
    values (v_id, auth.uid(), array_to_string(v_desc, '; '));
  end if;
  perform public._mistura_da_ficha(v_id);
  return v_id;
end $$;
revoke execute on function public.salvar_ficha(jsonb) from public, anon;
grant execute on function public.salvar_ficha(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 2. QUEM FINALIZOU (padeiro) + FINALIZAR PELO PADEIRO
-- ---------------------------------------------------------------------
alter table public.bateladas add column if not exists finalizada_operador_id bigint references public.operadores(id);

-- núcleo (o mesmo cálculo de antes: embalagem, custos, rendimento). Só é chamado pelas duas abaixo.
create or replace function public._finalizar_bateladas(p jsonb, p_oper bigint)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare itj jsonb; b public.bateladas; v_q numeric; v_n int := 0; r record; v_un numeric; v_emb numeric; v_cemb numeric;
        v_det jsonb; v_c public.batelada_custos; v_padrao numeric; v_mov bigint;
begin
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    select * into b from public.bateladas where id = (itj->>'id')::bigint for update;
    if not found then raise exception 'Batelada % não encontrada.', itj->>'id'; end if;
    if b.situacao <> 'em_producao' then continue; end if;
    v_q := coalesce((itj->>'quantidade')::numeric, b.rendimento_padrao);
    if v_q is null then raise exception 'A receita da batelada nº % não tem rendimento padrão: digite a quantidade produzida.', b.id; end if;
    if v_q < 0 then raise exception 'Quantidade produzida não pode ser negativa.'; end if;
    v_cemb := 0; v_det := '[]'::jsonb;
    for r in select fi.produto_id, fi.quantidade, pr.* from public.ficha_itens fi join public.produtos pr on pr.id = fi.produto_id
              where fi.ficha_id = b.ficha_id and pr.categoria = 'embalagem' loop
      v_un := v_q * r.quantidade;                                         -- nº de embalagens
      v_emb := case when lower(r.unidade_estoque) = 'kg' then v_un * coalesce(r.peso_embalagem_g, 0) / 1000
                    when lower(r.unidade_estoque) = 'g' then v_un * coalesce(r.peso_embalagem_g, 0)
                    else v_un end;                                         -- na unidade de estoque
      v_cemb := v_cemb + v_emb * r.custo_medio;
      v_det := v_det || jsonb_build_array(jsonb_build_object('produto_id', r.produto_id, 'embalagens', v_un, 'qtd_estoque', v_emb,
                                                             'custo', round(v_emb * r.custo_medio, 4), 'baixou', r.baixa_producao and r.controla_estoque));
      if r.baixa_producao and r.controla_estoque and v_emb > 0 then
        v_mov := public._movimentar(r.produto_id, 'saida_receita', -v_emb, null,
          jsonb_build_object('batelada_id', b.id, 'local_id', coalesce(public._local_tipo('pcp'), r.local_padrao_id), 'programacao_id', b.programacao_id,
                             'observacao', format('Embalagem da batelada nº %s (%s un)', b.id, public._fmt(v_un))));
      end if;
    end loop;
    -- custo padrão da ficha (comparação): ficha × custo médio de hoje
    select coalesce(sum(case when pr.categoria = 'embalagem' then v_q * fi.quantidade *
                              case when lower(pr.unidade_estoque) = 'kg' then coalesce(pr.peso_embalagem_g,0)/1000
                                   when lower(pr.unidade_estoque) = 'g' then coalesce(pr.peso_embalagem_g,0) else 1 end
                             else fi.quantidade end * pr.custo_medio), 0)
      into v_padrao from public.ficha_itens fi join public.produtos pr on pr.id = fi.produto_id where fi.ficha_id = b.ficha_id;
    select * into v_c from public.batelada_custos where batelada_id = b.id;
    update public.batelada_custos set custo_embalagem = round(v_cemb, 4),
           custo_total = round(coalesce(v_c.custo_mistura,0) + coalesce(v_c.custo_maceira,0) + v_cemb, 4),
           custo_unitario = case when v_q > 0 then round((coalesce(v_c.custo_mistura,0) + coalesce(v_c.custo_maceira,0) + v_cemb) / v_q, 6) end,
           custo_padrao = round(v_padrao, 4),
           detalhe = coalesce(detalhe, '{}'::jsonb) || jsonb_build_object('embalagem', v_det)
     where batelada_id = b.id;
    update public.bateladas set situacao = 'finalizada', quantidade_produzida = v_q, finalizada_em = now(), finalizada_por = auth.uid(), finalizada_operador_id = p_oper
     where id = b.id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhuma batelada em produção foi selecionada.'; end if;
  return v_n;
end $$;
revoke execute on function public._finalizar_bateladas(jsonb, bigint) from public, anon, authenticated;

-- engenharia / gestor / admin (tela Finalizar bateladas): como antes
create or replace function public.finalizar_bateladas(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir('finalizar_batelada');
  if jsonb_array_length(coalesce(p->'itens', '[]'::jsonb)) > 200 then raise exception 'Lista grande demais.'; end if;
  return public._finalizar_bateladas(p, null);
end $$;
revoke execute on function public.finalizar_bateladas(jsonb) from public, anon;
grant execute on function public.finalizar_bateladas(jsonb) to authenticated;

-- PADEIRO: um toque + nome e senha. Sem quantidade: vale o rendimento médio da receita.
create or replace function public.finalizar_batelada_padeiro(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_oper bigint := (p->>'operador_id')::bigint; b public.bateladas; v_rend numeric;
begin
  perform public._exigir('batelada');
  if v_oper is null then raise exception 'Escolha o seu nome.'; end if;
  if not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  select * into b from public.bateladas where id = (p->>'id')::bigint for update;
  if not found then raise exception 'Batelada não encontrada.'; end if;
  if b.situacao = 'finalizada' then return 0; end if;                          -- toque repetido: não faz nada
  if b.situacao <> 'em_producao' then raise exception 'Esta batelada foi cancelada.'; end if;
  v_rend := coalesce(b.rendimento_padrao, (select rendimento_qtd from public.fichas_tecnicas where id = b.ficha_id));
  if v_rend is null then
    raise exception 'Esta receita ainda não tem o rendimento médio cadastrado. Avise o engenheiro (Fichas técnicas).';
  end if;
  return public._finalizar_bateladas(jsonb_build_object('itens', jsonb_build_array(jsonb_build_object('id', b.id, 'quantidade', v_rend))), v_oper);
end $$;
revoke execute on function public.finalizar_batelada_padeiro(jsonb) from public, anon;
grant execute on function public.finalizar_batelada_padeiro(jsonb) to authenticated;

insert into public.versao_banco (versao, descricao)
select '2.10.0', 'Padeiro finaliza a batelada (rendimento médio), tempo e tolerância por receita'
where not exists (select 1 from public.versao_banco where versao = '2.10.0');

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Tolerância na receita' as verificacao,
       case when exists (select 1 from information_schema.columns where table_name = 'fichas_tecnicas' and column_name = 'tolerancia_batelada_min') then 'OK' else 'ATENÇÃO' end as resultado
union all
select 'Tolerância padrão nos parâmetros', case when exists (select 1 from public.parametros where chave = 'producao_tolerancia_batelada_min') then 'OK' else 'ATENÇÃO' end
union all
select 'Padeiro que finalizou fica registrado', case when exists (select 1 from information_schema.columns where table_name = 'bateladas' and column_name = 'finalizada_operador_id') then 'OK' else 'ATENÇÃO' end
union all
select 'Núcleo de finalização fechado (só uso interno)',
       case when not has_function_privilege('authenticated', 'public._finalizar_bateladas(jsonb, bigint)', 'execute')
             and not has_function_privilege('anon', 'public._finalizar_bateladas(jsonb, bigint)', 'execute') then 'OK' else 'ATENÇÃO' end
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Tabelas SEM proteção por linha (RLS)',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'Tabelas que o app consegue gravar direto',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')
        or has_table_privilege('authenticated', c.oid, 'delete'))
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.10.0') then 'OK (2.10.0)' else 'ATENÇÃO' end;


-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.11 · PRÉ-CADASTRO NO RECEBIMENTO
-- (aplicar DEPOIS da v2.10; pode rodar de novo sem problema; não apaga dados)
--
--  1. Recebimento SEM pedido: quem recebe pode fazer o PRÉ-CADASTRO de um fornecedor
--     (só a razão social) e de um produto (nome curto + unidade + tipo), na hora.
--  2. O pré-cadastro fica marcado até o COMPRADOR abrir e salvar o cadastro
--     (aí sai do sininho dele). Fica registrado quem pré-cadastrou e quem revisou.
--  3. Recebimento sem pedido exige fornecedor e número da nota fiscal (vale no banco).
--  4. Sininho por responsável: cada pessoa marca o que já viu (tabela sininho_vistos, só dela).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MARCAS DE PRÉ-CADASTRO
-- ---------------------------------------------------------------------
alter table public.produtos     add column if not exists pre_cadastro     boolean not null default false;
alter table public.produtos     add column if not exists pre_cadastro_por uuid references auth.users(id);
alter table public.produtos     add column if not exists pre_cadastro_em  timestamptz;
alter table public.produtos     add column if not exists revisado_por     uuid references auth.users(id);
alter table public.produtos     add column if not exists revisado_em      timestamptz;
alter table public.fornecedores add column if not exists pre_cadastro     boolean not null default false;
alter table public.fornecedores add column if not exists pre_cadastro_por uuid references auth.users(id);
alter table public.fornecedores add column if not exists pre_cadastro_em  timestamptz;
alter table public.fornecedores add column if not exists revisado_por     uuid references auth.users(id);
alter table public.fornecedores add column if not exists revisado_em      timestamptz;
create index if not exists produtos_pre_cadastro on public.produtos (id) where pre_cadastro;
create index if not exists fornecedores_pre_cadastro on public.fornecedores (id) where pre_cadastro;

-- ---------------------------------------------------------------------
-- 2. PRÉ-CADASTRAR (quem recebe mercadoria: admin, almoxarifado, recebimento)
-- ---------------------------------------------------------------------
create or replace function public.pre_cadastrar_fornecedor(p jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_nome text := btrim(regexp_replace(coalesce(p->>'nome', ''), '\s+', ' ', 'g')); v_id bigint;
begin
  perform public._exigir('recebimento');
  if length(v_nome) < 3 or length(v_nome) > 150 then raise exception 'Escreva a razão social do fornecedor (de 3 a 150 letras).'; end if;
  -- já existe com esse nome? usa o mesmo (não duplica)
  select id into v_id from public.fornecedores
   where lower(nome) = lower(v_nome) or lower(coalesce(razao_social, '')) = lower(v_nome) order by ativo desc, id limit 1;
  if v_id is not null then
    update public.fornecedores set ativo = true where id = v_id and not ativo;
    return v_id;
  end if;
  insert into public.fornecedores (nome, razao_social, observacao, ativo, pre_cadastro, pre_cadastro_por, pre_cadastro_em)
  values (v_nome, v_nome, 'Pré-cadastro feito no recebimento. O comprador precisa completar (CNPJ, contato, condição de pagamento).',
          true, true, auth.uid(), now())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.pre_cadastrar_fornecedor(jsonb) from public, anon;
grant execute on function public.pre_cadastrar_fornecedor(jsonb) to authenticated;

create or replace function public.pre_cadastrar_produto(p jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_desc text := btrim(regexp_replace(coalesce(p->>'descricao', ''), '\s+', ' ', 'g'));
        v_un text := btrim(coalesce(p->>'unidade', '')); v_cat text := coalesce(nullif(btrim(p->>'categoria'), ''), 'outros');
        v_id bigint; v_cod text; v_n bigint;
begin
  perform public._exigir('recebimento');
  if length(v_desc) < 3 or length(v_desc) > 80 then raise exception 'Escreva um nome curto para o produto (de 3 a 80 letras). Ex.: Caneta azul.'; end if;
  if v_un not in ('kg','g','L','mL','un','m','cx','pct','rolo','par') then raise exception 'Escolha a unidade (kg, g, L, mL, un, m, cx, pct, rolo ou par).'; end if;
  if v_cat not in ('materia_prima','embalagem','escritorio','limpeza','outros') then raise exception 'Tipo de produto inválido.'; end if;
  -- já existe um produto ativo com esse nome? usa o mesmo (não duplica)
  select id into v_id from public.produtos where lower(descricao) = lower(v_desc) and ativo order by id limit 1;
  if v_id is not null then return v_id; end if;
  select coalesce(max(id), 0) + 1 into v_n from public.produtos;
  loop
    v_cod := 'PRE-' || lpad(v_n::text, 5, '0');
    exit when not exists (select 1 from public.produtos where codigo = v_cod);
    v_n := v_n + 1;
  end loop;
  insert into public.produtos (codigo, descricao, categoria, unidade_estoque, controla_estoque, baixa_producao, baixa_requisicao, observacao, ativo,
                               pre_cadastro, pre_cadastro_por, pre_cadastro_em)
  values (v_cod, v_desc, v_cat, v_un, true, false, true,
          'Pré-cadastro feito no recebimento. O comprador precisa completar (grupo, unidade de compra, mínimo, fornecedor).', true,
          true, auth.uid(), now())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.pre_cadastrar_produto(jsonb) from public, anon;
grant execute on function public.pre_cadastrar_produto(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. O COMPRADOR SALVOU O CADASTRO → deixa de ser pré-cadastro
--    (movimento de estoque — saldo/custo — não conta como revisão)
-- ---------------------------------------------------------------------
create or replace function public._revisar_pre_produto()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.pre_cadastro and new.pre_cadastro and public.pode('cadastro_produto')
     and new.saldo is not distinct from old.saldo and new.custo_medio is not distinct from old.custo_medio then
    new.pre_cadastro := false; new.revisado_por := auth.uid(); new.revisado_em := now();
  end if;
  return new;
end $$;
revoke execute on function public._revisar_pre_produto() from public, anon, authenticated;
drop trigger if exists revisar_pre_cadastro on public.produtos;
create trigger revisar_pre_cadastro before update on public.produtos for each row execute function public._revisar_pre_produto();

create or replace function public._revisar_pre_fornecedor()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.pre_cadastro and new.pre_cadastro and public.pode('cadastro_fornecedor') then
    new.pre_cadastro := false; new.revisado_por := auth.uid(); new.revisado_em := now();
  end if;
  return new;
end $$;
revoke execute on function public._revisar_pre_fornecedor() from public, anon, authenticated;
drop trigger if exists revisar_pre_cadastro on public.fornecedores;
create trigger revisar_pre_cadastro before update on public.fornecedores for each row execute function public._revisar_pre_fornecedor();

-- ---------------------------------------------------------------------
-- 4. RECEBIMENTO SEM PEDIDO: fornecedor e nota fiscal obrigatórios
-- ---------------------------------------------------------------------
create or replace function public._recebimento_sem_pedido_ok()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.pedido_id is null then
    if new.fornecedor_id is null then raise exception 'Escolha o fornecedor (se não estiver cadastrado, toque no + para o pré-cadastro).'; end if;
    if nullif(btrim(coalesce(new.nota_fiscal, '')), '') is null then raise exception 'Informe o número da nota fiscal.'; end if;
  end if;
  if new.nota_fiscal is not null and length(new.nota_fiscal) > 60 then raise exception 'Número da nota fiscal muito longo.'; end if;
  return new;
end $$;
revoke execute on function public._recebimento_sem_pedido_ok() from public, anon, authenticated;
drop trigger if exists sem_pedido_ok on public.recebimentos;
create trigger sem_pedido_ok before insert on public.recebimentos for each row execute function public._recebimento_sem_pedido_ok();

-- ---------------------------------------------------------------------
-- 5. SININHO: o que cada pessoa já viu (avisos só informativos, ex.: "mercadoria recebida")
--    Cada um lê e grava só os próprios registros.
-- ---------------------------------------------------------------------
create table if not exists public.sininho_vistos (
  id         bigint generated always as identity unique,
  usuario_id uuid not null default auth.uid() references auth.users(id),
  chave      text not null check (chave ~ '^[a-z_]{2,20}:[0-9]{1,18}$'),
  visto_em   timestamptz not null default now(),
  primary key (usuario_id, chave)
);
alter table public.sininho_vistos enable row level security;
alter table public.sininho_vistos force row level security;
revoke all on public.sininho_vistos from anon, authenticated;
grant select on public.sininho_vistos to authenticated;
drop policy if exists proprio on public.sininho_vistos;
create policy proprio on public.sininho_vistos for select to authenticated using (usuario_id = auth.uid());

create or replace function public.marcar_vistos(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if auth.uid() is null or not public.usuario_ativo() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p, 'null'::jsonb)) <> 'array' or jsonb_array_length(p) > 300 then raise exception 'Lista inválida.'; end if;
  insert into public.sininho_vistos (usuario_id, chave)
  select auth.uid(), x from jsonb_array_elements_text(p) x where x ~ '^[a-z_]{2,20}:[0-9]{1,18}$'
  on conflict do nothing;
  get diagnostics v_n = row_count;
  delete from public.sininho_vistos where usuario_id = auth.uid() and visto_em < now() - interval '120 days';   -- não acumula
  return v_n;
end $$;
revoke execute on function public.marcar_vistos(jsonb) from public, anon;
grant execute on function public.marcar_vistos(jsonb) to authenticated;

insert into public.versao_banco (versao, descricao)
select '2.11.0', 'Pré-cadastro no recebimento sem pedido (comprador revisa) e sininho por responsável'
where not exists (select 1 from public.versao_banco where versao = '2.11.0');

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Pré-cadastro em produtos e fornecedores' as verificacao,
       case when (select count(*) from information_schema.columns where table_name in ('produtos','fornecedores') and column_name = 'pre_cadastro') = 2
            then 'OK' else 'ATENÇÃO' end as resultado
union all
select 'Revisão do comprador ligada', case when (select count(*) from pg_trigger where tgname = 'revisar_pre_cadastro') = 2 then 'OK' else 'ATENÇÃO' end
union all
select 'Sem pedido exige fornecedor e nota', case when exists (select 1 from pg_trigger where tgname = 'sem_pedido_ok') then 'OK' else 'ATENÇÃO' end
union all
select 'Funções novas só para quem tem login',
       case when count(*) = 3 then 'OK' else 'ATENÇÃO' end
  from pg_proc p where p.proname in ('pre_cadastrar_fornecedor','pre_cadastrar_produto','marcar_vistos')
   and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute')
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Tabelas SEM proteção por linha (RLS)',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'Tabelas que o app consegue gravar direto',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')
        or has_table_privilege('authenticated', c.oid, 'delete'))
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.11.0') then 'OK (2.11.0)' else 'ATENÇÃO' end;


-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.13 · PREFERÊNCIAS DE CADA PESSOA
-- (aplicar DEPOIS da v2.11; pode rodar de novo sem problema; não apaga dados)
--
--  Guarda as escolhas de cada pessoa nas telas (ex.: quais colunas aparecem em cada
--  relatório). Cada um lê e grava SÓ as próprias preferências; nada de dados da empresa.
-- =====================================================================

create table if not exists public.preferencias_usuario (
  id            bigint generated always as identity unique,
  usuario_id    uuid not null default auth.uid() references auth.users(id),
  chave         text not null check (chave ~ '^[a-z0-9_.-]{2,60}$'),
  valor         jsonb not null check (pg_column_size(valor) <= 8000),
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, chave)
);
alter table public.preferencias_usuario enable row level security;
alter table public.preferencias_usuario force row level security;
revoke all on public.preferencias_usuario from anon, authenticated;
grant select on public.preferencias_usuario to authenticated;
drop policy if exists proprio on public.preferencias_usuario;
create policy proprio on public.preferencias_usuario for select to authenticated using (usuario_id = auth.uid());

-- grava (ou apaga, com valor nulo = "voltar ao padrão") uma preferência da própria pessoa
create or replace function public.salvar_preferencia(p_chave text, p_valor jsonb)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.usuario_ativo() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_chave is null or p_chave !~ '^[a-z0-9_.-]{2,60}$' then raise exception 'Preferência inválida.'; end if;
  if p_valor is null then
    delete from public.preferencias_usuario where usuario_id = auth.uid() and chave = p_chave;
    return true;
  end if;
  if pg_column_size(p_valor) > 8000 then raise exception 'Preferência grande demais.'; end if;
  if (select count(*) from public.preferencias_usuario where usuario_id = auth.uid()) >= 200
     and not exists (select 1 from public.preferencias_usuario where usuario_id = auth.uid() and chave = p_chave) then
    raise exception 'Preferências demais para este usuário.';
  end if;
  insert into public.preferencias_usuario (usuario_id, chave, valor, atualizado_em)
  values (auth.uid(), p_chave, p_valor, now())
  on conflict (usuario_id, chave) do update set valor = excluded.valor, atualizado_em = now();
  return true;
end $$;
revoke execute on function public.salvar_preferencia(text, jsonb) from public, anon;
grant execute on function public.salvar_preferencia(text, jsonb) to authenticated;

insert into public.versao_banco (versao, descricao)
select '2.13.0', 'Preferências de cada pessoa (colunas visíveis nos relatórios)'
where not exists (select 1 from public.versao_banco where versao = '2.13.0');

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Tabela de preferências protegida (RLS)' as verificacao,
       case when (select relrowsecurity from pg_class where oid = 'public.preferencias_usuario'::regclass) then 'OK' else 'ATENÇÃO' end as resultado
union all
select 'Função nova só para quem tem login',
       case when not has_function_privilege('anon', 'public.salvar_preferencia(text, jsonb)', 'execute')
             and has_function_privilege('authenticated', 'public.salvar_preferencia(text, jsonb)', 'execute') then 'OK' else 'ATENÇÃO' end
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Tabelas SEM proteção por linha (RLS)',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'Tabelas que o app consegue gravar direto',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')
        or has_table_privilege('authenticated', c.oid, 'delete'))
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.13.0') then 'OK (2.13.0)' else 'ATENÇÃO' end;


-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.16 · PADRÃO DOS NOMES NOS CADASTROS
-- (aplicar DEPOIS da v2.13; pode rodar de novo sem problema; não apaga dados)
--
--  Todo nome de cadastro fica com a PRIMEIRA LETRA MAIÚSCULA e o resto minúsculo
--  (ex.: "FARINHA DE SOJA" → "Farinha de soja"); espaços repetidos viram um só.
--  Só a RAZÃO SOCIAL (e a UF) ficam TODAS MAIÚSCULAS.
--  Vale para qualquer origem: tela, importação de planilha, pré-cadastro no recebimento.
--  Os nomes que já existem são arrumados agora; cada troca fica na auditoria (com o nome antigo).
-- =====================================================================

-- primeira letra maiúscula, resto minúsculo, sem espaços sobrando.
-- Siglas conhecidas continuam maiúsculas (ex.: PCP, PSS, PVC, UHT, BOPP).
create or replace function public.nome_padrao(t text)
returns text language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  s text; sg text;
begin
  if t is null then return null; end if;
  s := btrim(regexp_replace(t, '\s+', ' ', 'g'));
  if s = '' then return ''; end if;
  s := upper(left(s, 1)) || lower(substr(s, 2));
  foreach sg in array array['PCP', 'PSS', 'PVC', 'UHT', 'BOPP', 'PEAD', 'PEBD', 'CNPJ', 'CPF', 'LTDA', 'EPI'] loop
    s := regexp_replace(s, '\m' || sg || '\M', sg, 'gi');
  end loop;
  return s;
end $$;
-- tudo maiúsculo (razão social, UF)
create or replace function public.nome_maiusculo(t text)
returns text language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when t is null then null else upper(btrim(regexp_replace(t, '\s+', ' ', 'g'))) end
$$;
revoke execute on function public.nome_padrao(text) from public, anon, authenticated;
revoke execute on function public.nome_maiusculo(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- gatilhos: arrumam o nome ANTES de gravar (inserir ou alterar)
-- ---------------------------------------------------------------------
create or replace function public._padrao_produto()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.descricao := public.nome_padrao(new.descricao);
  new.grupo := public.nome_padrao(new.grupo);
  new.marca := public.nome_padrao(new.marca);
  return new;
end $$;

create or replace function public._padrao_fornecedor()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_padrao(new.nome);
  new.razao_social := public.nome_maiusculo(new.razao_social);
  new.contato := public.nome_padrao(new.contato);
  new.endereco := public.nome_padrao(new.endereco);
  new.bairro := public.nome_padrao(new.bairro);
  new.cidade := public.nome_padrao(new.cidade);
  new.uf := public.nome_maiusculo(new.uf);
  return new;
end $$;

create or replace function public._padrao_perfil()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_padrao(new.nome);
  new.funcao := public.nome_padrao(new.funcao);
  return new;
end $$;

create or replace function public._padrao_ficha()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_padrao(new.nome);
  new.produto_final := public.nome_padrao(new.produto_final);
  return new;
end $$;

create or replace function public._padrao_unidade()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_padrao(new.nome);
  new.cidade := public.nome_padrao(new.cidade);
  return new;
end $$;

-- operadores (padeiros), locais, linhas de produção e masseiras: só o nome
create or replace function public._padrao_so_nome()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_padrao(new.nome);
  return new;
end $$;

revoke execute on function public._padrao_produto() from public, anon, authenticated;
revoke execute on function public._padrao_fornecedor() from public, anon, authenticated;
revoke execute on function public._padrao_perfil() from public, anon, authenticated;
revoke execute on function public._padrao_ficha() from public, anon, authenticated;
revoke execute on function public._padrao_unidade() from public, anon, authenticated;
revoke execute on function public._padrao_so_nome() from public, anon, authenticated;

drop trigger if exists padronizar_nomes on public.produtos;
create trigger padronizar_nomes before insert or update on public.produtos for each row execute function public._padrao_produto();
drop trigger if exists padronizar_nomes on public.fornecedores;
create trigger padronizar_nomes before insert or update on public.fornecedores for each row execute function public._padrao_fornecedor();
drop trigger if exists padronizar_nomes on public.perfis;
create trigger padronizar_nomes before insert or update on public.perfis for each row execute function public._padrao_perfil();
drop trigger if exists padronizar_nomes on public.fichas_tecnicas;
create trigger padronizar_nomes before insert or update on public.fichas_tecnicas for each row execute function public._padrao_ficha();
drop trigger if exists padronizar_nomes on public.unidades;
create trigger padronizar_nomes before insert or update on public.unidades for each row execute function public._padrao_unidade();
drop trigger if exists padronizar_nomes on public.operadores;
create trigger padronizar_nomes before insert or update on public.operadores for each row execute function public._padrao_so_nome();
drop trigger if exists padronizar_nomes on public.locais;
create trigger padronizar_nomes before insert or update on public.locais for each row execute function public._padrao_so_nome();
drop trigger if exists padronizar_nomes on public.linhas_producao;
create trigger padronizar_nomes before insert or update on public.linhas_producao for each row execute function public._padrao_so_nome();
drop trigger if exists padronizar_nomes on public.maceiras;
create trigger padronizar_nomes before insert or update on public.maceiras for each row execute function public._padrao_so_nome();

-- ---------------------------------------------------------------------
-- arruma os nomes que já existem (só as linhas que mudam; o gatilho faz o trabalho)
-- ---------------------------------------------------------------------
update public.produtos set descricao = descricao
 where descricao is distinct from public.nome_padrao(descricao) or grupo is distinct from public.nome_padrao(grupo)
    or marca is distinct from public.nome_padrao(marca);
update public.fornecedores set nome = nome
 where nome is distinct from public.nome_padrao(nome) or razao_social is distinct from public.nome_maiusculo(razao_social)
    or contato is distinct from public.nome_padrao(contato) or endereco is distinct from public.nome_padrao(endereco)
    or bairro is distinct from public.nome_padrao(bairro) or cidade is distinct from public.nome_padrao(cidade)
    or uf is distinct from public.nome_maiusculo(uf);
update public.perfis set nome = nome
 where nome is distinct from public.nome_padrao(nome) or funcao is distinct from public.nome_padrao(funcao);
update public.fichas_tecnicas set nome = nome
 where nome is distinct from public.nome_padrao(nome) or produto_final is distinct from public.nome_padrao(produto_final);
update public.unidades set nome = nome
 where nome is distinct from public.nome_padrao(nome) or cidade is distinct from public.nome_padrao(cidade);
update public.operadores set nome = nome where nome is distinct from public.nome_padrao(nome);
update public.locais set nome = nome where nome is distinct from public.nome_padrao(nome);
update public.linhas_producao set nome = nome where nome is distinct from public.nome_padrao(nome);
update public.maceiras set nome = nome where nome is distinct from public.nome_padrao(nome);

insert into public.versao_banco (versao, descricao)
values ('2.16.0', 'Padrão dos nomes nos cadastros (1ª letra maiúscula; razão social toda maiúscula)')
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Nomes fora do padrão (todos os cadastros)' as verificacao,
       case when n = 0 then 'OK (nenhum)' else 'ATENÇÃO: ' || n end as resultado
  from (select (select count(*) from public.produtos where descricao is distinct from public.nome_padrao(descricao) or grupo is distinct from public.nome_padrao(grupo) or marca is distinct from public.nome_padrao(marca))
             + (select count(*) from public.fornecedores where nome is distinct from public.nome_padrao(nome) or razao_social is distinct from public.nome_maiusculo(razao_social) or cidade is distinct from public.nome_padrao(cidade))
             + (select count(*) from public.perfis where nome is distinct from public.nome_padrao(nome) or funcao is distinct from public.nome_padrao(funcao))
             + (select count(*) from public.fichas_tecnicas where nome is distinct from public.nome_padrao(nome))
             + (select count(*) from public.operadores where nome is distinct from public.nome_padrao(nome))
             + (select count(*) from public.locais where nome is distinct from public.nome_padrao(nome))
             + (select count(*) from public.maceiras where nome is distinct from public.nome_padrao(nome)) as n) x
union all
select 'Gatilhos de padrão nos 9 cadastros',
       case when count(*) = 9 then 'OK (9)' else 'ATENÇÃO: ' || count(*) end
  from pg_trigger where tgname = 'padronizar_nomes' and not tgisinternal
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Tabelas SEM proteção por linha (RLS)',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.16.0') then 'OK (2.16.0)' else 'ATENÇÃO' end;


-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.17 · CIDADES E PESSOAS COM CADA PALAVRA MAIÚSCULA
-- (aplicar DEPOIS da v2.16; pode rodar de novo sem problema; não apaga dados)
--
--  Cidades, bairros, endereços, nomes de pessoas (usuários, padeiros, contato) e nome fantasia do
--  fornecedor: PRIMEIRA LETRA DE CADA PALAVRA maiúscula; palavras de ligação (de, da, do, das, dos, e,
--  com, para, em) ficam minúsculas, menos quando começam o nome.
--    ex.: "RIBEIRÃO PRETO" → "Ribeirão Preto" · "maria da silva" → "Maria da Silva"
--  Produtos, funções, locais, fichas etc. continuam com só a 1ª letra maiúscula (v2.16).
--  Razão social e UF continuam TODAS MAIÚSCULAS. Cada troca fica na auditoria.
-- =====================================================================

create or replace function public.nome_titulo(t text)
returns text language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  partes text[]; p text; i int; r text := ''; sg text;
  ligacao constant text[] := array['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em', 'na', 'no', 'nas', 'nos', 'a', 'o', 'c/', 'p/'];
begin
  if t is null then return null; end if;
  t := btrim(regexp_replace(t, '\s+', ' ', 'g'));
  if t = '' then return ''; end if;
  partes := string_to_array(lower(t), ' ');
  for i in 1 .. array_length(partes, 1) loop
    p := partes[i];
    if i > 1 and p = any (ligacao) then
      r := r || ' ' || p;
    else
      r := r || case when i > 1 then ' ' else '' end || upper(left(p, 1)) || substr(p, 2);
    end if;
  end loop;
  foreach sg in array array['PCP', 'PSS', 'PVC', 'UHT', 'BOPP', 'PEAD', 'PEBD', 'CNPJ', 'CPF', 'LTDA', 'EPI'] loop
    r := regexp_replace(r, '\m' || sg || '\M', sg, 'gi');
  end loop;
  return r;
end $$;
revoke execute on function public.nome_titulo(text) from public, anon, authenticated;

create or replace function public._padrao_fornecedor()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_titulo(new.nome);
  new.razao_social := public.nome_maiusculo(new.razao_social);
  new.contato := public.nome_titulo(new.contato);
  new.endereco := public.nome_titulo(new.endereco);
  new.bairro := public.nome_titulo(new.bairro);
  new.cidade := public.nome_titulo(new.cidade);
  new.uf := public.nome_maiusculo(new.uf);
  return new;
end $$;

create or replace function public._padrao_perfil()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_titulo(new.nome);        -- pessoa
  new.funcao := public.nome_padrao(new.funcao);     -- função: só a 1ª letra
  return new;
end $$;

create or replace function public._padrao_unidade()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_padrao(new.nome);
  new.cidade := public.nome_titulo(new.cidade);
  return new;
end $$;

-- padeiros/operadores: nome de pessoa
create or replace function public._padrao_pessoa()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_titulo(new.nome);
  return new;
end $$;
revoke execute on function public._padrao_fornecedor() from public, anon, authenticated;
revoke execute on function public._padrao_perfil() from public, anon, authenticated;
revoke execute on function public._padrao_unidade() from public, anon, authenticated;
revoke execute on function public._padrao_pessoa() from public, anon, authenticated;

drop trigger if exists padronizar_nomes on public.operadores;
create trigger padronizar_nomes before insert or update on public.operadores for each row execute function public._padrao_pessoa();

-- arruma os que já existem (só as linhas que mudam)
update public.fornecedores set nome = nome
 where nome is distinct from public.nome_titulo(nome) or contato is distinct from public.nome_titulo(contato)
    or endereco is distinct from public.nome_titulo(endereco) or bairro is distinct from public.nome_titulo(bairro)
    or cidade is distinct from public.nome_titulo(cidade);
update public.perfis set nome = nome where nome is distinct from public.nome_titulo(nome);
update public.unidades set cidade = cidade where cidade is distinct from public.nome_titulo(cidade);
update public.operadores set nome = nome where nome is distinct from public.nome_titulo(nome);

insert into public.versao_banco (versao, descricao)
values ('2.17.0', 'Cidades, endereços e nomes de pessoas/fornecedores com cada palavra maiúscula')
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Cidades e nomes de pessoas fora do padrão' as verificacao,
       case when n = 0 then 'OK (nenhum)' else 'ATENÇÃO: ' || n end as resultado
  from (select (select count(*) from public.fornecedores where nome is distinct from public.nome_titulo(nome) or cidade is distinct from public.nome_titulo(cidade))
             + (select count(*) from public.perfis where nome is distinct from public.nome_titulo(nome) or funcao is distinct from public.nome_padrao(funcao))
             + (select count(*) from public.operadores where nome is distinct from public.nome_titulo(nome))
             + (select count(*) from public.produtos where descricao is distinct from public.nome_padrao(descricao)) as n) x
union all
select 'Teste: ribeirão preto / maria da silva',
       case when public.nome_titulo('RIBEIRÃO PRETO') = 'Ribeirão Preto' and public.nome_titulo('maria DA silva') = 'Maria da Silva'
                 and public.nome_titulo('são pedro do turvo') = 'São Pedro do Turvo' then 'OK' else 'ATENÇÃO' end
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.17.0') then 'OK (2.17.0)' else 'ATENÇÃO' end;


-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.18 · PRAZO PARA CORRIGIR LANÇAMENTOS
-- (aplicar DEPOIS da v2.17; pode rodar de novo sem problema; não apaga dados)
--
--  Correção de lançamento (Kardex / Saídas):
--   · ADMINISTRADOR: a qualquer momento (como antes).
--   · Almoxarifado e quem fez o lançamento: só no MESMO DIA (até 23h59, horário de Brasília).
--   · Depois do prazo: aviso "Prazo para correção encerrado" e o acerto é feito por INVENTÁRIO.
-- =====================================================================

create or replace function public.corrigir_movimento(p_id bigint, p_quantidade_correta numeric,
                                                     p_unidade text, p_motivo text)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.movimentos; v_prod public.produtos; v_efetiva numeric; v_nova numeric; v_delta numeric;
        v_custo numeric; v_novo bigint; v_proprio boolean; v_mesmo_dia boolean;
begin
  if not public.usuario_ativo() then raise exception 'Usuário inativo.' using errcode = '42501'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Informe o motivo da correção.'; end if;
  select * into o from public.movimentos where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if o.tipo = 'correcao' then raise exception 'Corrija o lançamento original, não a correção.'; end if;
  if o.tipo in ('transferencia','entrada_producao') or o.batelada_id is not null then
    raise exception 'Este lançamento é automático (transferência ou produção): corrija pela própria tela de origem.';
  end if;

  -- REGRA DE PRAZO (v2.18): só o ADMINISTRADOR corrige a qualquer momento. Os demais (almoxarifado e quem lançou)
  -- só no MESMO DIA do lançamento (horário de Brasília): é para erro de digitação com a nota na mão.
  -- Depois disso, a diferença se acerta por INVENTÁRIO (contagem), nunca por correção.
  v_mesmo_dia := (o.data_hora at time zone 'America/Sao_Paulo')::date = public._hoje();
  v_proprio := o.usuario_id = auth.uid()
               and o.tipo in ('entrada','saida_receita','saida_avulsa','saida_almox','consumo');
  if o.tipo in ('implantacao','inventario') then
    if not ('admin' = any(public.meus_papeis())) then
      raise exception 'Só o administrador corrige implantação de saldo e inventário.' using errcode = '42501';
    end if;
  elsif not ('admin' = any(public.meus_papeis())) then
    if not (public.pode('corrigir') or v_proprio) then
      raise exception 'Sem permissão: você só pode corrigir os seus próprios lançamentos do dia.' using errcode = '42501';
    end if;
    if not v_mesmo_dia then
      raise exception 'Prazo para correção encerrado. Este lançamento é de % e só podia ser corrigido no mesmo dia. Para acertar o estoque agora, faça um acerto de inventário (Estoque › Inventário). Dúvidas? Fale com o administrador do sistema.',
        to_char(o.data_hora at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') using errcode = '42501';
    end if;
  end if;

  if p_quantidade_correta is null or p_quantidade_correta < 0 then
    raise exception 'Informe a quantidade correta (zero se o lançamento não deveria existir).';
  end if;
  select * into v_prod from public.produtos where id = o.produto_id;
  select o.quantidade + coalesce(sum(c.quantidade), 0) into v_efetiva
    from public.movimentos c where c.corrige_id = o.id;
  v_nova := sign(o.quantidade) * p_quantidade_correta * public._fator(o.produto_id, p_unidade);
  v_delta := round(v_nova - v_efetiva, 4);
  if v_delta = 0 then raise exception 'A quantidade informada é igual à atual; nada a corrigir.'; end if;

  v_custo := case when o.quantidade > 0 then o.custo_unitario end;
  v_novo := public._movimentar(o.produto_id, 'correcao', v_delta, v_custo,
    jsonb_build_object('corrige_id', o.id, 'motivo', btrim(p_motivo), 'local_id', o.local_id,
      'observacao', format('Corrige lançamento #%s: de %s para %s %s', o.id,
                           public._fmt(abs(v_efetiva)), public._fmt(abs(v_nova)), public._un(v_prod.unidade_estoque, abs(v_nova)))));

  if o.pedido_item_id is not null then
    update public.pedido_itens set qtd_recebida_base = greatest(qtd_recebida_base + v_delta, 0)
     where id = o.pedido_item_id;
    perform public._atualizar_status_pedido((select pedido_id from public.pedido_itens where id = o.pedido_item_id));
  end if;
  return v_novo;
end $$;
revoke execute on function public.corrigir_movimento(bigint, numeric, text, text) from public, anon;
grant execute on function public.corrigir_movimento(bigint, numeric, text, text) to authenticated;

insert into public.versao_banco (versao, descricao)
values ('2.18.0', 'Prazo para corrigir lançamentos: só no mesmo dia (administrador a qualquer momento)')
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Correção com prazo do mesmo dia' as verificacao,
       case when position('Prazo para correção encerrado' in pg_get_functiondef('public.corrigir_movimento(bigint, numeric, text, text)'::regprocedure)) > 0
            then 'OK' else 'ATENÇÃO' end as resultado
union all
select 'Correção só para quem tem login',
       case when not has_function_privilege('anon', 'public.corrigir_movimento(bigint, numeric, text, text)', 'execute') then 'OK' else 'ATENÇÃO' end
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.18.0') then 'OK (2.18.0)' else 'ATENÇÃO' end;


-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.19 · PRAZO DE 1 HORA PARA CORRIGIR CONSUMO
-- (aplicar DEPOIS da v2.18; pode rodar de novo sem problema; não apaga dados)
--
--  · Consumo (no setor e pela receita da pesagem): correção só até 1 HORA depois do lançamento.
--  · Entradas, saídas avulsas e do almoxarifado: só no MESMO DIA (como na v2.18).
--  · Administrador: a qualquer momento.
--  · Transferência: nunca se corrige. Antes de recebida, cancela-se na tela Transferências (volta para a
--    origem); depois de recebida e conferida, não muda mais (mensagem explica isso).
-- =====================================================================

create or replace function public.corrigir_movimento(p_id bigint, p_quantidade_correta numeric,
                                                     p_unidade text, p_motivo text)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.movimentos; v_prod public.produtos; v_efetiva numeric; v_nova numeric; v_delta numeric;
        v_custo numeric; v_novo bigint; v_proprio boolean; v_mesmo_dia boolean;
begin
  if not public.usuario_ativo() then raise exception 'Usuário inativo.' using errcode = '42501'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Informe o motivo da correção.'; end if;
  select * into o from public.movimentos where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if o.tipo = 'correcao' then raise exception 'Corrija o lançamento original, não a correção.'; end if;
  if o.tipo in ('transferencia','entrada_producao') or o.batelada_id is not null then
    if o.tipo = 'transferencia' then
      raise exception 'Transferência não se corrige. Se o destino ainda não recebeu, cancele na tela Transferências (a mercadoria volta para a origem). Depois de recebida e conferida pelo destino, ela não pode mais ser alterada: diferenças se acertam por inventário.';
    end if;
    raise exception 'Este lançamento é automático da produção: corrija pela própria tela de origem.';
  end if;

  -- REGRA DE PRAZO (v2.18/v2.19): só o ADMINISTRADOR corrige a qualquer momento. Os demais (almoxarifado e quem lançou):
  -- CONSUMO até 1 hora depois do lançamento; os outros só no MESMO DIA (horário de Brasília).
  -- Depois disso, a diferença se acerta por INVENTÁRIO (contagem), nunca por correção.
  v_mesmo_dia := (o.data_hora at time zone 'America/Sao_Paulo')::date = public._hoje();
  v_proprio := o.usuario_id = auth.uid()
               and o.tipo in ('entrada','saida_receita','saida_avulsa','saida_almox','consumo');
  if o.tipo in ('implantacao','inventario') then
    if not ('admin' = any(public.meus_papeis())) then
      raise exception 'Só o administrador corrige implantação de saldo e inventário.' using errcode = '42501';
    end if;
  elsif not ('admin' = any(public.meus_papeis())) then
    if not (public.pode('corrigir') or v_proprio) then
      raise exception 'Sem permissão: você só pode corrigir os seus próprios lançamentos do dia.' using errcode = '42501';
    end if;
    -- consumo (no setor e pela receita da pesagem): só até 1 HORA depois do lançamento
    if o.tipo in ('consumo','saida_receita') and now() - o.data_hora > interval '1 hour' then
      raise exception 'Prazo para correção encerrado. Consumo só pode ser corrigido em até 1 hora depois do lançamento (este foi em %). Para acertar o estoque agora, faça um acerto de inventário (Estoque › Inventário). Dúvidas? Fale com o administrador do sistema.',
        to_char(o.data_hora at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') using errcode = '42501';
    end if;
    if not v_mesmo_dia then
      raise exception 'Prazo para correção encerrado. Este lançamento é de % e só podia ser corrigido no mesmo dia. Para acertar o estoque agora, faça um acerto de inventário (Estoque › Inventário). Dúvidas? Fale com o administrador do sistema.',
        to_char(o.data_hora at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') using errcode = '42501';
    end if;
  end if;

  if p_quantidade_correta is null or p_quantidade_correta < 0 then
    raise exception 'Informe a quantidade correta (zero se o lançamento não deveria existir).';
  end if;
  select * into v_prod from public.produtos where id = o.produto_id;
  select o.quantidade + coalesce(sum(c.quantidade), 0) into v_efetiva
    from public.movimentos c where c.corrige_id = o.id;
  v_nova := sign(o.quantidade) * p_quantidade_correta * public._fator(o.produto_id, p_unidade);
  v_delta := round(v_nova - v_efetiva, 4);
  if v_delta = 0 then raise exception 'A quantidade informada é igual à atual; nada a corrigir.'; end if;

  v_custo := case when o.quantidade > 0 then o.custo_unitario end;
  v_novo := public._movimentar(o.produto_id, 'correcao', v_delta, v_custo,
    jsonb_build_object('corrige_id', o.id, 'motivo', btrim(p_motivo), 'local_id', o.local_id,
      'observacao', format('Corrige lançamento #%s: de %s para %s %s', o.id,
                           public._fmt(abs(v_efetiva)), public._fmt(abs(v_nova)), public._un(v_prod.unidade_estoque, abs(v_nova)))));

  if o.pedido_item_id is not null then
    update public.pedido_itens set qtd_recebida_base = greatest(qtd_recebida_base + v_delta, 0)
     where id = o.pedido_item_id;
    perform public._atualizar_status_pedido((select pedido_id from public.pedido_itens where id = o.pedido_item_id));
  end if;
  return v_novo;
end $$;

revoke execute on function public.corrigir_movimento(bigint, numeric, text, text) from public, anon;
grant execute on function public.corrigir_movimento(bigint, numeric, text, text) to authenticated;

insert into public.versao_banco (versao, descricao)
values ('2.19.0', 'Prazo de 1 hora para corrigir consumo; mensagem clara para transferência')
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Consumo com prazo de 1 hora' as verificacao,
       case when position('em até 1 hora' in pg_get_functiondef('public.corrigir_movimento(bigint, numeric, text, text)'::regprocedure)) > 0
            then 'OK' else 'ATENÇÃO' end as resultado
union all
select 'Transferência recebida não cancela',
       case when position('não pode ser cancelada' in pg_get_functiondef('public.cancelar_transferencia(bigint, text)'::regprocedure)) > 0
            then 'OK' else 'ATENÇÃO' end
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.19.0') then 'OK (2.19.0)' else 'ATENÇÃO' end;


-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.20 · MÓDULO MANUTENÇÃO DE VEÍCULOS (FROTA)
-- (aplicar DEPOIS da v2.19; pode rodar de novo sem problema; não apaga dados)
--
--  · Papel novo "frota" (Manutenção de veículos). Por enquanto: administrador + quem tiver esse papel.
--  · Cadastro de veículos, tipos de manutenção (etiquetas), correção de placas digitadas erradas.
--  · Uma nota pode ser DIVIDIDA entre veículos (parte de cada um, com as próprias etiquetas).
--  · Despesas de manutenção vindas do contas a pagar (CSV hoje; banco da empresa depois), com
--    importação INCREMENTAL: o apontamento (etiquetas, observação, km) fica na NOTA e nunca se perde.
--  · Sem dados da empresa neste arquivo: placas e despesas entram pelo próprio sistema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PAPEL "frota" e PERMISSÃO
-- ---------------------------------------------------------------------
alter table public.perfis drop constraint if exists perfis_papeis_check;
alter table public.perfis add constraint perfis_papeis_check check (papeis <@ array['admin','comprador','almoxarifado','recebimento',
  'pesagem','engenharia','diretoria','financeiro','faturamento','padeiro','gestor_producao','frota']::text[]);

create or replace function public.pode(p_acao text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.meus_papeis() && (case p_acao
    when 'cadastro_produto'    then array['admin','comprador']
    when 'cadastro_fornecedor' then array['admin','comprador']
    when 'ficha_tecnica'       then array['admin','engenharia']
    when 'pedido'              then array['admin','comprador']
    when 'recebimento'         then array['admin','almoxarifado','recebimento']
    when 'saida_receita'       then array['admin','pesagem','almoxarifado']
    when 'saida_avulsa'        then array['admin','pesagem','almoxarifado','padeiro','engenharia','gestor_producao']
    when 'saida_almox'         then array['admin','almoxarifado','recebimento']
    when 'inventario'          then array['admin','almoxarifado','recebimento']
    when 'corrigir'            then array['admin','almoxarifado']
    when 'implantacao'         then array['admin']
    when 'contagem_inicial'    then array['admin','almoxarifado']
    when 'usuarios'            then array['admin']
    when 'parametros'          then array['admin']
    when 'auditoria'           then array['admin','diretoria']
    when 'importacao'          then array['admin']
    when 'programacao'         then array['admin','engenharia','gestor_producao']
    when 'financeiro'          then array['admin','financeiro']
    when 'data_pagamento'      then array['admin','comprador','financeiro']
    when 'previsao_producao'   then array['admin','engenharia','diretoria','financeiro','faturamento','gestor_producao']
    when 'custos'              then array['admin','diretoria']
    when 'requisicao'          then array['admin','engenharia','gestor_producao']
    when 'producao_config'     then array['admin','engenharia','gestor_producao']
    when 'batelada'            then array['admin','padeiro','engenharia','gestor_producao']
    when 'finalizar_batelada'  then array['admin','engenharia','gestor_producao']
    when 'consumo'             then array['admin','engenharia','almoxarifado','padeiro','pesagem','gestor_producao']
    when 'locais'              then array['admin']
    when 'frota'               then array['admin','frota']
    else array[]::text[] end)::text[], false)
$$;

-- ---------------------------------------------------------------------
-- 2. TABELAS PRÓPRIAS DO MÓDULO
-- ---------------------------------------------------------------------
-- placa só com letras e números, maiúscula (ex.: "bsz-2g54" → "BSZ2G54")
create or replace function public.frota_placa(t text)
returns text language sql immutable set search_path = pg_catalog, pg_temp as $$
  select upper(regexp_replace(coalesce(t, ''), '[^A-Za-z0-9]', '', 'g'))
$$;
revoke execute on function public.frota_placa(text) from public, anon, authenticated;

create table if not exists public.frota_veiculos (
  id               bigint generated always as identity primary key,
  placa            text not null unique check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  marca            text check (length(marca) <= 60),
  modelo           text check (length(modelo) <= 80),
  categoria        text not null default 'Caminhão' check (length(categoria) between 1 and 40),
  ano_fabricacao   int check (ano_fabricacao between 1950 and 2100),
  ano_modelo       int check (ano_modelo between 1950 and 2101),
  situacao         text not null default 'ativo' check (situacao in ('ativo','parado','vendido')),
  uso              text not null default 'empresa' check (uso in ('empresa','particular')),
  responsavel      text check (length(responsavel) <= 80),
  combustivel      text check (length(combustivel) <= 30),
  pneus_qtd        int check (pneus_qtd between 0 and 40),
  pneus_medida     text check (length(pneus_medida) <= 40),
  consumo_km_l     numeric(6,2) check (consumo_km_l > 0 and consumo_km_l < 100),
  hodometro_atual  numeric(10,0) check (hodometro_atual >= 0),
  hodometro_em     date,
  preventiva_km    int check (preventiva_km > 0),
  preventiva_dias  int check (preventiva_dias > 0),
  licenciamento_venc date,
  seguro_venc      date,
  renavam          text check (length(renavam) <= 20),
  chassi           text check (length(chassi) <= 30),
  valor_aquisicao  numeric(14,2) check (valor_aquisicao >= 0),
  observacao       text check (length(observacao) <= 1000),
  criado_em        timestamptz not null default now(),
  criado_por       uuid default auth.uid()
);

-- etiquetas (tipos de manutenção)
create table if not exists public.frota_tags (
  id     bigint generated always as identity primary key,
  nome   text not null check (length(btrim(nome)) between 2 and 40),
  ativo  boolean not null default true,
  ordem  int not null default 100
);
create unique index if not exists frota_tags_nome on public.frota_tags (lower(nome));

-- placa digitada errada no financeiro → veículo certo (vale para sempre)
create table if not exists public.frota_placa_apelidos (
  placa       text primary key check (placa ~ '^[A-Z0-9]{3,10}$'),
  veiculo_id  bigint not null references public.frota_veiculos(id),
  criado_em   timestamptz not null default now(),
  criado_por  uuid default auth.uid()
);

-- cada importação (CSV hoje; consulta ao banco da empresa depois)
create table if not exists public.frota_importacoes (
  id            bigint generated always as identity primary key,
  criado_em     timestamptz not null default now(),
  criado_por    uuid default auth.uid(),
  origem        text not null default 'csv' check (origem in ('csv','banco')),
  arquivo       text check (length(arquivo) <= 200),
  desde         date not null,
  linhas        int not null default 0,
  novas         int not null default 0,
  alteradas     int not null default 0,
  removidas     int not null default 0
);

-- SERVIÇO = uma nota de um fornecedor para um veículo. É AQUI que ficam as etiquetas e observações,
-- separadas das linhas do financeiro: nova importação, pagamento ou parcela nunca apagam o apontamento.
create table if not exists public.frota_servicos (
  id                 bigint generated always as identity primary key,
  fornecedor_codigo  text not null check (length(fornecedor_codigo) <= 30),
  titulo             text not null check (length(titulo) <= 40),
  placa_arquivo      text not null default '' check (length(placa_arquivo) <= 12),
  veiculo_id         bigint references public.frota_veiculos(id),        -- achado pela placa (automático)
  veiculo_manual_id  bigint references public.frota_veiculos(id),        -- escolhido à mão (vale mais)
  tags               bigint[] not null default '{}',
  observacao         text check (length(observacao) <= 1000),
  hodometro          numeric(10,0) check (hodometro >= 0),
  apontado_por       uuid,
  apontado_em        timestamptz,
  ativo              boolean not null default true,                         -- falso = nota sumiu do financeiro
  criado_em          timestamptz not null default now(),
  unique (fornecedor_codigo, titulo, placa_arquivo)
);

-- LINHAS do contas a pagar (uma por parcela e conta). Substituídas a cada importação do ano.
create table if not exists public.frota_lancamentos (
  id                bigint generated always as identity primary key,
  chave             text not null unique,
  servico_id        bigint not null references public.frota_servicos(id),
  fornecedor_codigo text, fornecedor_nome text, cnpj text,
  titulo            text, parcela text,
  emissao           date, entrada date not null, vencimento date, pagamento date,
  valor_titulo      numeric(14,2), juros numeric(14,2), desconto numeric(14,2), valor_pago numeric(14,2),
  centro_custo      text, conta text not null, valor numeric(14,2) not null,
  observacao        text, status text, placa_original text, tipo_documento text,
  assinatura        text not null,
  importacao_id     bigint references public.frota_importacoes(id),
  removido_em       timestamptz,
  atualizado_em     timestamptz not null default now()
);
create index if not exists frota_lanc_servico on public.frota_lancamentos (servico_id);

-- DIVISÃO de uma nota entre veículos (ex.: o mecânico fez 2 caminhões e mandou uma nota só).
-- A parte de cada veículo extra fica aqui; o que sobra da nota continua no veículo da placa original.
-- Ligada ao SERVIÇO: nova importação não apaga.
create table if not exists public.frota_rateios (
  id          bigint generated always as identity primary key,
  servico_id  bigint not null references public.frota_servicos(id),
  veiculo_id  bigint not null references public.frota_veiculos(id),
  valor       numeric(14,2) not null check (valor > 0),
  tags        bigint[] not null check (cardinality(tags) > 0),
  observacao  text check (length(observacao) <= 1000),
  criado_em   timestamptz not null default now(),
  criado_por  uuid default auth.uid()
);
create index if not exists frota_rateios_servico on public.frota_rateios (servico_id);
create index if not exists frota_lanc_entrada on public.frota_lancamentos (entrada);

-- segurança: só quem tem acesso à frota lê; ninguém grava direto (só pelas funções abaixo)
do $$
declare t text;
begin
  foreach t in array array['frota_veiculos','frota_tags','frota_placa_apelidos','frota_importacoes','frota_servicos','frota_lancamentos','frota_rateios'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists le_frota on public.%I', t);
    execute format('create policy le_frota on public.%I for select to authenticated using (public.pode(''frota''))', t);
  end loop;
end $$;

-- auditoria (o que as pessoas alteram); as linhas do financeiro têm o registro de cada importação
drop trigger if exists aud on public.frota_veiculos;
create trigger aud after insert or update or delete on public.frota_veiculos for each row execute function public.auditar();
drop trigger if exists aud on public.frota_tags;
create trigger aud after insert or update or delete on public.frota_tags for each row execute function public.auditar();
drop trigger if exists aud on public.frota_placa_apelidos;
create trigger aud after insert or update or delete on public.frota_placa_apelidos for each row execute function public.auditar();
drop trigger if exists aud on public.frota_rateios;
create trigger aud after insert or update or delete on public.frota_rateios for each row execute function public.auditar();
drop trigger if exists aud on public.frota_servicos;
create trigger aud after insert or update or delete on public.frota_servicos for each row execute function public.auditar();
-- nada se apaga: veículo e serviço só mudam de situação
drop trigger if exists sem_exclusao on public.frota_veiculos;
create trigger sem_exclusao before delete on public.frota_veiculos for each row execute function public.bloquear_exclusao();
drop trigger if exists sem_exclusao on public.frota_servicos;
create trigger sem_exclusao before delete on public.frota_servicos for each row execute function public.bloquear_exclusao();

-- etiquetas iniciais
insert into public.frota_tags (nome, ordem)
select x.nome, x.ordem from (values ('Motor', 1), ('Elétrica', 2), ('Freios', 3), ('Suspensão', 4), ('Câmbio e embreagem', 5),
  ('Pneus', 6), ('Arrefecimento (radiador)', 7), ('Injeção e combustível', 8), ('Óleo e filtros (revisão)', 9), ('Direção', 10),
  ('Carroceria e baú', 11), ('Funilaria e pintura', 12), ('Ar-condicionado', 13), ('Escapamento', 14), ('Outros', 99)) as x(nome, ordem)
where not exists (select 1 from public.frota_tags t where lower(t.nome) = lower(x.nome));

-- ---------------------------------------------------------------------
-- 3. QUAL VEÍCULO É DE CADA NOTA: escolhido à mão > placa do cadastro > placa corrigida (apelido)
--    placa vazia ou 9999999 = despesa geral da frota
-- ---------------------------------------------------------------------
create or replace function public._frota_resolver()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.frota_servicos s
     set veiculo_id = r.vid
    from (select s2.id, coalesce((select v.id from public.frota_veiculos v where v.placa = s2.placa_arquivo),
                                (select a.veiculo_id from public.frota_placa_apelidos a where a.placa = s2.placa_arquivo)) as vid
            from public.frota_servicos s2) r
   where r.id = s.id and s.veiculo_id is distinct from r.vid;
end $$;
revoke execute on function public._frota_resolver() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. CADASTROS (veículo, etiqueta, correção de placa)
-- ---------------------------------------------------------------------
create or replace function public.frota_salvar_veiculo(p jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint := nullif(p->>'id', '')::bigint; v_placa text := public.frota_placa(p->>'placa');
        n numeric;
begin
  perform public._exigir('frota');
  if v_placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
    raise exception 'Placa inválida: "%". Use 3 letras e 4 caracteres (ex.: ABC1234 ou ABC1D23).', coalesce(p->>'placa', '');
  end if;
  if exists (select 1 from public.frota_veiculos where placa = v_placa and id is distinct from v_id) then
    raise exception 'Já existe um veículo com a placa %.', v_placa;
  end if;
  if exists (select 1 from public.frota_placa_apelidos where placa = v_placa) then
    delete from public.frota_placa_apelidos where placa = v_placa;   -- a placa passou a existir de verdade
  end if;
  if v_id is null then
    insert into public.frota_veiculos (placa, categoria) values (v_placa, coalesce(public._texto(p, 'categoria'), 'Caminhão')) returning id into v_id;
  elsif not exists (select 1 from public.frota_veiculos where id = v_id) then
    raise exception 'Veículo não encontrado.';
  end if;
  update public.frota_veiculos set
    placa = v_placa,
    marca = public.nome_titulo(public._texto(p, 'marca')),
    modelo = public.nome_maiusculo(public._texto(p, 'modelo')),
    categoria = coalesce(public._texto(p, 'categoria'), categoria),
    ano_fabricacao = nullif(p->>'ano_fabricacao', '')::int, ano_modelo = nullif(p->>'ano_modelo', '')::int,
    situacao = coalesce(nullif(p->>'situacao', ''), situacao), uso = coalesce(nullif(p->>'uso', ''), uso),
    responsavel = public.nome_titulo(public._texto(p, 'responsavel')), combustivel = public.nome_padrao(public._texto(p, 'combustivel')),
    pneus_qtd = nullif(p->>'pneus_qtd', '')::int, pneus_medida = public.nome_maiusculo(public._texto(p, 'pneus_medida')),
    consumo_km_l = nullif(p->>'consumo_km_l', '')::numeric,
    hodometro_atual = nullif(p->>'hodometro_atual', '')::numeric, hodometro_em = nullif(p->>'hodometro_em', '')::date,
    preventiva_km = nullif(p->>'preventiva_km', '')::int, preventiva_dias = nullif(p->>'preventiva_dias', '')::int,
    licenciamento_venc = nullif(p->>'licenciamento_venc', '')::date, seguro_venc = nullif(p->>'seguro_venc', '')::date,
    renavam = public.frota_placa(public._texto(p, 'renavam')), chassi = public.frota_placa(public._texto(p, 'chassi')),
    valor_aquisicao = nullif(p->>'valor_aquisicao', '')::numeric, observacao = public._texto(p, 'observacao')
  where id = v_id;
  perform public._frota_resolver();
  return v_id;
end $$;

create or replace function public.frota_salvar_tag(p jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint := nullif(p->>'id', '')::bigint; v_nome text := btrim(coalesce(p->>'nome', ''));
begin
  perform public._exigir('frota');
  if length(v_nome) < 2 or length(v_nome) > 40 then raise exception 'Nome do tipo de manutenção: de 2 a 40 letras.'; end if;
  v_nome := upper(left(v_nome, 1)) || substr(v_nome, 2);
  if exists (select 1 from public.frota_tags where lower(nome) = lower(v_nome) and id is distinct from v_id) then
    raise exception 'Já existe o tipo "%".', v_nome;
  end if;
  if v_id is null then
    insert into public.frota_tags (nome, ordem) values (v_nome, coalesce(nullif(p->>'ordem', '')::int, 50)) returning id into v_id;
  else
    update public.frota_tags set nome = v_nome, ativo = coalesce((p->>'ativo')::boolean, ativo), ordem = coalesce(nullif(p->>'ordem', '')::int, ordem)
     where id = v_id;
    if not found then raise exception 'Tipo não encontrado.'; end if;
  end if;
  return v_id;
end $$;

-- "BSZ2654 é a BSZ2G54": vale para esta e para as próximas notas com a placa errada
create or replace function public.frota_corrigir_placa(p_placa text, p_veiculo_id bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_placa text := public.frota_placa(p_placa);
begin
  perform public._exigir('frota');
  if v_placa in ('', '9999999') or length(v_placa) > 10 then raise exception 'Placa inválida.'; end if;
  if exists (select 1 from public.frota_veiculos where placa = v_placa) then
    raise exception 'A placa % já está cadastrada: não precisa corrigir.', v_placa;
  end if;
  if not exists (select 1 from public.frota_veiculos where id = p_veiculo_id) then raise exception 'Escolha o veículo certo.'; end if;
  insert into public.frota_placa_apelidos (placa, veiculo_id) values (v_placa, p_veiculo_id)
  on conflict (placa) do update set veiculo_id = excluded.veiculo_id, criado_em = now(), criado_por = auth.uid();
  perform public._frota_resolver();
end $$;

-- ---------------------------------------------------------------------
-- 5. APONTAR: etiquetas (pelo menos 1), observação, km e, se precisar, o veículo certo da nota
-- ---------------------------------------------------------------------
create or replace function public.frota_apontar(p jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint := (p->>'servico_id')::bigint; v_tags bigint[]; v_veic bigint := nullif(p->>'veiculo_id', '')::bigint;
        v_total numeric; v_soma numeric := 0; pt jsonb; v_ptags bigint[]; v_pveic bigint; v_pval numeric;
begin
  perform public._exigir('frota');
  if not exists (select 1 from public.frota_servicos where id = v_id) then raise exception 'Nota não encontrada.'; end if;
  select coalesce(array_agg(distinct x::bigint), '{}') into v_tags from jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)) x;
  if cardinality(v_tags) = 0 then raise exception 'Marque pelo menos um tipo de manutenção.'; end if;
  if exists (select 1 from unnest(v_tags) t where not exists (select 1 from public.frota_tags g where g.id = t and g.ativo)) then
    raise exception 'Tipo de manutenção inválido ou desativado.';
  end if;
  if v_veic is not null and not exists (select 1 from public.frota_veiculos where id = v_veic) then raise exception 'Veículo não encontrado.'; end if;
  -- DIVISÃO entre veículos (p.partes): substitui as partes anteriores desta nota
  if p ? 'partes' then
    if jsonb_typeof(p->'partes') <> 'array' or jsonb_array_length(p->'partes') > 20 then raise exception 'Divisão inválida (máximo 20 veículos).'; end if;
    select coalesce(sum(valor), 0) into v_total from public.frota_lancamentos where servico_id = v_id and removido_em is null;
    delete from public.frota_rateios where servico_id = v_id;
    for pt in select * from jsonb_array_elements(p->'partes') loop
      v_pveic := nullif(pt->>'veiculo_id', '')::bigint; v_pval := round(nullif(pt->>'valor', '')::numeric, 2);
      if v_pveic is null or not exists (select 1 from public.frota_veiculos where id = v_pveic) then raise exception 'Escolha o veículo de cada parte da divisão.'; end if;
      if v_pval is null or v_pval <= 0 then raise exception 'Informe o valor de cada parte da divisão.'; end if;
      select coalesce(array_agg(distinct x::bigint), '{}') into v_ptags from jsonb_array_elements_text(coalesce(pt->'tags', '[]'::jsonb)) x;
      if cardinality(v_ptags) = 0 then raise exception 'Marque o tipo de manutenção de cada veículo da divisão.'; end if;
      if exists (select 1 from unnest(v_ptags) t where not exists (select 1 from public.frota_tags g where g.id = t and g.ativo)) then
        raise exception 'Tipo de manutenção inválido ou desativado.';
      end if;
      v_soma := v_soma + v_pval;
      insert into public.frota_rateios (servico_id, veiculo_id, valor, tags, observacao) values (v_id, v_pveic, v_pval, v_ptags, public._texto(pt, 'observacao'));
    end loop;
    if v_soma > v_total then raise exception 'A divisão (R$ %) passa do valor da nota (R$ %).', translate(to_char(v_soma, 'FM999G999G990D00'), ',.', '.,'), translate(to_char(v_total, 'FM999G999G990D00'), ',.', '.,'); end if;
  end if;
  update public.frota_servicos set tags = v_tags, observacao = public._texto(p, 'observacao'),
         hodometro = nullif(p->>'hodometro', '')::numeric,
         veiculo_manual_id = case when p ? 'veiculo_id' then v_veic else veiculo_manual_id end,
         apontado_por = auth.uid(), apontado_em = now()
   where id = v_id;
  -- km informado mais recente atualiza o hodômetro do veículo
  if nullif(p->>'hodometro', '') is not null then
    update public.frota_veiculos v set hodometro_atual = (p->>'hodometro')::numeric, hodometro_em = current_date
      from public.frota_servicos s
     where s.id = v_id and v.id = coalesce(s.veiculo_manual_id, s.veiculo_id)
       and (v.hodometro_atual is null or v.hodometro_atual <= (p->>'hodometro')::numeric);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. IMPORTAÇÃO INCREMENTAL (CSV hoje; consulta ao banco da empresa depois: mesma porta de entrada)
--    p = { arquivo, origem, simular, linhas: [{fornecedor_codigo, fornecedor_nome, cnpj, titulo, parcela, emissao,
--          entrada, vencimento, pagamento, valor_titulo, juros, desconto, valor_pago, centro_custo, conta, valor,
--          observacao, status, placa, tipo_documento}] }
--    O arquivo traz o ANO inteiro: o que está nele é a verdade do financeiro a partir de 1º de janeiro desse ano.
--      · linha nova → entra · linha diferente → atualiza · linha que sumiu → sai dos totais (removido_em)
--    Etiquetas/observações ficam no SERVIÇO (nota × veículo) e nunca são apagadas.
-- ---------------------------------------------------------------------
create or replace function public.frota_importar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_desde date; v_novas int; v_alt int; v_rem int; v_imp bigint; v_n int; v_placas jsonb; v_serv_novos int;
begin
  perform public._exigir('importacao');   -- importar despesas: só o ADMINISTRADOR
  if jsonb_typeof(p->'linhas') <> 'array' then raise exception 'Arquivo sem linhas.'; end if;
  if jsonb_array_length(p->'linhas') > 50000 then raise exception 'Arquivo grande demais (máximo 50.000 linhas de manutenção).'; end if;

  create temp table if not exists _frota_imp (
    seq int, fornecedor_codigo text, fornecedor_nome text, cnpj text, titulo text, parcela text,
    emissao date, entrada date, vencimento date, pagamento date, valor_titulo numeric, juros numeric, desconto numeric, valor_pago numeric,
    centro_custo text, conta text, valor numeric, observacao text, status text, placa_original text, placa text, tipo_documento text,
    chave text, assinatura text) on commit drop;
  truncate _frota_imp;
  insert into _frota_imp (seq, fornecedor_codigo, fornecedor_nome, cnpj, titulo, parcela, emissao, entrada, vencimento, pagamento,
                          valor_titulo, juros, desconto, valor_pago, centro_custo, conta, valor, observacao, status, placa_original, placa, tipo_documento)
  select x.ord, left(btrim(x.l->>'fornecedor_codigo'), 30), left(btrim(x.l->>'fornecedor_nome'), 120), left(btrim(x.l->>'cnpj'), 20),
         left(btrim(x.l->>'titulo'), 40), left(btrim(coalesce(x.l->>'parcela', '')), 10),
         nullif(x.l->>'emissao', '')::date, nullif(x.l->>'entrada', '')::date, nullif(x.l->>'vencimento', '')::date, nullif(x.l->>'pagamento', '')::date,
         nullif(x.l->>'valor_titulo', '')::numeric, nullif(x.l->>'juros', '')::numeric, nullif(x.l->>'desconto', '')::numeric, nullif(x.l->>'valor_pago', '')::numeric,
         left(btrim(x.l->>'centro_custo'), 80), left(btrim(x.l->>'conta'), 80), round(nullif(x.l->>'valor', '')::numeric, 2),
         left(btrim(x.l->>'observacao'), 500), left(btrim(x.l->>'status'), 5), left(btrim(coalesce(x.l->>'placa', '')), 20),
         left(public.frota_placa(x.l->>'placa'), 12), left(btrim(x.l->>'tipo_documento'), 40)
    from jsonb_array_elements(p->'linhas') with ordinality as x(l, ord);
  delete from _frota_imp where entrada is null or coalesce(fornecedor_codigo, '') = '' or coalesce(titulo, '') = '' or valor is null or coalesce(conta, '') = '';
  select count(*) into v_n from _frota_imp;
  if v_n = 0 then raise exception 'Nenhuma linha de manutenção de veículos no arquivo (contas: manutenção corretiva, preventiva e pneus).'; end if;
  if (select min(entrada) from _frota_imp) < date '2020-01-01' then raise exception 'Data de entrada muito antiga no arquivo: confira o arquivo.'; end if;

  -- chave de cada linha: fornecedor + título + parcela + conta + placa (+ nº de ordem se repetir no arquivo)
  update _frota_imp i set chave = k.chave
    from (select seq, concat_ws('|', fornecedor_codigo, titulo, parcela, conta, placa,
                 row_number() over (partition by fornecedor_codigo, titulo, parcela, conta, placa order by seq)) as chave from _frota_imp) k
   where k.seq = i.seq;
  update _frota_imp set assinatura = md5(concat_ws('|', fornecedor_nome, cnpj, emissao, entrada, vencimento, pagamento, valor_titulo, juros, desconto,
                                                   valor_pago, centro_custo, valor, observacao, status, placa_original, tipo_documento))
   where true;   -- o Supabase recusa UPDATE sem WHERE (proteção contra alterar a tabela inteira sem querer)
  v_desde := date_trunc('year', (select min(entrada) from _frota_imp))::date;

  select count(*) into v_novas from _frota_imp i where not exists (select 1 from public.frota_lancamentos l where l.chave = i.chave);
  select count(*) into v_alt from _frota_imp i join public.frota_lancamentos l on l.chave = i.chave
   where l.assinatura <> i.assinatura or l.removido_em is not null;
  select count(*) into v_rem from public.frota_lancamentos l
   where l.entrada >= v_desde and l.removido_em is null and not exists (select 1 from _frota_imp i where i.chave = l.chave);
  select count(distinct (fornecedor_codigo, titulo, placa)) into v_serv_novos from _frota_imp i
   where not exists (select 1 from public.frota_servicos s where s.fornecedor_codigo = i.fornecedor_codigo and s.titulo = i.titulo and s.placa_arquivo = i.placa);
  -- placas que ninguém reconhece (nem cadastro nem correção)
  select coalesce(jsonb_agg(jsonb_build_object('placa', placa, 'linhas', n, 'valor', v) order by v desc), '[]') into v_placas
    from (select placa, count(*) n, sum(valor) v from _frota_imp i
           where placa not in ('', '9999999')
             and not exists (select 1 from public.frota_veiculos f where f.placa = i.placa)
             and not exists (select 1 from public.frota_placa_apelidos a where a.placa = i.placa)
           group by placa) z;

  if coalesce((p->>'simular')::boolean, false) then
    return jsonb_build_object('simulado', true, 'desde', v_desde, 'linhas', v_n, 'novas', v_novas, 'alteradas', v_alt, 'removidas', v_rem,
      'notas_novas', v_serv_novos, 'placas_desconhecidas', v_placas, 'valor_total', (select sum(valor) from _frota_imp),
      'ate', (select max(entrada) from _frota_imp));
  end if;

  insert into public.frota_importacoes (origem, arquivo, desde, linhas, novas, alteradas, removidas)
  values (coalesce(nullif(p->>'origem', ''), 'csv'), left(p->>'arquivo', 200), v_desde, v_n, v_novas, v_alt, v_rem) returning id into v_imp;

  insert into public.frota_servicos (fornecedor_codigo, titulo, placa_arquivo)
  select distinct fornecedor_codigo, titulo, placa from _frota_imp
  on conflict (fornecedor_codigo, titulo, placa_arquivo) do nothing;

  insert into public.frota_lancamentos as l (chave, servico_id, fornecedor_codigo, fornecedor_nome, cnpj, titulo, parcela, emissao, entrada, vencimento,
         pagamento, valor_titulo, juros, desconto, valor_pago, centro_custo, conta, valor, observacao, status, placa_original, tipo_documento,
         assinatura, importacao_id, removido_em, atualizado_em)
  select i.chave, s.id, i.fornecedor_codigo, i.fornecedor_nome, i.cnpj, i.titulo, i.parcela, i.emissao, i.entrada, i.vencimento,
         i.pagamento, i.valor_titulo, i.juros, i.desconto, i.valor_pago, i.centro_custo, i.conta, i.valor, i.observacao, i.status, i.placa_original,
         i.tipo_documento, i.assinatura, v_imp, null, now()
    from _frota_imp i join public.frota_servicos s on s.fornecedor_codigo = i.fornecedor_codigo and s.titulo = i.titulo and s.placa_arquivo = i.placa
  on conflict (chave) do update set servico_id = excluded.servico_id, fornecedor_nome = excluded.fornecedor_nome, cnpj = excluded.cnpj,
         emissao = excluded.emissao, entrada = excluded.entrada, vencimento = excluded.vencimento, pagamento = excluded.pagamento,
         valor_titulo = excluded.valor_titulo, juros = excluded.juros, desconto = excluded.desconto, valor_pago = excluded.valor_pago,
         centro_custo = excluded.centro_custo, valor = excluded.valor, observacao = excluded.observacao, status = excluded.status,
         placa_original = excluded.placa_original, tipo_documento = excluded.tipo_documento, assinatura = excluded.assinatura,
         importacao_id = excluded.importacao_id, removido_em = null, atualizado_em = now()
   where l.assinatura is distinct from excluded.assinatura or l.removido_em is not null;

  update public.frota_lancamentos l set removido_em = now(), importacao_id = v_imp
   where l.entrada >= v_desde and l.removido_em is null and not exists (select 1 from _frota_imp i where i.chave = l.chave);

  update public.frota_servicos s set ativo = exists (select 1 from public.frota_lancamentos l where l.servico_id = s.id and l.removido_em is null)
   where s.ativo is distinct from exists (select 1 from public.frota_lancamentos l where l.servico_id = s.id and l.removido_em is null);

  -- o financeiro corrigiu a placa da nota: o apontamento antigo (etiquetas) passa para a nota com a placa nova
  update public.frota_servicos novo set tags = velho.tags, observacao = velho.observacao, hodometro = velho.hodometro,
         veiculo_manual_id = coalesce(novo.veiculo_manual_id, velho.veiculo_manual_id), apontado_por = velho.apontado_por, apontado_em = velho.apontado_em
    from public.frota_servicos velho
   where novo.ativo and cardinality(novo.tags) = 0 and not velho.ativo and cardinality(velho.tags) > 0
     and velho.fornecedor_codigo = novo.fornecedor_codigo and velho.titulo = novo.titulo and velho.id <> novo.id;
  update public.frota_rateios r set servico_id = novo.id
    from public.frota_servicos velho, public.frota_servicos novo
   where r.servico_id = velho.id and not velho.ativo and novo.ativo and novo.id <> velho.id
     and velho.fornecedor_codigo = novo.fornecedor_codigo and velho.titulo = novo.titulo
     and not exists (select 1 from public.frota_rateios r2 where r2.servico_id = novo.id);

  perform public._frota_resolver();
  return jsonb_build_object('importacao_id', v_imp, 'desde', v_desde, 'linhas', v_n, 'novas', v_novas, 'alteradas', v_alt, 'removidas', v_rem,
    'notas_novas', v_serv_novos, 'placas_desconhecidas', v_placas);
end $$;


-- apontar VÁRIAS notas de uma vez (mesmas etiquetas): para pôr em dia o que já existia
create or replace function public.frota_apontar_varios(p jsonb)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ids bigint[]; v_tags bigint[]; v_n int;
begin
  perform public._exigir('frota');
  select coalesce(array_agg(distinct x::bigint), '{}') into v_ids from jsonb_array_elements_text(coalesce(p->'ids', '[]'::jsonb)) x;
  select coalesce(array_agg(distinct x::bigint), '{}') into v_tags from jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)) x;
  if cardinality(v_ids) = 0 then raise exception 'Escolha as notas.'; end if;
  if cardinality(v_ids) > 500 then raise exception 'No máximo 500 notas de uma vez.'; end if;
  if cardinality(v_tags) = 0 then raise exception 'Marque pelo menos um tipo de manutenção.'; end if;
  if exists (select 1 from unnest(v_tags) t where not exists (select 1 from public.frota_tags g where g.id = t and g.ativo)) then
    raise exception 'Tipo de manutenção inválido ou desativado.';
  end if;
  update public.frota_servicos set tags = v_tags, observacao = coalesce(public._texto(p, 'observacao'), observacao),
         apontado_por = auth.uid(), apontado_em = now()
   where id = any(v_ids);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- sininho: quantas notas esperam apontamento e quantas placas esperam cadastro/correção (só para quem tem a frota)
create or replace function public.frota_pendencias()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.pode('frota') then return null; end if;
  return jsonb_build_object(
    'apontar', (select count(*) from public.frota_servicos where ativo and cardinality(tags) = 0),
    'placas', (select count(distinct placa_arquivo) from public.frota_servicos
                where ativo and placa_arquivo not in ('', '9999999') and veiculo_id is null and veiculo_manual_id is null),
    'ultima_importacao', (select max(criado_em) from public.frota_importacoes));
end $$;

do $$
declare f text;
begin
  foreach f in array array['frota_salvar_veiculo(jsonb)', 'frota_salvar_tag(jsonb)', 'frota_corrigir_placa(text, bigint)',
                           'frota_apontar(jsonb)', 'frota_apontar_varios(jsonb)', 'frota_importar(jsonb)', 'frota_pendencias()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;


insert into public.versao_banco (versao, descricao)
values ('2.20.0', 'Módulo Manutenção de veículos: cadastro, importação incremental, apontamento por etiquetas')
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Tabelas da frota protegidas (RLS)' as verificacao,
       case when count(*) = 7 then 'OK (7)' else 'ATENÇÃO: ' || count(*) end as resultado
  from pg_class where relname in ('frota_veiculos','frota_tags','frota_placa_apelidos','frota_importacoes','frota_servicos','frota_lancamentos','frota_rateios')
   and relrowsecurity and relforcerowsecurity
union all
select 'Ninguém grava direto nas tabelas da frota',
       case when count(*) = 0 then 'OK' else 'ATENÇÃO: ' || string_agg(relname, ', ') end
  from pg_class where relname like 'frota\_%' and relkind = 'r'
   and (has_table_privilege('authenticated', oid, 'insert') or has_table_privilege('authenticated', oid, 'update') or has_table_privilege('authenticated', oid, 'delete'))
union all
select 'Papel "frota" aceito nos usuários',
       case when pg_get_constraintdef((select oid from pg_constraint where conname = 'perfis_papeis_check')) like '%frota%' then 'OK' else 'ATENÇÃO' end
union all
select 'Etiquetas iniciais', case when (select count(*) from public.frota_tags) >= 15 then 'OK' else 'ATENÇÃO' end
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Tabelas SEM proteção por linha (RLS)',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.20.0') then 'OK (2.20.0)' else 'ATENÇÃO' end;


-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.21 · CORREÇÃO DA IMPORTAÇÃO DA FROTA
-- (aplicar DEPOIS da v2.20; pode rodar de novo sem problema; não apaga dados)
--
--  O Supabase recusa "UPDATE sem WHERE" (proteção). A importação tinha um desses numa tabela temporária
--  e parava com "UPDATE requires a WHERE clause". Esta versão só troca a função de importação.
--  Importar despesas passa a ser só do ADMINISTRADOR (o responsável da frota aponta, mas não importa).
-- =====================================================================

create or replace function public.frota_importar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_desde date; v_novas int; v_alt int; v_rem int; v_imp bigint; v_n int; v_placas jsonb; v_serv_novos int;
begin
  perform public._exigir('importacao');   -- importar despesas: só o ADMINISTRADOR
  if jsonb_typeof(p->'linhas') <> 'array' then raise exception 'Arquivo sem linhas.'; end if;
  if jsonb_array_length(p->'linhas') > 50000 then raise exception 'Arquivo grande demais (máximo 50.000 linhas de manutenção).'; end if;

  create temp table if not exists _frota_imp (
    seq int, fornecedor_codigo text, fornecedor_nome text, cnpj text, titulo text, parcela text,
    emissao date, entrada date, vencimento date, pagamento date, valor_titulo numeric, juros numeric, desconto numeric, valor_pago numeric,
    centro_custo text, conta text, valor numeric, observacao text, status text, placa_original text, placa text, tipo_documento text,
    chave text, assinatura text) on commit drop;
  truncate _frota_imp;
  insert into _frota_imp (seq, fornecedor_codigo, fornecedor_nome, cnpj, titulo, parcela, emissao, entrada, vencimento, pagamento,
                          valor_titulo, juros, desconto, valor_pago, centro_custo, conta, valor, observacao, status, placa_original, placa, tipo_documento)
  select x.ord, left(btrim(x.l->>'fornecedor_codigo'), 30), left(btrim(x.l->>'fornecedor_nome'), 120), left(btrim(x.l->>'cnpj'), 20),
         left(btrim(x.l->>'titulo'), 40), left(btrim(coalesce(x.l->>'parcela', '')), 10),
         nullif(x.l->>'emissao', '')::date, nullif(x.l->>'entrada', '')::date, nullif(x.l->>'vencimento', '')::date, nullif(x.l->>'pagamento', '')::date,
         nullif(x.l->>'valor_titulo', '')::numeric, nullif(x.l->>'juros', '')::numeric, nullif(x.l->>'desconto', '')::numeric, nullif(x.l->>'valor_pago', '')::numeric,
         left(btrim(x.l->>'centro_custo'), 80), left(btrim(x.l->>'conta'), 80), round(nullif(x.l->>'valor', '')::numeric, 2),
         left(btrim(x.l->>'observacao'), 500), left(btrim(x.l->>'status'), 5), left(btrim(coalesce(x.l->>'placa', '')), 20),
         left(public.frota_placa(x.l->>'placa'), 12), left(btrim(x.l->>'tipo_documento'), 40)
    from jsonb_array_elements(p->'linhas') with ordinality as x(l, ord);
  delete from _frota_imp where entrada is null or coalesce(fornecedor_codigo, '') = '' or coalesce(titulo, '') = '' or valor is null or coalesce(conta, '') = '';
  select count(*) into v_n from _frota_imp;
  if v_n = 0 then raise exception 'Nenhuma linha de manutenção de veículos no arquivo (contas: manutenção corretiva, preventiva e pneus).'; end if;
  if (select min(entrada) from _frota_imp) < date '2020-01-01' then raise exception 'Data de entrada muito antiga no arquivo: confira o arquivo.'; end if;

  -- chave de cada linha: fornecedor + título + parcela + conta + placa (+ nº de ordem se repetir no arquivo)
  update _frota_imp i set chave = k.chave
    from (select seq, concat_ws('|', fornecedor_codigo, titulo, parcela, conta, placa,
                 row_number() over (partition by fornecedor_codigo, titulo, parcela, conta, placa order by seq)) as chave from _frota_imp) k
   where k.seq = i.seq;
  update _frota_imp set assinatura = md5(concat_ws('|', fornecedor_nome, cnpj, emissao, entrada, vencimento, pagamento, valor_titulo, juros, desconto,
                                                   valor_pago, centro_custo, valor, observacao, status, placa_original, tipo_documento))
   where true;   -- o Supabase recusa UPDATE sem WHERE (proteção contra alterar a tabela inteira sem querer)
  v_desde := date_trunc('year', (select min(entrada) from _frota_imp))::date;

  select count(*) into v_novas from _frota_imp i where not exists (select 1 from public.frota_lancamentos l where l.chave = i.chave);
  select count(*) into v_alt from _frota_imp i join public.frota_lancamentos l on l.chave = i.chave
   where l.assinatura <> i.assinatura or l.removido_em is not null;
  select count(*) into v_rem from public.frota_lancamentos l
   where l.entrada >= v_desde and l.removido_em is null and not exists (select 1 from _frota_imp i where i.chave = l.chave);
  select count(distinct (fornecedor_codigo, titulo, placa)) into v_serv_novos from _frota_imp i
   where not exists (select 1 from public.frota_servicos s where s.fornecedor_codigo = i.fornecedor_codigo and s.titulo = i.titulo and s.placa_arquivo = i.placa);
  -- placas que ninguém reconhece (nem cadastro nem correção)
  select coalesce(jsonb_agg(jsonb_build_object('placa', placa, 'linhas', n, 'valor', v) order by v desc), '[]') into v_placas
    from (select placa, count(*) n, sum(valor) v from _frota_imp i
           where placa not in ('', '9999999')
             and not exists (select 1 from public.frota_veiculos f where f.placa = i.placa)
             and not exists (select 1 from public.frota_placa_apelidos a where a.placa = i.placa)
           group by placa) z;

  if coalesce((p->>'simular')::boolean, false) then
    return jsonb_build_object('simulado', true, 'desde', v_desde, 'linhas', v_n, 'novas', v_novas, 'alteradas', v_alt, 'removidas', v_rem,
      'notas_novas', v_serv_novos, 'placas_desconhecidas', v_placas, 'valor_total', (select sum(valor) from _frota_imp),
      'ate', (select max(entrada) from _frota_imp));
  end if;

  insert into public.frota_importacoes (origem, arquivo, desde, linhas, novas, alteradas, removidas)
  values (coalesce(nullif(p->>'origem', ''), 'csv'), left(p->>'arquivo', 200), v_desde, v_n, v_novas, v_alt, v_rem) returning id into v_imp;

  insert into public.frota_servicos (fornecedor_codigo, titulo, placa_arquivo)
  select distinct fornecedor_codigo, titulo, placa from _frota_imp
  on conflict (fornecedor_codigo, titulo, placa_arquivo) do nothing;

  insert into public.frota_lancamentos as l (chave, servico_id, fornecedor_codigo, fornecedor_nome, cnpj, titulo, parcela, emissao, entrada, vencimento,
         pagamento, valor_titulo, juros, desconto, valor_pago, centro_custo, conta, valor, observacao, status, placa_original, tipo_documento,
         assinatura, importacao_id, removido_em, atualizado_em)
  select i.chave, s.id, i.fornecedor_codigo, i.fornecedor_nome, i.cnpj, i.titulo, i.parcela, i.emissao, i.entrada, i.vencimento,
         i.pagamento, i.valor_titulo, i.juros, i.desconto, i.valor_pago, i.centro_custo, i.conta, i.valor, i.observacao, i.status, i.placa_original,
         i.tipo_documento, i.assinatura, v_imp, null, now()
    from _frota_imp i join public.frota_servicos s on s.fornecedor_codigo = i.fornecedor_codigo and s.titulo = i.titulo and s.placa_arquivo = i.placa
  on conflict (chave) do update set servico_id = excluded.servico_id, fornecedor_nome = excluded.fornecedor_nome, cnpj = excluded.cnpj,
         emissao = excluded.emissao, entrada = excluded.entrada, vencimento = excluded.vencimento, pagamento = excluded.pagamento,
         valor_titulo = excluded.valor_titulo, juros = excluded.juros, desconto = excluded.desconto, valor_pago = excluded.valor_pago,
         centro_custo = excluded.centro_custo, valor = excluded.valor, observacao = excluded.observacao, status = excluded.status,
         placa_original = excluded.placa_original, tipo_documento = excluded.tipo_documento, assinatura = excluded.assinatura,
         importacao_id = excluded.importacao_id, removido_em = null, atualizado_em = now()
   where l.assinatura is distinct from excluded.assinatura or l.removido_em is not null;

  update public.frota_lancamentos l set removido_em = now(), importacao_id = v_imp
   where l.entrada >= v_desde and l.removido_em is null and not exists (select 1 from _frota_imp i where i.chave = l.chave);

  update public.frota_servicos s set ativo = exists (select 1 from public.frota_lancamentos l where l.servico_id = s.id and l.removido_em is null)
   where s.ativo is distinct from exists (select 1 from public.frota_lancamentos l where l.servico_id = s.id and l.removido_em is null);

  -- o financeiro corrigiu a placa da nota: o apontamento antigo (etiquetas) passa para a nota com a placa nova
  update public.frota_servicos novo set tags = velho.tags, observacao = velho.observacao, hodometro = velho.hodometro,
         veiculo_manual_id = coalesce(novo.veiculo_manual_id, velho.veiculo_manual_id), apontado_por = velho.apontado_por, apontado_em = velho.apontado_em
    from public.frota_servicos velho
   where novo.ativo and cardinality(novo.tags) = 0 and not velho.ativo and cardinality(velho.tags) > 0
     and velho.fornecedor_codigo = novo.fornecedor_codigo and velho.titulo = novo.titulo and velho.id <> novo.id;
  update public.frota_rateios r set servico_id = novo.id
    from public.frota_servicos velho, public.frota_servicos novo
   where r.servico_id = velho.id and not velho.ativo and novo.ativo and novo.id <> velho.id
     and velho.fornecedor_codigo = novo.fornecedor_codigo and velho.titulo = novo.titulo
     and not exists (select 1 from public.frota_rateios r2 where r2.servico_id = novo.id);

  perform public._frota_resolver();
  return jsonb_build_object('importacao_id', v_imp, 'desde', v_desde, 'linhas', v_n, 'novas', v_novas, 'alteradas', v_alt, 'removidas', v_rem,
    'notas_novas', v_serv_novos, 'placas_desconhecidas', v_placas);
end $$;
revoke execute on function public.frota_importar(jsonb) from public, anon;
grant execute on function public.frota_importar(jsonb) to authenticated;

insert into public.versao_banco (versao, descricao)
values ('2.21.0', 'Correção da importação da frota (UPDATE com WHERE); importar só o administrador')
on conflict (versao) do nothing;

-- CONFERÊNCIA (todas as linhas devem dizer OK)
select 'Importação da frota corrigida' as verificacao,
       case when position('where true' in pg_get_functiondef('public.frota_importar(jsonb)'::regprocedure)) > 0 then 'OK' else 'ATENÇÃO' end as resultado
union all
select 'Importar despesas: só o administrador',
       case when position('_exigir(''importacao'')' in pg_get_functiondef('public.frota_importar(jsonb)'::regprocedure)) > 0 then 'OK' else 'ATENÇÃO' end
union all
select 'Importação só para quem tem login',
       case when not has_function_privilege('anon', 'public.frota_importar(jsonb)', 'execute') then 'OK' else 'ATENÇÃO' end
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.21.0') then 'OK (2.21.0)' else 'ATENÇÃO' end;
