-- Confere Aí — marketplace colaborativo de promoções com geolocalização.
--
-- Princípios:
--  * Escritas importantes acontecem apenas por funções (RPC) que validam tudo no servidor:
--    o aplicativo não grava diretamente em promoções, confirmações, denúncias ou moderação.
--  * Coordenadas de quem publica/confirma NUNCA são gravadas: o servidor recebe latitude e
--    longitude, calcula a distância até a unidade escolhida e guarda só distância e precisão.
--  * Leitura pública só por funções que devolvem campos seguros (unidade do supermercado,
--    nunca o autor nem a localização do autor).
--  * Indicadores de verificação são independentes (localização, foto, comunidade, moderação).
--  * A localização não prova presença física: é um sinal de confiança entre outros.

-- ---------------------------------------------------------------------------
-- Configuração e administradores
-- ---------------------------------------------------------------------------
create table public.marketplace_settings (
  id smallint primary key default 1 check (id = 1),
  default_radius_m integer not null default 200 check (default_radius_m between 50 and 2000),
  max_accuracy_m integer not null default 100 check (max_accuracy_m between 10 and 1000),
  max_capture_age_s integer not null default 300 check (max_capture_age_s between 30 and 3600),
  min_independent_confirmations integer not null default 3 check (min_independent_confirmations >= 1),
  confirmer_min_account_age_hours integer not null default 24 check (confirmer_min_account_age_hours >= 0),
  contest_threshold integer not null default 3 check (contest_threshold >= 1),
  daily_publish_limit integer not null default 10,
  daily_confirmation_limit integer not null default 40,
  daily_report_limit integer not null default 20,
  daily_store_suggestion_limit integer not null default 3,
  max_validity_days integer not null default 60,
  reconfirm_after_hours integer not null default 24,
  updated_at timestamptz not null default now()
);
insert into public.marketplace_settings (id) values (1);

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid());
$$;

create or replace function public.settings()
returns public.marketplace_settings language sql stable security definer set search_path = '' as $$
  select * from public.marketplace_settings where id = 1;
$$;

alter table public.profiles add column if not exists banned_until timestamptz;
alter table public.profiles add column if not exists ban_reason text;

create or replace function public.require_active_user()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); banned timestamptz;
begin
  if uid is null then raise exception 'Entre na sua conta para participar.' using errcode = '42501'; end if;
  if exists (select 1 from auth.users u where u.id = uid and coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false)) then
    raise exception 'Crie uma conta para participar do marketplace.' using errcode = '42501';
  end if;
  select p.banned_until into banned from public.profiles p where p.id = uid;
  if banned is not null and banned > now() then
    raise exception 'Sua conta está suspensa de publicar até %.', to_char(banned at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') using errcode = '42501';
  end if;
  return uid;
end $$;

-- ---------------------------------------------------------------------------
-- Utilitários: distância, normalização, CNPJ
-- ---------------------------------------------------------------------------
create or replace function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable parallel safe set search_path = '' as $$
  select 2 * 6371008.8 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

create or replace function public.normalize_text(t text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select trim(regexp_replace(
    translate(lower(coalesce(t, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.is_valid_cnpj(c text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(c, ''), '\D', '', 'g'); s int; r int; w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2]; w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2]; i int;
begin
  if length(d) <> 14 or d ~ '^(\d)\1{13}$' then return false; end if;
  s := 0; for i in 1..12 loop s := s + substr(d, i, 1)::int * w1[i]; end loop;
  r := s % 11; if (case when r < 2 then 0 else 11 - r end) <> substr(d, 13, 1)::int then return false; end if;
  s := 0; for i in 1..13 loop s := s + substr(d, i, 1)::int * w2[i]; end loop;
  r := s % 11; return (case when r < 2 then 0 else 11 - r end) = substr(d, 14, 1)::int;
end $$;

-- ---------------------------------------------------------------------------
-- Supermercados e unidades
-- ---------------------------------------------------------------------------
create table public.supermarkets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  normalized_name text not null,
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  cnpj text check (cnpj is null or public.is_valid_cnpj(cnpj)),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid references auth.users (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index supermarkets_name_uq on public.supermarkets (normalized_name) where status <> 'rejected';

create table public.supermarket_locations (
  id uuid primary key default gen_random_uuid(),
  supermarket_id uuid not null references public.supermarkets (id) on delete cascade,
  address text not null check (char_length(trim(address)) between 5 and 160),
  neighborhood text check (char_length(neighborhood) <= 80),
  city text not null check (char_length(trim(city)) between 2 and 80),
  state char(2) not null check (state ~ '^[A-Z]{2}$'),
  latitude double precision not null check (latitude between -34 and 6),
  longitude double precision not null check (longitude between -75 and -28),
  radius_m integer check (radius_m between 50 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid references auth.users (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index supermarket_locations_city_idx on public.supermarket_locations (state, city) where status = 'approved';
create index supermarket_locations_geo_idx on public.supermarket_locations (latitude, longitude);
create index supermarket_locations_market_idx on public.supermarket_locations (supermarket_id);

-- ---------------------------------------------------------------------------
-- Promoções
-- ---------------------------------------------------------------------------
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  location_id uuid not null references public.supermarket_locations (id) on delete restrict,
  product_name text not null check (char_length(trim(product_name)) between 2 and 120),
  normalized_product text not null,
  brand text check (char_length(brand) <= 80),
  category text not null check (category in ('carnes', 'peixes', 'hortifruti', 'laticinios', 'mercearia', 'bebidas', 'limpeza', 'higiene', 'congelados', 'padaria', 'pet')),
  package_label text check (char_length(package_label) <= 40),
  product_type text not null default 'packaged' check (product_type in ('packaged', 'weighed', 'fresh', 'bulk')),
  barcode text check (barcode is null or barcode ~ '^[0-9]{8,14}$'),
  description text check (char_length(description) <= 500),
  regular_price_cents integer check (regular_price_cents is null or regular_price_cents > 0),
  promotional_price_cents integer not null check (promotional_price_cents between 1 and 10000000),
  sale_unit text not null check (sale_unit in ('un', 'kg', '100g', 'l', 'pack')),
  min_quantity integer check (min_quantity is null or min_quantity between 1 and 100),
  condition_types text[] not null default '{any_customer}' check (condition_types <@ array['any_customer', 'loyalty_members', 'store_app_payment', 'min_quantity', 'weekend_only', 'limited_stock', 'other']::text[] and cardinality(condition_types) between 1 and 7),
  conditions text check (char_length(conditions) <= 500),
  starts_on date not null,
  ends_on date not null,
  expires_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'published', 'partially_verified', 'community_confirmed', 'contested', 'expired', 'removed')),
  location_status text not null check (location_status in ('compatible', 'far', 'low_accuracy', 'unavailable')),
  photo_status text not null default 'pending' check (photo_status in ('pending', 'accepted', 'rejected')),
  moderation_status text not null default 'none' check (moderation_status in ('none', 'approved', 'suspended', 'removed')),
  independent_confirmations integer not null default 0,
  negative_reports integer not null default 0,
  open_reports integer not null default 0,
  submitted_at timestamptz,
  first_visible_at timestamptz,
  expiry_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (regular_price_cents is null or regular_price_cents > promotional_price_cents),
  check (not ('min_quantity' = any (condition_types)) or min_quantity is not null)
);
create index promotions_visible_idx on public.promotions (expires_at, status);
create index promotions_location_idx on public.promotions (location_id, status);
create index promotions_user_idx on public.promotions (user_id, created_at desc);
create index promotions_category_idx on public.promotions (category, status);
create index promotions_dup_idx on public.promotions (location_id, normalized_product, promotional_price_cents);

create table public.promotion_images (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  image_type text not null check (image_type in ('price_tag', 'product', 'promo_sign', 'store_ad')),
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);
create index promotion_images_promotion_idx on public.promotion_images (promotion_id);

-- Sem coordenadas: apenas o resultado da verificação.
create table public.promotion_location_checks (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  check_kind text not null check (check_kind in ('publication', 'confirmation')),
  distance_m integer check (distance_m >= 0),
  accuracy_m integer check (accuracy_m >= 0),
  radius_m integer not null,
  location_status text not null check (location_status in ('compatible', 'far', 'low_accuracy', 'unavailable')),
  captured_at timestamptz,
  checked_at timestamptz not null default now()
);
create index promotion_location_checks_idx on public.promotion_location_checks (promotion_id);

create table public.promotion_confirmations (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  confirmation_type text not null check (confirmation_type in ('found', 'price_correct', 'price_different', 'ended', 'not_found')),
  reported_price_cents integer check (reported_price_cents is null or reported_price_cents > 0),
  evidence_image_path text,
  location_status text check (location_status in ('compatible', 'far', 'low_accuracy', 'unavailable')),
  independent boolean not null,
  created_at timestamptz not null default now(),
  unique (promotion_id, user_id),
  check (confirmation_type <> 'price_different' or reported_price_cents is not null)
);
create index promotion_confirmations_user_idx on public.promotion_confirmations (user_id, created_at);

create table public.promotion_reports (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('wrong_price', 'nonexistent', 'misleading_photo', 'wrong_store', 'expired', 'different_product', 'inappropriate', 'spam', 'fraud')),
  description text check (char_length(description) <= 500),
  status text not null default 'open' check (status in ('open', 'upheld', 'rejected')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index promotion_reports_open_uq on public.promotion_reports (promotion_id, user_id) where status = 'open';
create index promotion_reports_status_idx on public.promotion_reports (status, created_at);

create table public.promotion_favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, promotion_id)
);

create table public.promotion_history (
  id bigint generated always as identity primary key,
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid,
  reason text,
  changed_at timestamptz not null default now()
);
create index promotion_history_idx on public.promotion_history (promotion_id, changed_at);

create table public.moderation_actions (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users (id) on delete set null,
  target_type text not null check (target_type in ('promotion', 'report', 'location', 'supermarket', 'user')),
  target_id uuid not null,
  action text not null,
  notes text,
  created_at timestamptz not null default now()
);
create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id);

-- ---------------------------------------------------------------------------
-- Notificações
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  city text check (char_length(city) <= 80),
  state char(2) check (state ~ '^[A-Z]{2}$'),
  notify_nearby boolean not null default false,
  favorite_categories text[] not null default '{}',
  favorite_terms text[] not null default '{}' check (cardinality(favorite_terms) <= 20),
  notify_my_promotions boolean not null default true,
  notify_expiring_favorites boolean not null default true,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.push_tokens (
  token text primary key check (char_length(token) between 10 and 200),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('nearby_offer', 'favorite_product', 'favorite_category', 'promotion_confirmed', 'promotion_contested', 'expiring_soon', 'moderation_update')),
  promotion_id uuid references public.promotions (id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind, promotion_id)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_push_idx on public.notifications (created_at) where push_sent_at is null;

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger supermarkets_touch before update on public.supermarkets for each row execute function public.touch_updated_at();
create trigger supermarket_locations_touch before update on public.supermarket_locations for each row execute function public.touch_updated_at();
create trigger promotions_touch before update on public.promotions for each row execute function public.touch_updated_at();

create or replace function public.promotion_status_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.promotion_history (promotion_id, previous_status, new_status, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger promotions_history after insert or update of status on public.promotions for each row execute function public.promotion_status_history();

create or replace function public.notify(p_user uuid, p_kind text, p_promotion uuid, p_title text, p_body text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, promotion_id, title, body)
  values (p_user, p_kind, p_promotion, p_title, p_body)
  on conflict (user_id, kind, promotion_id) do nothing;
$$;

-- ---------------------------------------------------------------------------
-- Reputação
-- ---------------------------------------------------------------------------
create or replace function public.user_reputation(p_user uuid)
returns table (score integer, level text, published integer, confirmed integer, accurate integer, inaccurate integer, upheld_reports integer, removed integer)
language sql stable security definer set search_path = '' as $$
  with p as (
    select count(*) filter (where status not in ('draft')) as published,
           count(*) filter (where status = 'community_confirmed' or moderation_status = 'approved') as confirmed,
           count(*) filter (where status = 'removed' or moderation_status = 'removed') as removed
    from public.promotions where user_id = p_user
  ), c as (
    select count(*) filter (where c.confirmation_type in ('found', 'price_correct') and c.independent) as accurate,
           count(*) filter (where c.confirmation_type in ('price_different', 'not_found') and c.independent) as inaccurate
    from public.promotion_confirmations c join public.promotions pr on pr.id = c.promotion_id
    where pr.user_id = p_user
  ), r as (
    select count(*) as upheld from public.promotion_reports rp join public.promotions pr on pr.id = rp.promotion_id
    where pr.user_id = p_user and rp.status = 'upheld'
  ), s as (
    -- Qualidade pesa mais que quantidade: publicar sem confirmação rende pouco.
    select greatest(0, least(p.published, 10) + 5 * p.confirmed + 2 * c.accurate - 3 * c.inaccurate - 8 * r.upheld - 10 * p.removed)::int as score,
           p.published::int, p.confirmed::int, c.accurate::int, c.inaccurate::int, r.upheld::int, p.removed::int
    from p, c, r
  )
  select s.score,
         case
           when s.score >= 60 and s.confirmed >= 10 and s.removed = 0 then 'highlight'
           when s.score >= 25 and s.confirmed >= 3 and s.upheld = 0 then 'trusted'
           when s.score >= 5 then 'active'
           else 'new'
         end,
         s.published, s.confirmed, s.accurate, s.inaccurate, s.upheld, s.removed
  from s;
$$;

create or replace function public.my_reputation()
returns table (score integer, level text, published integer, confirmed integer, accurate integer, inaccurate integer, upheld_reports integer, removed integer)
language sql stable security definer set search_path = '' as $$
  select * from public.user_reputation(auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Status da promoção (derivado das evidências)
-- ---------------------------------------------------------------------------
create or replace function public.recompute_promotion(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  p public.promotions; s public.marketplace_settings := public.settings();
  loc_ok boolean; store_ok boolean; trusted boolean; pos int; neg int; reports int; new_status text;
begin
  select * into p from public.promotions where id = p_id for update;
  if not found then return null; end if;

  select count(*) filter (where confirmation_type in ('found', 'price_correct') and independent),
         count(*) filter (where confirmation_type in ('price_different', 'ended', 'not_found') and independent)
    into pos, neg from public.promotion_confirmations where promotion_id = p_id;
  select count(*) into reports from public.promotion_reports where promotion_id = p_id and status = 'open';

  select l.status = 'approved' and m.status = 'approved' into store_ok
  from public.supermarket_locations l join public.supermarkets m on m.id = l.supermarket_id where l.id = p.location_id;
  loc_ok := p.location_status = 'compatible';
  select r.level in ('trusted', 'highlight') into trusted from public.user_reputation(p.user_id) r;

  new_status := case
    when p.moderation_status = 'removed' then 'removed'
    when p.expires_at <= now() then 'expired'
    when p.submitted_at is null then 'draft'
    when p.moderation_status = 'suspended' then 'pending_review'
    when reports >= s.contest_threshold or (neg >= 2 and neg > pos) then 'contested'
    when p.moderation_status <> 'approved' and (not store_ok or (not loc_ok and not trusted)) then 'pending_review'
    when pos >= s.min_independent_confirmations and pos > neg then 'community_confirmed'
    when p.moderation_status = 'approved' or loc_ok or p.photo_status = 'accepted' then 'partially_verified'
    else 'published'
  end;

  update public.promotions set
    status = new_status,
    independent_confirmations = pos,
    negative_reports = neg,
    open_reports = reports,
    first_visible_at = coalesce(first_visible_at, case when new_status in ('published', 'partially_verified', 'community_confirmed') then now() end)
  where id = p_id;

  -- Notificações sobre eventos reais
  if new_status is distinct from p.status then
    if new_status = 'community_confirmed'
       and coalesce((select np.notify_my_promotions from public.notification_preferences np where np.user_id = p.user_id), true) then
      perform public.notify(p.user_id, 'promotion_confirmed', p.id, 'Sua promoção foi confirmada', format('Pessoas da comunidade confirmaram "%s".', p.product_name));
    elsif new_status = 'contested'
       and coalesce((select np.notify_my_promotions from public.notification_preferences np where np.user_id = p.user_id), true) then
      perform public.notify(p.user_id, 'promotion_contested', p.id, 'Sua promoção foi contestada', format('Há relatos de que "%s" está diferente ou acabou. Ela será revisada.', p.product_name));
    end if;
    if p.first_visible_at is null and new_status in ('published', 'partially_verified', 'community_confirmed') then
      perform public.fan_out_new_promotion(p_id);
    end if;
  end if;
  return new_status;
end $$;

-- Avisa quem pediu: mesma cidade (sem usar a localização de ninguém) e categoria/termos favoritos.
create or replace function public.fan_out_new_promotion(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  select pr.id, pr.user_id, pr.product_name, pr.normalized_product, pr.category, pr.promotional_price_cents, l.city, l.state, m.name as store
    into p from public.promotions pr
    join public.supermarket_locations l on l.id = pr.location_id join public.supermarkets m on m.id = l.supermarket_id
    where pr.id = p_id;
  insert into public.notifications (user_id, kind, promotion_id, title, body)
  select np.user_id,
         case when exists (select 1 from unnest(np.favorite_terms) t where p.normalized_product like '%' || public.normalize_text(t) || '%') then 'favorite_product'
              when p.category = any (np.favorite_categories) then 'favorite_category'
              else 'nearby_offer' end,
         p.id,
         format('Nova oferta em %s', p.store),
         format('%s por R$ %s', p.product_name, replace(to_char(p.promotional_price_cents / 100.0, 'FM999990.00'), '.', ','))
  from public.notification_preferences np
  where np.user_id <> p.user_id
    and public.normalize_text(np.city) = public.normalize_text(p.city) and np.state = p.state
    and (np.notify_nearby
         or p.category = any (np.favorite_categories)
         or exists (select 1 from unnest(np.favorite_terms) t where length(public.normalize_text(t)) >= 3 and p.normalized_product like '%' || public.normalize_text(t) || '%'))
  limit 2000
  on conflict (user_id, kind, promotion_id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Verificação de localização (servidor)
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_location(p_location_id uuid, p_lat double precision, p_lng double precision, p_accuracy double precision, p_captured_at timestamptz)
returns table (location_status text, distance_m integer, accuracy_m integer, radius_m integer)
language plpgsql stable security definer set search_path = '' as $$
declare s public.marketplace_settings := public.settings(); l public.supermarket_locations; d double precision; r integer;
begin
  select * into l from public.supermarket_locations where id = p_location_id;
  if not found then raise exception 'Unidade não encontrada.'; end if;
  r := coalesce(l.radius_m, s.default_radius_m);
  if p_lat is null or p_lng is null or p_accuracy is null or p_captured_at is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy < 0
     or p_captured_at < now() - make_interval(secs => s.max_capture_age_s) or p_captured_at > now() + interval '60 seconds' then
    return query select 'unavailable'::text, null::int, null::int, r;
    return;
  end if;
  d := public.distance_m(p_lat, p_lng, l.latitude, l.longitude);
  return query select
    case when p_accuracy > s.max_accuracy_m then 'low_accuracy'
         when d - least(p_accuracy, s.max_accuracy_m) > r then 'far'   -- fora mesmo considerando a margem do GPS
         when d > r then 'low_accuracy'                                -- só dentro do raio pela margem de erro: não verifica
         else 'compatible' end,
    round(d)::int, round(p_accuracy)::int, r;
end $$;

-- ---------------------------------------------------------------------------
-- Publicação
-- ---------------------------------------------------------------------------
create or replace function public.create_promotion(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user(); s public.marketplace_settings := public.settings();
  loc public.supermarket_locations; ev record; new_id uuid; dup uuid; starts date; ends date;
  conds text[]; norm text; today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if (select count(*) from public.promotions where user_id = uid and created_at > now() - interval '24 hours') >= s.daily_publish_limit then
    raise exception 'Limite diário de publicações atingido. Tente novamente amanhã.' using errcode = 'P0001';
  end if;
  select * into loc from public.supermarket_locations where id = (p ->> 'location_id')::uuid and status <> 'rejected';
  if not found then raise exception 'Selecione uma unidade de supermercado válida.'; end if;

  -- Validação explícita (mensagens claras); as restrições da tabela são a última barreira.
  if char_length(trim(coalesce(p ->> 'product_name', ''))) < 2 then raise exception 'Informe o nome do produto.'; end if;
  if coalesce((p ->> 'promotional_price_cents')::int, 0) <= 0 then raise exception 'Informe o preço promocional.'; end if;
  if (p ->> 'regular_price_cents')::int is not null and (p ->> 'regular_price_cents')::int <= (p ->> 'promotional_price_cents')::int then
    raise exception 'O preço anterior deve ser maior que o preço promocional.';
  end if;
  if p ->> 'category' is null or p ->> 'category' not in ('carnes', 'peixes', 'hortifruti', 'laticinios', 'mercearia', 'bebidas', 'limpeza', 'higiene', 'congelados', 'padaria', 'pet') then
    raise exception 'Escolha uma categoria válida.';
  end if;
  if coalesce(p ->> 'sale_unit', '') not in ('un', 'kg', '100g', 'l', 'pack') then raise exception 'Escolha a unidade de venda.'; end if;
  if p -> 'condition_types' ? 'min_quantity' and coalesce((p ->> 'min_quantity')::int, 0) < 1 then
    raise exception 'Informe a quantidade mínima da promoção.';
  end if;

  starts := coalesce((p ->> 'starts_on')::date, today);
  ends := (p ->> 'ends_on')::date;
  if ends is null then raise exception 'Informe a data de encerramento da promoção.'; end if;
  if ends < today then raise exception 'A data de encerramento já passou.'; end if;
  if starts < today - 7 then raise exception 'A data de início é muito antiga.'; end if;
  if ends > starts + s.max_validity_days then raise exception 'A validade máxima é de % dias.', s.max_validity_days; end if;

  conds := coalesce(array(select jsonb_array_elements_text(p -> 'condition_types')), '{any_customer}');
  if 'any_customer' = any (conds) and cardinality(conds) > 1 then
    raise exception '"Válida para qualquer cliente" não pode ser combinada com outras condições.';
  end if;
  if 'other' = any (conds) and coalesce(trim(p ->> 'conditions'), '') = '' then
    raise exception 'Descreva as condições da promoção.';
  end if;

  norm := public.normalize_text(concat_ws(' ', p ->> 'product_name', p ->> 'brand', p ->> 'package_label'));

  -- Duplicidade exata: mesma unidade, produto, preço, unidade de venda, condições e validade.
  select pr.id into dup from public.promotions pr
  where pr.location_id = loc.id and pr.normalized_product = norm
    and pr.promotional_price_cents = (p ->> 'promotional_price_cents')::int
    and pr.sale_unit = p ->> 'sale_unit'
    and pr.condition_types @> conds and conds @> pr.condition_types
    and public.normalize_text(pr.conditions) = public.normalize_text(p ->> 'conditions')
    and pr.ends_on = ends
    and pr.status in ('pending_review', 'published', 'partially_verified', 'community_confirmed', 'contested')
    and pr.expires_at > now()
  limit 1;
  if dup is not null then
    return jsonb_build_object('duplicate_of', dup);
  end if;

  select * into ev from public.evaluate_location(loc.id, (p ->> 'latitude')::float8, (p ->> 'longitude')::float8, (p ->> 'accuracy_m')::float8, (p ->> 'captured_at')::timestamptz);

  insert into public.promotions (user_id, location_id, product_name, normalized_product, brand, category, package_label, product_type, barcode, description,
    regular_price_cents, promotional_price_cents, sale_unit, min_quantity, condition_types, conditions, starts_on, ends_on, expires_at, location_status)
  values (uid, loc.id, trim(p ->> 'product_name'), norm, nullif(trim(p ->> 'brand'), ''), p ->> 'category', nullif(trim(p ->> 'package_label'), ''),
    coalesce(p ->> 'product_type', 'packaged'), nullif(p ->> 'barcode', ''), nullif(trim(p ->> 'description'), ''),
    (p ->> 'regular_price_cents')::int, (p ->> 'promotional_price_cents')::int, p ->> 'sale_unit', (p ->> 'min_quantity')::int,
    conds, nullif(trim(p ->> 'conditions'), ''), starts, ends,
    ((ends + 1)::timestamp at time zone 'America/Sao_Paulo'), ev.location_status)
  returning id into new_id;

  -- Somente o resultado é guardado; latitude/longitude são descartadas.
  insert into public.promotion_location_checks (promotion_id, user_id, check_kind, distance_m, accuracy_m, radius_m, location_status, captured_at)
  values (new_id, uid, 'publication', ev.distance_m, ev.accuracy_m, ev.radius_m, ev.location_status, (p ->> 'captured_at')::timestamptz);

  return jsonb_build_object('id', new_id, 'status', 'draft', 'location_status', ev.location_status,
    'distance_m', ev.distance_m, 'accuracy_m', ev.accuracy_m, 'radius_m', ev.radius_m);
end $$;

-- Ofertas parecidas (não idênticas) para o usuário decidir antes de publicar.
create or replace function public.find_similar_promotions(p_location_id uuid, p_product text, p_brand text, p_package text)
returns table (id uuid, product_name text, brand text, package_label text, promotional_price_cents integer, sale_unit text, ends_on date, status text, independent_confirmations integer)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.product_name, pr.brand, pr.package_label, pr.promotional_price_cents, pr.sale_unit, pr.ends_on, pr.status, pr.independent_confirmations
  from public.promotions pr
  where pr.location_id = p_location_id
    and pr.status in ('published', 'partially_verified', 'community_confirmed', 'contested')
    and pr.expires_at > now()
    and pr.normalized_product = public.normalize_text(concat_ws(' ', p_product, p_brand, p_package))
  order by pr.created_at desc limit 5;
$$;

create or replace function public.add_promotion_image(p_promotion_id uuid, p_path text, p_type text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user(); obj record; img uuid; owner_id uuid; st text;
begin
  select user_id, status into owner_id, st from public.promotions where id = p_promotion_id;
  if owner_id is null or owner_id <> uid then raise exception 'Publicação não encontrada.' using errcode = '42501'; end if;
  if st in ('removed', 'expired') then raise exception 'Esta publicação não aceita novas fotos.'; end if;
  -- O caminho não contém o id do autor (evita ligar publicações à mesma pessoa).
  if p_path not like 'p/' || p_promotion_id::text || '/%' then raise exception 'Caminho de imagem inválido.'; end if;
  if (select count(*) from public.promotion_images where promotion_id = p_promotion_id) >= 5 then
    raise exception 'Cada publicação aceita até 5 fotografias.';
  end if;
  select o.owner, coalesce((o.metadata ->> 'size')::bigint, 0) as size, coalesce(o.metadata ->> 'mimetype', '') as mime
    into obj from storage.objects o where o.bucket_id = 'promotion-images' and o.name = p_path;
  if not found or obj.owner is distinct from uid then raise exception 'Imagem não encontrada no armazenamento.'; end if;
  if obj.size <= 0 then raise exception 'A imagem está vazia.'; end if;
  if obj.mime not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'Formato de imagem não aceito.'; end if;
  insert into public.promotion_images (promotion_id, user_id, storage_path, image_type, size_bytes)
  values (p_promotion_id, uid, p_path, p_type, obj.size) returning id into img;
  return img;
end $$;

create or replace function public.submit_promotion(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user(); p public.promotions; st text;
begin
  select * into p from public.promotions where id = p_id;
  if not found or p.user_id <> uid then raise exception 'Publicação não encontrada.' using errcode = '42501'; end if;
  if p.submitted_at is not null then return jsonb_build_object('id', p_id, 'status', p.status); end if;
  if not exists (select 1 from public.promotion_images where promotion_id = p_id and image_type in ('price_tag', 'promo_sign', 'store_ad')) then
    raise exception 'Adicione pelo menos uma foto da etiqueta, da placa ou do anúncio da oferta.';
  end if;
  update public.promotions set submitted_at = now() where id = p_id;
  st := public.recompute_promotion(p_id);
  return jsonb_build_object('id', p_id, 'status', st);
end $$;

create or replace function public.update_my_promotion(p_id uuid, p_description text, p_conditions text, p_ends_on date)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user(); p public.promotions;
begin
  select * into p from public.promotions where id = p_id;
  if not found or p.user_id <> uid then raise exception 'Publicação não encontrada.' using errcode = '42501'; end if;
  if p.status in ('removed', 'expired') then raise exception 'Esta publicação não pode mais ser alterada.'; end if;
  -- Preço e produto não mudam depois de publicados (as confirmações se referem a eles).
  if p_ends_on is not null and (p_ends_on > p.ends_on or p_ends_on < (now() at time zone 'America/Sao_Paulo')::date) then
    raise exception 'A validade só pode ser antecipada (e não para uma data passada). Para outro período, publique uma nova oferta.';
  end if;
  update public.promotions set
    description = coalesce(nullif(trim(p_description), ''), description),
    conditions = coalesce(nullif(trim(p_conditions), ''), conditions),
    ends_on = coalesce(p_ends_on, ends_on),
    expires_at = case when p_ends_on is null then expires_at else ((p_ends_on + 1)::timestamp at time zone 'America/Sao_Paulo') end
  where id = p_id;
  return public.recompute_promotion(p_id);
end $$;

create or replace function public.end_my_promotion(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user();
begin
  update public.promotions set expires_at = least(expires_at, now()) where id = p_id and user_id = uid;
  if not found then raise exception 'Publicação não encontrada.' using errcode = '42501'; end if;
  return public.recompute_promotion(p_id);
end $$;

create or replace function public.delete_my_draft(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user();
begin
  delete from public.promotions where id = p_id and user_id = uid and submitted_at is null;
end $$;

-- ---------------------------------------------------------------------------
-- Confirmações e denúncias
-- ---------------------------------------------------------------------------
create or replace function public.confirm_promotion(p_id uuid, p_type text, p_reported_price_cents integer default null,
  p_evidence_path text default null, p_latitude double precision default null, p_longitude double precision default null,
  p_accuracy_m double precision default null, p_captured_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user(); s public.marketplace_settings := public.settings();
  p public.promotions; prev public.promotion_confirmations; ev record; indep boolean; account_age interval; st text;
begin
  select * into p from public.promotions where id = p_id;
  if not found or p.status not in ('published', 'partially_verified', 'community_confirmed', 'contested') or p.expires_at <= now() then
    raise exception 'Esta promoção não está ativa.';
  end if;
  if p.user_id = uid then raise exception 'Você não pode confirmar a sua própria publicação.' using errcode = '42501'; end if;
  if p_type not in ('found', 'price_correct', 'price_different', 'ended', 'not_found') then raise exception 'Tipo de confirmação inválido.'; end if;
  if p_type = 'price_different' and coalesce(p_reported_price_cents, 0) <= 0 then raise exception 'Informe o preço que você encontrou.'; end if;
  if (select count(*) from public.promotion_confirmations where user_id = uid and created_at > now() - interval '24 hours') >= s.daily_confirmation_limit then
    raise exception 'Limite diário de confirmações atingido.' using errcode = 'P0001';
  end if;
  select * into prev from public.promotion_confirmations where promotion_id = p_id and user_id = uid;
  if found and prev.created_at > now() - make_interval(hours => s.reconfirm_after_hours) then
    raise exception 'Você já respondeu sobre esta promoção. Poderá atualizar sua resposta em % horas.', s.reconfirm_after_hours using errcode = 'P0001';
  end if;
  if p_evidence_path is not null and p_evidence_path not like 'c/' || p_id::text || '/%' then
    raise exception 'Caminho de imagem inválido.';
  end if;
  if p_evidence_path is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'promotion-images' and o.name = p_evidence_path and o.owner = uid) then
    raise exception 'Imagem de evidência não encontrada.';
  end if;

  select * into ev from public.evaluate_location(p.location_id, p_latitude, p_longitude, p_accuracy_m, p_captured_at);
  -- Conta como independente: conta com idade mínima (dificulta contas criadas para inflar confirmações).
  select now() - u.created_at into account_age from auth.users u where u.id = uid;
  indep := coalesce(account_age, interval '0') >= make_interval(hours => s.confirmer_min_account_age_hours);

  insert into public.promotion_confirmations (promotion_id, user_id, confirmation_type, reported_price_cents, evidence_image_path, location_status, independent, created_at)
  values (p_id, uid, p_type, case when p_type = 'price_different' then p_reported_price_cents end, p_evidence_path, ev.location_status, indep, now())
  on conflict (promotion_id, user_id) do update set confirmation_type = excluded.confirmation_type, reported_price_cents = excluded.reported_price_cents,
    evidence_image_path = excluded.evidence_image_path, location_status = excluded.location_status, independent = excluded.independent, created_at = now();

  insert into public.promotion_location_checks (promotion_id, user_id, check_kind, distance_m, accuracy_m, radius_m, location_status, captured_at)
  values (p_id, uid, 'confirmation', ev.distance_m, ev.accuracy_m, ev.radius_m, ev.location_status, p_captured_at);

  st := public.recompute_promotion(p_id);
  return jsonb_build_object('status', st, 'independent', indep, 'location_status', ev.location_status);
end $$;

create or replace function public.report_promotion(p_id uuid, p_reason text, p_description text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user(); s public.marketplace_settings := public.settings(); p public.promotions; st text;
begin
  select * into p from public.promotions where id = p_id;
  if not found or p.status in ('draft', 'removed') then raise exception 'Publicação não encontrada.'; end if;
  if p.user_id = uid then raise exception 'Use "Encerrar" ou edite a sua própria publicação.'; end if;
  if (select count(*) from public.promotion_reports where user_id = uid and created_at > now() - interval '24 hours') >= s.daily_report_limit then
    raise exception 'Limite diário de denúncias atingido.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.promotion_reports where promotion_id = p_id and user_id = uid and status = 'open') then
    raise exception 'Você já denunciou esta publicação. A moderação vai analisar.' using errcode = 'P0001';
  end if;
  insert into public.promotion_reports (promotion_id, user_id, reason, description) values (p_id, uid, p_reason, nullif(trim(p_description), ''));
  st := public.recompute_promotion(p_id);
  return jsonb_build_object('status', st);
end $$;

-- ---------------------------------------------------------------------------
-- Estabelecimentos sugeridos pelos usuários
-- ---------------------------------------------------------------------------
create or replace function public.suggest_store(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user(); s public.marketplace_settings := public.settings();
  market public.supermarkets; existing uuid; loc_id uuid; norm text := public.normalize_text(p ->> 'name');
  lat double precision := (p ->> 'latitude')::float8; lng double precision := (p ->> 'longitude')::float8;
begin
  if not public.is_admin() and (select count(*) from public.supermarket_locations where created_by = uid and created_at > now() - interval '24 hours') >= s.daily_store_suggestion_limit then
    raise exception 'Limite diário de sugestões de estabelecimento atingido.' using errcode = 'P0001';
  end if;
  if lat is null or lng is null then raise exception 'Informe a localização do estabelecimento.'; end if;
  if nullif(p ->> 'cnpj', '') is not null and not public.is_valid_cnpj(p ->> 'cnpj') then raise exception 'CNPJ inválido.'; end if;

  select * into market from public.supermarkets where normalized_name = norm and status <> 'rejected';
  if not found then
    insert into public.supermarkets (name, normalized_name, cnpj, status, created_by)
    values (trim(p ->> 'name'), norm, nullif(regexp_replace(coalesce(p ->> 'cnpj', ''), '\D', '', 'g'), ''), 'pending', uid)
    returning * into market;
  end if;

  -- Evita duplicar a mesma unidade: outra unidade da mesma rede a menos de 150 m.
  select l.id into existing from public.supermarket_locations l
  where l.supermarket_id = market.id and l.status <> 'rejected' and public.distance_m(l.latitude, l.longitude, lat, lng) < 150 limit 1;
  if existing is not null then return jsonb_build_object('location_id', existing, 'existing', true); end if;

  insert into public.supermarket_locations (supermarket_id, address, neighborhood, city, state, latitude, longitude, status, created_by)
  values (market.id, trim(p ->> 'address'), nullif(trim(p ->> 'neighborhood'), ''), trim(p ->> 'city'), upper(p ->> 'state'), lat, lng, 'pending', uid)
  returning id into loc_id;
  return jsonb_build_object('location_id', loc_id, 'existing', false, 'status', 'pending');
end $$;

-- ---------------------------------------------------------------------------
-- Consultas públicas (campos seguros apenas)
-- ---------------------------------------------------------------------------
create or replace function public.promotion_is_visible(p public.promotions)
returns boolean language sql stable set search_path = '' as $$
  select p.status in ('published', 'partially_verified', 'community_confirmed', 'contested') and p.expires_at > now();
$$;

create or replace function public.list_store_locations(p_query text default null, p_city text default null, p_state text default null,
  p_latitude double precision default null, p_longitude double precision default null, p_limit integer default 30)
returns table (location_id uuid, supermarket_id uuid, name text, logo_url text, address text, neighborhood text, city text, state text,
  latitude double precision, longitude double precision, status text, distance_km double precision, mine boolean)
language sql stable security definer set search_path = '' as $$
  select l.id, m.id, m.name, m.logo_url, l.address, l.neighborhood, l.city, l.state, l.latitude, l.longitude,
         case when l.status = 'approved' and m.status = 'approved' then 'approved' else 'pending' end,
         case when p_latitude is null then null else round((public.distance_m(p_latitude, p_longitude, l.latitude, l.longitude) / 1000)::numeric, 2)::float8 end,
         l.created_by = auth.uid()
  from public.supermarket_locations l join public.supermarkets m on m.id = l.supermarket_id
  where l.status <> 'rejected' and m.status <> 'rejected'
    and ((l.status = 'approved' and m.status = 'approved') or l.created_by = auth.uid() or public.is_admin())
    and (p_query is null or public.normalize_text(m.name || ' ' || l.address || ' ' || coalesce(l.neighborhood, '')) like '%' || public.normalize_text(p_query) || '%')
    and (p_city is null or public.normalize_text(l.city) = public.normalize_text(p_city))
    and (p_state is null or l.state = upper(p_state))
  order by case when p_latitude is null then 0 else public.distance_m(p_latitude, p_longitude, l.latitude, l.longitude) end, m.name
  limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.search_promotions(
  p_city text default null, p_state text default null, p_category text default null, p_supermarket_id uuid default null,
  p_location_id uuid default null, p_min_price_cents integer default null, p_max_price_cents integer default null, p_query text default null,
  p_latitude double precision default null, p_longitude double precision default null, p_max_km double precision default null,
  p_sort text default 'recent', p_limit integer default 30, p_offset integer default 0)
returns table (id uuid, product_name text, brand text, category text, package_label text, promotional_price_cents integer, regular_price_cents integer,
  sale_unit text, min_quantity integer, condition_types text[], starts_on date, ends_on date, created_at timestamptz, status text,
  location_compatible boolean, photo_verified boolean, community_confirmed boolean, moderator_verified boolean, independent_confirmations integer,
  location_id uuid, supermarket_id uuid, supermarket_name text, logo_url text, address text, neighborhood text, city text, state text,
  store_latitude double precision, store_longitude double precision, distance_km double precision, cover_image_path text, favorited boolean)
language sql stable security definer set search_path = '' as $$
  with base as (
    select p.*, l.supermarket_id, m.name as market_name, m.logo_url, l.address, l.neighborhood, l.city, l.state, l.latitude as lat, l.longitude as lng,
      case when p_latitude is null or p_longitude is null then null else public.distance_m(p_latitude, p_longitude, l.latitude, l.longitude) / 1000 end as dist
    from public.promotions p
    join public.supermarket_locations l on l.id = p.location_id
    join public.supermarkets m on m.id = l.supermarket_id
    where p.status in ('published', 'partially_verified', 'community_confirmed', 'contested') and p.expires_at > now()
      and (p_city is null or public.normalize_text(l.city) = public.normalize_text(p_city))
      and (p_state is null or l.state = upper(p_state))
      and (p_category is null or p.category = p_category)
      and (p_supermarket_id is null or l.supermarket_id = p_supermarket_id)
      and (p_location_id is null or l.id = p_location_id)
      and (p_min_price_cents is null or p.promotional_price_cents >= p_min_price_cents)
      and (p_max_price_cents is null or p.promotional_price_cents <= p_max_price_cents)
      and (p_query is null or p.normalized_product like '%' || public.normalize_text(p_query) || '%' or public.normalize_text(m.name) like '%' || public.normalize_text(p_query) || '%')
  )
  select b.id, b.product_name, b.brand, b.category, b.package_label, b.promotional_price_cents, b.regular_price_cents, b.sale_unit, b.min_quantity,
    b.condition_types, b.starts_on, b.ends_on, b.created_at, b.status,
    b.location_status = 'compatible', b.photo_status = 'accepted', b.status = 'community_confirmed', b.moderation_status = 'approved', b.independent_confirmations,
    b.location_id, b.supermarket_id, b.market_name, b.logo_url, b.address, b.neighborhood, b.city, b.state, b.lat, b.lng,
    round(b.dist::numeric, 2)::float8,
    (select i.storage_path from public.promotion_images i where i.promotion_id = b.id
      order by case i.image_type when 'price_tag' then 0 when 'promo_sign' then 1 when 'store_ad' then 2 else 3 end, i.created_at limit 1),
    exists (select 1 from public.promotion_favorites f where f.promotion_id = b.id and f.user_id = auth.uid())
  from base b
  where p_max_km is null or (b.dist is not null and b.dist <= p_max_km)
  order by
    case when p_sort = 'price' then b.promotional_price_cents end asc,
    case when p_sort = 'distance' then b.dist end asc nulls last,
    b.created_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

create or replace function public.map_store_offers(p_city text default null, p_state text default null, p_category text default null,
  p_latitude double precision default null, p_longitude double precision default null, p_max_km double precision default null)
returns table (location_id uuid, supermarket_name text, logo_url text, address text, neighborhood text, city text, state text,
  latitude double precision, longitude double precision, active_offers integer, top_offers jsonb)
language sql stable security definer set search_path = '' as $$
  select l.id, m.name, m.logo_url, l.address, l.neighborhood, l.city, l.state, l.latitude, l.longitude, count(p.id)::int,
    (select jsonb_agg(t) from (
       select p2.id, p2.product_name, p2.promotional_price_cents, p2.sale_unit from public.promotions p2
       where p2.location_id = l.id and p2.status in ('published', 'partially_verified', 'community_confirmed', 'contested') and p2.expires_at > now()
         and (p_category is null or p2.category = p_category)
       order by p2.independent_confirmations desc, p2.created_at desc limit 3) t)
  from public.supermarket_locations l
  join public.supermarkets m on m.id = l.supermarket_id
  join public.promotions p on p.location_id = l.id
  where p.status in ('published', 'partially_verified', 'community_confirmed', 'contested') and p.expires_at > now()
    and (p_category is null or p.category = p_category)
    and (p_city is null or public.normalize_text(l.city) = public.normalize_text(p_city))
    and (p_state is null or l.state = upper(p_state))
    and (p_max_km is null or p_latitude is null or public.distance_m(p_latitude, p_longitude, l.latitude, l.longitude) / 1000 <= p_max_km)
  group by l.id, m.id
  limit 500;
$$;

create or replace function public.marketplace_cities()
returns table (city text, state text, active_offers integer)
language sql stable security definer set search_path = '' as $$
  select min(l.city), l.state, count(p.id)::int
  from public.supermarket_locations l join public.promotions p on p.location_id = l.id
  where l.status = 'approved' and p.status in ('published', 'partially_verified', 'community_confirmed', 'contested') and p.expires_at > now()
  group by public.normalize_text(l.city), l.state order by 3 desc limit 200;
$$;

create or replace function public.get_promotion(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.promotions; mine boolean; admin boolean := public.is_admin(); res jsonb; author_level text;
begin
  select * into p from public.promotions where id = p_id;
  if not found then return null; end if;
  mine := p.user_id = auth.uid();
  if not (public.promotion_is_visible(p) or mine or admin) then return null; end if;
  select r.level into author_level from public.user_reputation(p.user_id) r;
  select jsonb_build_object(
    'id', p.id, 'product_name', p.product_name, 'brand', p.brand, 'category', p.category, 'package_label', p.package_label,
    'product_type', p.product_type, 'barcode', p.barcode, 'description', p.description,
    'promotional_price_cents', p.promotional_price_cents, 'regular_price_cents', p.regular_price_cents, 'sale_unit', p.sale_unit,
    'min_quantity', p.min_quantity, 'condition_types', p.condition_types, 'conditions', p.conditions,
    'starts_on', p.starts_on, 'ends_on', p.ends_on, 'expires_at', p.expires_at, 'created_at', p.created_at, 'status', p.status,
    'location_status', p.location_status, 'photo_status', p.photo_status, 'moderation_status', p.moderation_status,
    'location_compatible', p.location_status = 'compatible', 'photo_verified', p.photo_status = 'accepted',
    'community_confirmed', p.status = 'community_confirmed', 'moderator_verified', p.moderation_status = 'approved',
    'independent_confirmations', p.independent_confirmations, 'negative_reports', p.negative_reports, 'open_reports', p.open_reports,
    'author_level', author_level, 'is_mine', mine, 'is_admin', admin,
    'favorited', exists (select 1 from public.promotion_favorites f where f.promotion_id = p.id and f.user_id = auth.uid()),
    'my_confirmation', (select jsonb_build_object('type', c.confirmation_type, 'at', c.created_at) from public.promotion_confirmations c where c.promotion_id = p.id and c.user_id = auth.uid()),
    'store', (select jsonb_build_object('location_id', l.id, 'supermarket_id', m.id, 'name', m.name, 'logo_url', m.logo_url, 'address', l.address,
                'neighborhood', l.neighborhood, 'city', l.city, 'state', l.state, 'latitude', l.latitude, 'longitude', l.longitude,
                'approved', l.status = 'approved' and m.status = 'approved')
              from public.supermarket_locations l join public.supermarkets m on m.id = l.supermarket_id where l.id = p.location_id),
    'images', coalesce((select jsonb_agg(jsonb_build_object('path', i.storage_path, 'type', i.image_type) order by i.created_at) from public.promotion_images i where i.promotion_id = p.id), '[]'),
    'confirmation_summary', (select jsonb_object_agg(t, n) from (select confirmation_type t, count(*) n from public.promotion_confirmations c where c.promotion_id = p.id and c.independent group by 1) x),
    -- Verificação de localização: só distância e precisão, e só para o autor e a moderação.
    'location_check', case when mine or admin then (select jsonb_build_object('distance_m', k.distance_m, 'accuracy_m', k.accuracy_m, 'radius_m', k.radius_m, 'status', k.location_status, 'checked_at', k.checked_at)
                        from public.promotion_location_checks k where k.promotion_id = p.id and k.check_kind = 'publication' order by k.checked_at desc limit 1) end
  ) into res;
  return res;
end $$;

create or replace function public.my_promotions()
returns table (id uuid, product_name text, promotional_price_cents integer, sale_unit text, status text, location_status text, photo_status text,
  moderation_status text, independent_confirmations integer, open_reports integer, ends_on date, created_at timestamptz, supermarket_name text, cover_image_path text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.product_name, p.promotional_price_cents, p.sale_unit, p.status, p.location_status, p.photo_status, p.moderation_status,
    p.independent_confirmations, p.open_reports, p.ends_on, p.created_at, m.name,
    (select i.storage_path from public.promotion_images i where i.promotion_id = p.id order by i.created_at limit 1)
  from public.promotions p join public.supermarket_locations l on l.id = p.location_id join public.supermarkets m on m.id = l.supermarket_id
  where p.user_id = auth.uid() order by p.created_at desc limit 200;
$$;

create or replace function public.my_favorite_promotions()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select f.promotion_id from public.promotion_favorites f join public.promotions p on p.id = f.promotion_id
  where f.user_id = auth.uid() and public.promotion_is_visible(p) order by f.created_at desc;
$$;

create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

-- ---------------------------------------------------------------------------
-- Expiração automática
-- ---------------------------------------------------------------------------
create or replace function public.expire_promotions()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with ex as (
    update public.promotions set status = 'expired'
    where expires_at <= now() and status not in ('expired', 'removed', 'draft') returning id
  ) select count(*) into n from ex;
  -- Aviso para quem favoritou: vence nas próximas 24 h (uma única vez por oferta)
  insert into public.notifications (user_id, kind, promotion_id, title, body)
  select f.user_id, 'expiring_soon', p.id, 'Oferta favorita perto de vencer', format('"%s" vale até %s.', p.product_name, to_char(p.ends_on, 'DD/MM'))
  from public.promotions p join public.promotion_favorites f on f.promotion_id = p.id
  left join public.notification_preferences np on np.user_id = f.user_id
  where p.expiry_notified_at is null and p.expires_at > now() and p.expires_at <= now() + interval '24 hours'
    and p.status in ('published', 'partially_verified', 'community_confirmed', 'contested') and coalesce(np.notify_expiring_favorites, true)
  on conflict (user_id, kind, promotion_id) do nothing;
  update public.promotions set expiry_notified_at = now()
  where expiry_notified_at is null and expires_at > now() and expires_at <= now() + interval '24 hours';
  return n;
end $$;

-- Rascunhos abandonados há mais de 2 dias são apagados (com as fotos referenciadas).
create or replace function public.purge_stale_drafts()
returns integer language sql security definer set search_path = '' as $$
  with d as (delete from public.promotions where submitted_at is null and created_at < now() - interval '2 days' returning id) select count(*)::int from d;
$$;

-- Retenção: ofertas encerradas há mais de 12 meses e removidas há mais de 6 meses são apagadas
-- (com fotos referenciadas, verificações, confirmações e denúncias, em cascata).
create or replace function public.purge_old_promotions()
returns integer language sql security definer set search_path = '' as $$
  with d as (
    delete from public.promotions
    where (status = 'expired' and expires_at < now() - interval '12 months')
       or (status = 'removed' and updated_at < now() - interval '6 months')
    returning id
  ) select count(*)::int from d;
$$;

-- ---------------------------------------------------------------------------
-- Moderação (somente administradores)
-- ---------------------------------------------------------------------------
create or replace function public.require_admin()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Acesso restrito à moderação.' using errcode = '42501'; end if;
  return auth.uid();
end $$;

create or replace function public.admin_moderate_promotion(p_id uuid, p_action text, p_notes text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare admin uuid := public.require_admin(); p public.promotions; st text;
begin
  select * into p from public.promotions where id = p_id for update;
  if not found then raise exception 'Publicação não encontrada.'; end if;
  case p_action
    when 'approve' then update public.promotions set moderation_status = 'approved' where id = p_id;
    when 'accept_photo' then update public.promotions set photo_status = 'accepted' where id = p_id;
    when 'reject_photo' then update public.promotions set photo_status = 'rejected' where id = p_id;
    when 'suspend' then update public.promotions set moderation_status = 'suspended' where id = p_id;
    when 'remove' then update public.promotions set moderation_status = 'removed' where id = p_id;
    when 'restore' then update public.promotions set moderation_status = 'none' where id = p_id;
    else raise exception 'Ação inválida.';
  end case;
  insert into public.moderation_actions (admin_id, target_type, target_id, action, notes) values (admin, 'promotion', p_id, p_action, p_notes);
  st := public.recompute_promotion(p_id);
  update public.promotion_history set changed_by = admin, reason = coalesce(p_notes, p_action)
    where id = (select max(h.id) from public.promotion_history h where h.promotion_id = p_id) and changed_at >= now() - interval '1 second';
  insert into public.notifications (user_id, kind, promotion_id, title, body)
  values (p.user_id, 'moderation_update', p_id, 'Atualização sobre sua publicação',
          format('A moderação analisou "%s": %s.', p.product_name,
            case p_action when 'approve' then 'aprovada' when 'accept_photo' then 'foto aceita como comprovação' when 'reject_photo' then 'foto não aceita como comprovação'
              when 'suspend' then 'suspensa para revisão' when 'remove' then 'removida' else 'restaurada' end))
  on conflict (user_id, kind, promotion_id) do update set title = excluded.title, body = excluded.body, read_at = null, push_sent_at = null, created_at = now();
  return st;
end $$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_upheld boolean, p_notes text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare admin uuid := public.require_admin(); r public.promotion_reports;
begin
  update public.promotion_reports set status = case when p_upheld then 'upheld' else 'rejected' end, resolved_by = admin, resolution_notes = p_notes, resolved_at = now()
  where id = p_report_id and status = 'open' returning * into r;
  if not found then raise exception 'Denúncia não encontrada ou já resolvida.'; end if;
  insert into public.moderation_actions (admin_id, target_type, target_id, action, notes) values (admin, 'report', p_report_id, case when p_upheld then 'uphold' else 'reject' end, p_notes);
  return public.recompute_promotion(r.promotion_id);
end $$;

create or replace function public.admin_review_location(p_location_id uuid, p_approve boolean, p_radius_m integer default null, p_logo_url text default null, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare admin uuid := public.require_admin(); l public.supermarket_locations; pid uuid;
begin
  update public.supermarket_locations set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = admin,
    radius_m = coalesce(p_radius_m, radius_m)
  where id = p_location_id returning * into l;
  if not found then raise exception 'Unidade não encontrada.'; end if;
  if p_approve then
    update public.supermarkets set status = 'approved', reviewed_by = admin, logo_url = coalesce(p_logo_url, logo_url) where id = l.supermarket_id;
  end if;
  insert into public.moderation_actions (admin_id, target_type, target_id, action, notes) values (admin, 'location', p_location_id, case when p_approve then 'approve' else 'reject' end, p_notes);
  for pid in select id from public.promotions where location_id = p_location_id loop perform public.recompute_promotion(pid); end loop;
end $$;

create or replace function public.admin_set_user_ban(p_user uuid, p_until timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare admin uuid := public.require_admin();
begin
  if p_user = admin then raise exception 'Você não pode suspender a própria conta.'; end if;
  update public.profiles set banned_until = p_until, ban_reason = p_reason where id = p_user;
  insert into public.moderation_actions (admin_id, target_type, target_id, action, notes)
  values (admin, 'user', p_user, case when p_until is null or p_until <= now() then 'unban' else 'ban' end, p_reason);
end $$;

create or replace function public.admin_queue()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'reports', coalesce((select jsonb_agg(x order by x.created_at) from (
        select r.id, r.promotion_id, r.reason, r.description, r.created_at, p.product_name, m.name as store
        from public.promotion_reports r join public.promotions p on p.id = r.promotion_id
        join public.supermarket_locations l on l.id = p.location_id join public.supermarkets m on m.id = l.supermarket_id
        where r.status = 'open' limit 200) x), '[]'),
    'pending_promotions', coalesce((select jsonb_agg(x order by x.created_at) from (
        select p.id, p.product_name, p.status, p.location_status, p.photo_status, p.created_at, m.name as store
        from public.promotions p join public.supermarket_locations l on l.id = p.location_id join public.supermarkets m on m.id = l.supermarket_id
        where p.status in ('pending_review', 'contested') or (p.photo_status = 'pending' and p.status in ('published', 'partially_verified')) limit 200) x), '[]'),
    'pending_locations', coalesce((select jsonb_agg(x order by x.created_at) from (
        select l.id, m.name, m.cnpj, l.address, l.neighborhood, l.city, l.state, l.latitude, l.longitude, l.created_at,
          (select count(*) from public.supermarket_locations o where o.status = 'approved' and public.distance_m(o.latitude, o.longitude, l.latitude, l.longitude) < 300) as nearby_approved
        from public.supermarket_locations l join public.supermarkets m on m.id = l.supermarket_id where l.status = 'pending' limit 200) x), '[]')
  );
end $$;

-- Histórico completo para a moderação, sem coordenadas (elas não existem no banco).
create or replace function public.admin_promotion_audit(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid;
begin
  perform public.require_admin();
  select user_id into uid from public.promotions where id = p_id;
  return jsonb_build_object(
    'author', (select jsonb_build_object('user_id', uid, 'banned_until', pr.banned_until) || to_jsonb(r) from public.user_reputation(uid) r, public.profiles pr where pr.id = uid),
    'location_checks', coalesce((select jsonb_agg(to_jsonb(k) - 'user_id' order by k.checked_at) from public.promotion_location_checks k where k.promotion_id = p_id), '[]'),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.changed_at) from public.promotion_history h where h.promotion_id = p_id), '[]'),
    'reports', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id' order by r.created_at) from public.promotion_reports r where r.promotion_id = p_id), '[]'),
    'confirmations', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' order by c.created_at) from public.promotion_confirmations c where c.promotion_id = p_id), '[]'),
    'actions', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.moderation_actions a where a.target_type = 'promotion' and a.target_id = p_id), '[]')
  );
end $$;

create or replace function public.admin_log(p_limit integer default 100)
returns setof public.moderation_actions language sql stable security definer set search_path = '' as $$
  select a.* from public.moderation_actions a where public.is_admin() order by a.created_at desc limit least(p_limit, 500);
$$;

-- ---------------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------------
alter table public.marketplace_settings enable row level security;
alter table public.app_admins enable row level security;
alter table public.supermarkets enable row level security;
alter table public.supermarket_locations enable row level security;
alter table public.promotions enable row level security;
alter table public.promotion_images enable row level security;
alter table public.promotion_location_checks enable row level security;
alter table public.promotion_confirmations enable row level security;
alter table public.promotion_reports enable row level security;
alter table public.promotion_favorites enable row level security;
alter table public.promotion_history enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notifications enable row level security;

-- Leitura direta: apenas o que é do próprio usuário (ou moderação). O público usa as funções acima.
create policy promotions_select_own on public.promotions for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy promotion_images_select_own on public.promotion_images for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy confirmations_select_own on public.promotion_confirmations for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy reports_select_own on public.promotion_reports for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy location_checks_admin on public.promotion_location_checks for select to authenticated using (public.is_admin());
create policy history_admin on public.promotion_history for select to authenticated using (public.is_admin());
create policy moderation_admin on public.moderation_actions for select to authenticated using (public.is_admin());
create policy supermarkets_read on public.supermarkets for select to anon, authenticated using (status = 'approved' or public.is_admin());
create policy locations_read on public.supermarket_locations for select to anon, authenticated using (status = 'approved' or created_by = (select auth.uid()) or public.is_admin());
create policy settings_read on public.marketplace_settings for select to anon, authenticated using (true);
create policy settings_admin on public.marketplace_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admins_self on public.app_admins for select to authenticated using (user_id = (select auth.uid()));

create policy favorites_own on public.promotion_favorites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy prefs_own on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));

grant select on public.promotions, public.promotion_images, public.promotion_confirmations, public.promotion_reports,
  public.promotion_location_checks, public.promotion_history, public.moderation_actions, public.app_admins to authenticated;
grant select on public.supermarkets, public.supermarket_locations, public.marketplace_settings to anon, authenticated;
grant update on public.marketplace_settings to authenticated;
grant select, insert, delete on public.promotion_favorites to authenticated;
grant select, insert, update, delete on public.notification_preferences, public.push_tokens to authenticated;
grant select on public.notifications to authenticated;

-- Funções: revoga o padrão (PUBLIC) e libera só o necessário.
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'is_admin','settings','require_active_user','distance_m','normalize_text','is_valid_cnpj','touch_updated_at','promotion_status_history',
             'notify','user_reputation','my_reputation','recompute_promotion','fan_out_new_promotion','evaluate_location','create_promotion',
             'find_similar_promotions','add_promotion_image','submit_promotion','update_my_promotion','end_my_promotion','delete_my_draft',
             'confirm_promotion','report_promotion','suggest_store','promotion_is_visible','list_store_locations','search_promotions',
             'map_store_offers','marketplace_cities','get_promotion','my_promotions','my_favorite_promotions','mark_notifications_read',
             'expire_promotions','purge_stale_drafts','purge_old_promotions','require_admin','admin_moderate_promotion','admin_resolve_report','admin_review_location',
             'admin_set_user_ban','admin_queue','admin_promotion_audit','admin_log')
  loop
    execute format('revoke all on function %s from public', f);
  end loop;
end $$;

grant execute on function public.list_store_locations(text, text, text, double precision, double precision, integer),
  public.search_promotions(text, text, text, uuid, uuid, integer, integer, text, double precision, double precision, double precision, text, integer, integer),
  public.map_store_offers(text, text, text, double precision, double precision, double precision),
  public.marketplace_cities(), public.get_promotion(uuid), public.is_admin(), public.distance_m(double precision, double precision, double precision, double precision)
  to anon, authenticated;
grant execute on function public.create_promotion(jsonb), public.find_similar_promotions(uuid, text, text, text),
  public.add_promotion_image(uuid, text, text), public.submit_promotion(uuid), public.update_my_promotion(uuid, text, text, date),
  public.end_my_promotion(uuid), public.delete_my_draft(uuid),
  public.confirm_promotion(uuid, text, integer, text, double precision, double precision, double precision, timestamptz),
  public.report_promotion(uuid, text, text), public.suggest_store(jsonb), public.my_promotions(), public.my_favorite_promotions(),
  public.my_reputation(), public.mark_notifications_read(bigint[]),
  public.admin_moderate_promotion(uuid, text, text), public.admin_resolve_report(uuid, boolean, text),
  public.admin_review_location(uuid, boolean, integer, text, text), public.admin_set_user_ban(uuid, timestamptz, text),
  public.admin_queue(), public.admin_promotion_audit(uuid), public.admin_log(integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Armazenamento das fotos (bucket privado; leitura liberada só para fotos de ofertas visíveis)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('promotion-images', 'promotion-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.promotion_image_readable(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.promotion_images i join public.promotions p on p.id = i.promotion_id
    where i.storage_path = p_path and (public.promotion_is_visible(p) or p.user_id = auth.uid() or public.is_admin())
  ) or exists (
    select 1 from public.promotion_confirmations c where c.evidence_image_path = p_path and (c.user_id = auth.uid() or public.is_admin())
  );
$$;
revoke all on function public.promotion_image_readable(text) from public;
grant execute on function public.promotion_image_readable(text) to anon, authenticated;

-- Envio: p/<promoção própria em rascunho ou ativa>/arquivo  ou  c/<promoção ativa>/arquivo (evidência de confirmação).
create or replace function public.can_upload_promotion_image(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/'); pid uuid; uid uuid := auth.uid(); banned timestamptz;
begin
  if uid is null or array_length(parts, 1) <> 3 or parts[1] not in ('p', 'c') then return false; end if;
  select pr.banned_until into banned from public.profiles pr where pr.id = uid;
  if banned is not null and banned > now() then return false; end if;
  begin pid := parts[2]::uuid; exception when others then return false; end;
  if parts[1] = 'p' then
    return exists (select 1 from public.promotions p where p.id = pid and p.user_id = uid and p.status not in ('removed', 'expired'));
  end if;
  return exists (select 1 from public.promotions p where p.id = pid and public.promotion_is_visible(p));
end $$;
revoke all on function public.can_upload_promotion_image(text) from public;
grant execute on function public.can_upload_promotion_image(text) to authenticated;

create policy promotion_images_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'promotion-images' and public.can_upload_promotion_image(name));
create policy promotion_images_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'promotion-images' and (owner = (select auth.uid()) or public.promotion_image_readable(name)));
create policy promotion_images_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'promotion-images' and owner = (select auth.uid())
         and not exists (select 1 from public.promotion_images i join public.promotions p on p.id = i.promotion_id
                         where i.storage_path = name and p.submitted_at is not null));

-- ---------------------------------------------------------------------------
-- Tarefas periódicas (pg_cron, quando disponível no projeto)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('confere-expire-promotions', '*/15 * * * *', 'select public.expire_promotions()');
    perform cron.schedule('confere-purge-drafts', '17 4 * * *', 'select public.purge_stale_drafts()');
    perform cron.schedule('confere-purge-old-promotions', '29 4 1 * *', 'select public.purge_old_promotions()');
  end if;
exception when others then
  raise notice 'pg_cron indisponível (%). Agende public.expire_promotions() de outra forma.', sqlerrm;
end $$;
