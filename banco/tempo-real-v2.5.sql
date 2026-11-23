-- =====================================================================
-- Compras & Estoque PSS · versão 2.5 · TEMPO REAL para pedidos, recebimentos e cadastros
--
-- O QUE FAZ: pede ao Supabase para avisar as telas abertas quando alguém muda
-- pedidos, recebimentos e cadastros (hoje ele só avisa sobre estoque, transferências,
-- requisições e produção). Não altera nem apaga nenhum dado: só liga o aviso.
--
-- SEM ESTE ARQUIVO o sistema funciona normalmente: as telas conferem sozinhas
-- (pedidos e cadastros a cada 3 minutos, ou na hora em que a pessoa volta para o app).
-- COM ELE, a mudança aparece em cerca de 1 segundo.
--
-- COMO APLICAR (uma vez só): Supabase › SQL Editor › New query › colar tudo › Run.
-- Pode rodar de novo sem problema (ele pula o que já estiver ligado).
-- Quem lê continua sendo controlado pelas regras de acesso (RLS): cada pessoa só
-- recebe aviso do que ela já pode ver.
-- =====================================================================
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

-- conferência: lista as tabelas com aviso em tempo real
select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1;
