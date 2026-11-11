-- Confere Aí — orçamento da compra, histórico de preços por unidade e base compartilhada de preços.
--
-- Dados pessoais (compras, orçamento, histórico) continuam protegidos pelas políticas RLS
-- existentes: cada pessoa lê e grava somente as próprias linhas.
-- A base compartilhada (shared_products / price_reports) só é escrita e lida por funções:
-- quem consulta vê preço, data e unidade do supermercado, nunca quem informou.

-- ---------------------------------------------------------------------------
-- Colunas novas nas tabelas pessoais
-- ---------------------------------------------------------------------------
alter table public.purchases add column budget_cents bigint check (budget_cents is null or budget_cents > 0);
-- Sem chave estrangeira de propósito: o aparelho pode sincronizar depois que a unidade foi removida.
alter table public.purchases add column store_location_id uuid;
alter table public.cart_items add column regular_price_cents bigint check (regular_price_cents is null or regular_price_cents >= 0);
alter table public.price_history add column store_location_id uuid;
alter table public.price_history add column regular_price_cents bigint check (regular_price_cents is null or regular_price_cents >= 0);

alter table public.cart_items drop constraint cart_items_price_source_check;
alter table public.cart_items add constraint cart_items_price_source_check
  check (price_source in ('manual', 'label_ocr', 'photo_ai', 'previous', 'receipt'));
alter table public.price_history drop constraint price_history_source_check;
alter table public.price_history add constraint price_history_source_check
  check (source in ('manual', 'label_ocr', 'photo_ai', 'previous', 'receipt'));
alter table public.products drop constraint products_source_check;
alter table public.products add constraint products_source_check
  check (source in ('user', 'open_food_facts', 'community'));
alter table public.ocr_usage drop constraint ocr_usage_kind_check;
alter table public.ocr_usage add constraint ocr_usage_kind_check check (kind in ('receipt', 'label', 'product'));

alter table public.marketplace_settings add column daily_price_report_limit integer not null default 300 check (daily_price_report_limit >= 1);
alter table public.marketplace_settings add column price_report_max_age_days integer not null default 30 check (price_report_max_age_days between 1 and 365);

-- ---------------------------------------------------------------------------
-- Base compartilhada de produtos e preços
-- ---------------------------------------------------------------------------
create table public.shared_products (
  id uuid primary key default gen_random_uuid(),
  barcode text unique check (barcode is null or barcode ~ '^[0-9]{8,14}$'),
  -- nome + marca + embalagem normalizados: identifica produtos sem código de barras
  name_key text not null,
  name text not null check (char_length(trim(name)) between 2 and 200),
  brand text check (brand is null or char_length(brand) <= 120),
  package_amount integer check (package_amount is null or package_amount > 0),
  package_unit text check (package_unit is null or package_unit in ('g', 'ml', 'un')),
  sale_unit text not null default 'un' check (sale_unit in ('un', 'kg', 'l')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index shared_products_name_key_uq on public.shared_products (name_key, sale_unit) where barcode is null;

create table public.price_reports (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.shared_products (id) on delete cascade,
  location_id uuid not null references public.supermarket_locations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  unit_price_cents integer not null check (unit_price_cents between 1 and 10000000),
  regular_price_cents integer check (regular_price_cents is null or regular_price_cents between 1 and 10000000),
  promo boolean not null default false,
  observed_at timestamptz not null,
  observed_on date not null,
  created_at timestamptz not null default now(),
  -- uma informação por pessoa, produto, unidade e dia (reenviar atualiza, não duplica)
  unique (user_id, product_id, location_id, observed_on)
);
create index price_reports_product_idx on public.price_reports (product_id, location_id, observed_at desc);
create index price_reports_user_created_idx on public.price_reports (user_id, created_at);

alter table public.shared_products enable row level security;
alter table public.price_reports enable row level security;
revoke all on public.shared_products, public.price_reports from anon, authenticated;

create or replace function public.shared_product_key(p_name text, p_brand text, p_amount integer, p_unit text)
returns text language sql immutable set search_path = '' as $$
  select public.normalize_text(p_name) || '|' || public.normalize_text(coalesce(p_brand, '')) || '|' ||
         case when p_amount is null then '' else p_amount::text || coalesce(p_unit, '') end;
$$;

-- Recebe uma lista de preços vistos pelo usuário. Devolve os ids (do aparelho) já tratados:
-- aceitos ou recusados em definitivo. Os que ficaram de fora por limite diário são reenviados depois.
create or replace function public.report_prices(p_reports jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  s public.marketplace_settings := public.settings();
  r jsonb;
  handled text[] := '{}';
  accepted integer := 0;
  used integer;
  v_product uuid;
  v_location uuid;
  v_barcode text;
  v_name text;
  v_brand text;
  v_amount integer;
  v_unit text;
  v_sale text;
  v_price bigint;
  v_regular bigint;
  v_at timestamptz;
  v_key text;
begin
  if p_reports is null or jsonb_typeof(p_reports) <> 'array' then raise exception 'Lista de preços inválida.'; end if;
  if jsonb_array_length(p_reports) > 100 then raise exception 'Envie no máximo 100 preços por vez.'; end if;
  select count(*) into used from public.price_reports pr where pr.user_id = uid and pr.created_at > now() - interval '24 hours';

  for r in select * from jsonb_array_elements(p_reports) loop
    if used + accepted >= s.daily_price_report_limit then exit; end if;
    handled := handled || coalesce(r ->> 'id', '');
    begin
      v_location := (r ->> 'location_id')::uuid;
      v_price := (r ->> 'unit_price_cents')::bigint;
      v_regular := nullif(r ->> 'regular_price_cents', '')::bigint;
      v_at := (r ->> 'observed_at')::timestamptz;
      v_amount := nullif(r ->> 'package_amount', '')::integer;
    exception when others then
      continue; -- dado malformado: recusado em definitivo
    end;
    v_name := trim(coalesce(r ->> 'name', ''));
    v_brand := nullif(trim(coalesce(r ->> 'brand', '')), '');
    v_unit := nullif(r ->> 'package_unit', '');
    v_sale := coalesce(r ->> 'sale_unit', 'un');
    v_barcode := nullif(regexp_replace(coalesce(r ->> 'barcode', ''), '[^0-9]', '', 'g'), '');

    continue when v_price is null or v_price < 1 or v_price > 10000000;
    continue when v_regular is not null and (v_regular < v_price or v_regular > 10000000);
    continue when char_length(v_name) < 2 or char_length(v_name) > 200 or char_length(coalesce(v_brand, '')) > 120;
    continue when v_sale not in ('un', 'kg', 'l');
    continue when v_unit is not null and v_unit not in ('g', 'ml', 'un');
    continue when v_amount is not null and v_amount <= 0;
    -- preço antigo não entra como informação atual; data no futuro é inválida
    continue when v_at is null or v_at > now() + interval '10 minutes' or v_at < now() - make_interval(days => s.price_report_max_age_days);
    continue when not exists (
      select 1 from public.supermarket_locations l join public.supermarkets m on m.id = l.supermarket_id
      where l.id = v_location and l.status = 'approved' and m.status = 'approved');
    if v_barcode is not null and v_barcode !~ '^[0-9]{8,14}$' then v_barcode := null; end if;
    if v_amount is null then v_unit := null; end if;

    v_product := null;
    v_key := public.shared_product_key(v_name, v_brand, v_amount, v_unit);
    if v_barcode is not null then
      select sp.id into v_product from public.shared_products sp where sp.barcode = v_barcode;
    else
      select sp.id into v_product from public.shared_products sp where sp.barcode is null and sp.name_key = v_key and sp.sale_unit = v_sale;
    end if;
    if v_product is null then
      insert into public.shared_products (barcode, name_key, name, brand, package_amount, package_unit, sale_unit, created_by)
      values (v_barcode, v_key, v_name, v_brand, v_amount, v_unit, v_sale, uid)
      on conflict do nothing
      returning id into v_product;
      if v_product is null then
        select sp.id into v_product from public.shared_products sp
        where (v_barcode is not null and sp.barcode = v_barcode) or (v_barcode is null and sp.barcode is null and sp.name_key = v_key and sp.sale_unit = v_sale);
      end if;
    end if;
    continue when v_product is null;

    insert into public.price_reports (product_id, location_id, user_id, unit_price_cents, regular_price_cents, promo, observed_at, observed_on)
    values (v_product, v_location, uid, v_price, v_regular, coalesce((r ->> 'promo')::boolean, false) or v_regular is not null, v_at,
            (v_at at time zone 'America/Sao_Paulo')::date)
    on conflict (user_id, product_id, location_id, observed_on) do update
      set unit_price_cents = excluded.unit_price_cents, regular_price_cents = excluded.regular_price_cents,
          promo = excluded.promo, observed_at = excluded.observed_at
      where excluded.observed_at >= public.price_reports.observed_at;
    accepted := accepted + 1;
  end loop;
  return jsonb_build_object('handled', to_jsonb(handled), 'accepted', accepted);
end $$;

-- Último preço informado em cada unidade para um produto. Não devolve quem informou.
create or replace function public.community_prices(p_barcode text default null, p_name text default null, p_brand text default null,
  p_package_amount integer default null, p_package_unit text default null, p_sale_unit text default 'un',
  p_city text default null, p_state text default null, p_limit integer default 30)
returns table (location_id uuid, supermarket_name text, address text, neighborhood text, city text, state text,
  unit_price_cents integer, regular_price_cents integer, promo boolean, sale_unit text, observed_at timestamptz, reporters integer)
language sql stable security definer set search_path = '' as $$
  with prod as (
    select sp.id, sp.sale_unit from public.shared_products sp
    where (nullif(p_barcode, '') is not null and sp.barcode = regexp_replace(p_barcode, '[^0-9]', '', 'g'))
       or (nullif(p_barcode, '') is null and p_name is not null and sp.barcode is null and sp.sale_unit = p_sale_unit
           and sp.name_key = public.shared_product_key(p_name, p_brand, p_package_amount, case when p_package_amount is null then null else p_package_unit end))
    limit 1
  ), recent as (
    select pr.*, prod.sale_unit as su from public.price_reports pr join prod on prod.id = pr.product_id
    where pr.observed_at > now() - interval '90 days'
  ), last as (
    select distinct on (r.location_id) r.* from recent r order by r.location_id, r.observed_at desc, r.id desc
  )
  select l.id, m.name, l.address, l.neighborhood, l.city, l.state::text, last.unit_price_cents, last.regular_price_cents, last.promo, last.su, last.observed_at,
         (select count(distinct r.user_id)::integer from recent r where r.location_id = last.location_id and r.observed_at > now() - interval '30 days')
  from last
  join public.supermarket_locations l on l.id = last.location_id and l.status = 'approved'
  join public.supermarkets m on m.id = l.supermarket_id and m.status = 'approved'
  where (p_city is null or public.normalize_text(l.city) = public.normalize_text(p_city))
    and (p_state is null or l.state = upper(p_state))
  order by last.unit_price_cents, last.observed_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- Cadastro colaborativo: dados do produto para um código de barras ainda desconhecido no aparelho.
create or replace function public.lookup_shared_product(p_barcode text)
returns table (name text, brand text, package_amount integer, package_unit text, sale_unit text)
language sql stable security definer set search_path = '' as $$
  select sp.name, sp.brand, sp.package_amount, sp.package_unit, sp.sale_unit
  from public.shared_products sp
  where sp.barcode = regexp_replace(coalesce(p_barcode, ''), '[^0-9]', '', 'g')
     or ltrim(sp.barcode, '0') = nullif(ltrim(regexp_replace(coalesce(p_barcode, ''), '[^0-9]', '', 'g'), '0'), '')
  limit 1;
$$;

-- Moderação: remove um produto da base compartilhada (e os preços dele) ou os preços de um usuário.
create or replace function public.admin_remove_shared_product(p_barcode text default null, p_name_key text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.require_admin();
  delete from public.shared_products sp where (p_barcode is not null and sp.barcode = p_barcode) or (p_barcode is null and sp.barcode is null and sp.name_key = p_name_key);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.admin_remove_user_prices(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.require_admin();
  delete from public.price_reports pr where pr.user_id = p_user;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.purge_old_price_reports()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.price_reports pr where pr.observed_at < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.report_prices(jsonb), public.shared_product_key(text, text, integer, text),
  public.community_prices(text, text, text, integer, text, text, text, text, integer), public.lookup_shared_product(text),
  public.admin_remove_shared_product(text, text), public.admin_remove_user_prices(uuid), public.purge_old_price_reports() from public;
grant execute on function public.community_prices(text, text, text, integer, text, text, text, text, integer), public.lookup_shared_product(text)
  to anon, authenticated;
grant execute on function public.report_prices(jsonb), public.admin_remove_shared_product(text, text), public.admin_remove_user_prices(uuid)
  to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('confere-purge-price-reports', '41 4 2 * *', 'select public.purge_old_price_reports()');
  end if;
exception when others then
  raise notice 'pg_cron indisponível (%). Agende public.purge_old_price_reports() de outra forma.', sqlerrm;
end $$;
