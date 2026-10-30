-- Confere Aí — esquema inicial (Supabase / PostgreSQL)
-- Todas as tabelas de dados pertencem a um usuário (user_id = auth.uid()) e são protegidas por RLS.
-- Os ids (uuid) são gerados no aparelho para permitir uso offline e reenvio idempotente.


-- ---------------------------------------------------------------------------
-- Funções utilitárias
-- ---------------------------------------------------------------------------

-- Força o dono da linha a ser o usuário autenticado (ignora user_id enviado pelo cliente).
create or replace function public.set_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot change' using errcode = '42501';
  end if;
  new.user_id := auth.uid();
  return new;
end $$;

-- Conflitos de sincronização: ignora atualizações mais antigas que a versão armazenada.
create or replace function public.keep_newest()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.updated_at < old.updated_at then
    return null; -- versão do cliente é mais antiga: mantém a do servidor
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Produtos (cadastro do usuário)
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  barcode text check (barcode ~ '^[0-9]{6,14}$'),
  name text not null check (char_length(name) between 1 and 200),
  brand text check (char_length(brand) <= 120),
  category text check (char_length(category) <= 80),
  package_amount integer check (package_amount > 0),
  package_unit text check (package_unit in ('g', 'ml', 'un')),
  sale_unit text not null default 'un' check (sale_unit in ('un', 'kg', 'l')),
  source text not null default 'user' check (source in ('user', 'open_food_facts')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index products_user_barcode_idx on public.products (user_id, barcode) where deleted_at is null;
create index products_user_updated_idx on public.products (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Compras
-- ---------------------------------------------------------------------------
create table public.purchases (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store_name text check (char_length(store_name) <= 160),
  store_cnpj text check (store_cnpj ~ '^[0-9]{14}$'),
  status text not null check (status in ('active', 'checked', 'closed')),
  mode text not null default 'cart' check (mode in ('cart', 'receipt_only')),
  started_at timestamptz not null,
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create index purchases_user_started_idx on public.purchases (user_id, started_at desc);
create index purchases_user_updated_idx on public.purchases (user_id, updated_at);

create table public.cart_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purchase_id uuid not null,
  product_id uuid,
  barcode text,
  name text not null check (char_length(name) between 1 and 200),
  brand text,
  package_label text,
  sale_unit text not null check (sale_unit in ('un', 'kg', 'l')),
  quantity_milli integer not null check (quantity_milli > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  price_source text not null check (price_source in ('manual', 'label_ocr', 'previous', 'receipt')),
  promo_note text,
  added_via text not null check (added_via in ('scan', 'manual')),
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- chaves compostas impedem referenciar compras/produtos de outro usuário
  foreign key (purchase_id, user_id) references public.purchases (id, user_id) on delete cascade,
  foreign key (product_id, user_id) references public.products (id, user_id) on delete set null (product_id)
);
create index cart_items_purchase_idx on public.cart_items (purchase_id);
create index cart_items_user_updated_idx on public.cart_items (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Cupons fiscais (somente dados extraídos; as imagens NÃO são armazenadas)
-- ---------------------------------------------------------------------------
create table public.receipts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purchase_id uuid not null,
  store_name text,
  cnpj text,
  issued_at timestamp,
  access_key text check (access_key ~ '^[0-9]{44}$'),
  qr_url text,
  qr_total_cents bigint,
  item_count integer,
  subtotal_cents bigint,
  discount_cents bigint,
  surcharge_cents bigint,
  total_cents bigint,
  unassigned_discount_cents bigint not null default 0,
  status text not null default 'draft' check (status in ('draft', 'reviewed')),
  ocr_provider text,
  warnings jsonb not null default '[]',
  unparsed jsonb not null default '[]',
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (purchase_id, user_id) references public.purchases (id, user_id) on delete cascade
);
create index receipts_purchase_idx on public.receipts (purchase_id);
create index receipts_user_updated_idx on public.receipts (user_id, updated_at);

create table public.receipt_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  receipt_id uuid not null,
  position integer not null,
  seq integer,
  code text,
  description text not null,
  quantity_milli integer check (quantity_milli > 0),
  unit text not null check (unit in ('un', 'kg', 'l')),
  raw_unit text,
  unit_price_cents bigint,
  total_cents bigint,
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  surcharge_cents bigint not null default 0 check (surcharge_cents >= 0),
  confidence real not null check (confidence between 0 and 1),
  issues jsonb not null default '[]',
  source_part integer not null default 0,
  raw_lines jsonb not null default '[]',
  user_edited boolean not null default false,
  manual_cart_item_id uuid,
  manual_unmatched boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (receipt_id, user_id) references public.receipts (id, user_id) on delete cascade
);
create index receipt_items_receipt_idx on public.receipt_items (receipt_id, position);
create index receipt_items_user_updated_idx on public.receipt_items (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Conferências
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purchase_id uuid not null,
  receipt_id uuid not null,
  scenario text not null check (scenario in ('cart_vs_receipt', 'receipt_only')),
  overall text not null check (overall in ('green', 'yellow', 'red')),
  complete boolean not null,
  cart_total_cents bigint,
  receipt_total_cents bigint,
  difference_cents bigint,
  items_checked integer not null,
  open_count integer not null,
  limitations jsonb not null default '[]',
  matches jsonb not null default '[]',
  ok_cart jsonb not null default '[]',
  ok_receipt jsonb not null default '[]',
  generated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  unique (receipt_id),
  foreign key (purchase_id, user_id) references public.purchases (id, user_id) on delete cascade,
  foreign key (receipt_id, user_id) references public.receipts (id, user_id) on delete cascade
);
create index reports_user_updated_idx on public.reports (user_id, updated_at);

create table public.divergences (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  report_id uuid not null,
  key text not null,
  kind text not null,
  group_name text not null check (group_name in ('ok', 'duplicates', 'quantity', 'price', 'not_found', 'discounts', 'review')),
  severity text not null check (severity in ('green', 'yellow', 'red')),
  title text not null,
  explanation text not null,
  cart_item_id uuid,
  receipt_item_ids jsonb not null default '[]',
  potential_diff_cents bigint,
  resolution text not null default 'open' check (resolution in ('open', 'confirmed_ok', 'flag_cashier', 'dismissed')),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (report_id, key),
  foreign key (report_id, user_id) references public.reports (id, user_id) on delete cascade
);
create index divergences_user_updated_idx on public.divergences (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Histórico de preços, eventos de leitura e histórico de alterações
-- ---------------------------------------------------------------------------
create table public.price_history (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null,
  purchase_id uuid,
  cart_item_id uuid unique,
  store_name text,
  sale_unit text not null check (sale_unit in ('un', 'kg', 'l')),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  source text not null check (source in ('manual', 'label_ocr', 'previous', 'receipt')),
  promo boolean not null default false,
  recorded_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade,
  foreign key (purchase_id, user_id) references public.purchases (id, user_id) on delete set null (purchase_id)
);
create index price_history_product_idx on public.price_history (user_id, product_id, recorded_at desc);
create index price_history_user_updated_idx on public.price_history (user_id, updated_at);

create table public.scan_events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purchase_id uuid,
  type text not null,
  barcode text,
  cart_item_id uuid,
  detail text,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (purchase_id, user_id) references public.purchases (id, user_id) on delete cascade
);
create index scan_events_purchase_idx on public.scan_events (purchase_id, created_at);
create index scan_events_user_updated_idx on public.scan_events (user_id, updated_at);

create table public.edit_log (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entity text not null,
  entity_id uuid not null,
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index edit_log_entity_idx on public.edit_log (user_id, entity, entity_id);
create index edit_log_user_updated_idx on public.edit_log (user_id, updated_at);

-- Controle de uso do OCR (limite diário por usuário). Não guarda imagens nem texto.
create table public.ocr_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('receipt', 'label')),
  images integer not null check (images between 1 and 6),
  provider text not null,
  created_at timestamptz not null default now()
);
create index ocr_usage_user_created_idx on public.ocr_usage (user_id, created_at);

-- ---------------------------------------------------------------------------
-- Gatilhos e RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['products','purchases','cart_items','receipts','receipt_items','reports','divergences','price_history','scan_events','edit_log','ocr_usage']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_owner()', t || '_owner', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    if t <> 'ocr_usage' then
      execute format('create trigger %I before update on public.%I for each row execute function public.keep_newest()', t || '_keep_newest', t);
      execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
      execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
    end if;
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
grant select, update on public.profiles to authenticated;
revoke all on public.profiles from anon;

-- Exclusão completa da conta e de todos os dados (direito do titular — LGPD art. 18).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = uid; -- as tabelas têm on delete cascade
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
