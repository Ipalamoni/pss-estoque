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
