-- Meu Carrin — planos e assinatura.
--
-- Quem manda no plano é a Stripe. Esta tabela é um espelho: só o webhook, com a chave de
-- serviço, escreve nela. O aplicativo lê a própria linha e nada mais — não há política de
-- inserção, alteração ou remoção para `authenticated`, de propósito: ninguém vira assinante
-- mexendo no aplicativo.
--
-- Os limites de leitura automática ficam em `plan_limits`, uma tabela, não código: mudar a
-- cota é um `update`, sem publicar app nem função. A cota é mensal, pelo mês civil no fuso
-- de Brasília, e vale para as leituras por inteligência artificial (etiqueta, foto do produto
-- e cupom), que são o que tem custo por imagem. O resto do aplicativo não tem limite.

-- ---------------------------------------------------------------------------
-- Limites por plano
-- ---------------------------------------------------------------------------
-- bucket: 'etiqueta' (fotos de etiqueta e de produto), 'cupom' (cupom fiscal) ou 'total'
-- (qualquer leitura). Quando o plano tem mais de uma linha aplicável, vale a mais apertada.
-- Plano sem nenhuma linha é plano sem limite.
create table public.plan_limits (
  plan text not null check (plan in ('gratis', 'mais')),
  bucket text not null check (bucket in ('etiqueta', 'cupom', 'total')),
  monthly_limit integer not null check (monthly_limit >= 0),
  primary key (plan, bucket)
);

insert into public.plan_limits (plan, bucket, monthly_limit) values
  ('gratis', 'etiqueta', 20),
  ('gratis', 'cupom', 4),
  ('mais', 'total', 300)
on conflict (plan, bucket) do nothing;

alter table public.plan_limits enable row level security;
-- Os limites são informação pública: a landing e a tela de planos mostram os dois.
create policy plan_limits_read on public.plan_limits for select to authenticated, anon using (true);
grant select on table public.plan_limits to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Assinaturas (espelho da Stripe)
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  plan text not null default 'gratis' check (plan in ('gratis', 'mais')),
  -- Os mesmos nomes que a Stripe usa, para o espelho não inventar vocabulário.
  status text not null default 'none' check (status in (
    'none', 'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused')),
  price_lookup_key text check (price_lookup_key is null or length(price_lookup_key) <= 80),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on table public.subscriptions to authenticated;
revoke all on table public.subscriptions from anon;

-- O webhook não precisa lembrar de atualizar updated_at.
create or replace function public.subscriptions_touch()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.subscriptions_touch();

-- ---------------------------------------------------------------------------
-- Plano vigente e cota
-- ---------------------------------------------------------------------------
-- Início do mês civil em Brasília, devolvido em UTC. É a janela da cota.
create or replace function public.month_start()
returns timestamptz language sql stable set search_path = '' as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
$$;

-- Plano que vale agora. 'past_due' continua valendo por três dias depois do fim do período:
-- a Stripe ainda está tentando o cartão, e cortar a leitura no primeiro tropeço castigaria
-- quem só trocou de cartão. Vencido isso, volta a ser 'gratis'.
create or replace function public.plan_of(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when s.status in ('active', 'trialing') then s.plan
      when s.status = 'past_due'
        and (s.current_period_end is null or s.current_period_end + interval '3 days' > now()) then s.plan
      else 'gratis'
    end
    from public.subscriptions s
    where s.user_id = p_user), 'gratis');
$$;

-- Quanto ainda cabe de leitura automática neste mês, para o tipo pedido.
-- monthly_limit e remaining nulos significam "sem limite".
create or replace function public.ocr_allowance(p_kind text)
returns table (plan text, bucket text, monthly_limit integer, used integer, remaining integer, resets_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_bucket text;
  v_inicio timestamptz := public.month_start();
  v_fim timestamptz := public.month_start() + interval '1 month';
  v_usado integer;
  r record;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_plan := public.plan_of(v_user);
  v_bucket := case
    when p_kind = 'receipt' then 'cupom'
    when p_kind in ('label', 'product') then 'etiqueta'
  end;
  if v_bucket is null then
    raise exception 'tipo de leitura inválido: %', p_kind using errcode = '22023';
  end if;

  plan := v_plan;
  bucket := v_bucket;
  monthly_limit := null;
  used := 0;
  remaining := null;
  resets_at := v_fim;

  for r in
    select l.bucket as b, l.monthly_limit as lim
    from public.plan_limits l
    where l.plan = v_plan and l.bucket in (v_bucket, 'total')
  loop
    select count(*) into v_usado
    from public.ocr_usage u
    where u.user_id = v_user
      and u.created_at >= v_inicio
      and u.created_at < v_fim
      and (r.b = 'total'
        or (r.b = 'cupom' and u.kind = 'receipt')
        or (r.b = 'etiqueta' and u.kind in ('label', 'product')));
    -- Entre as linhas aplicáveis, vale a que deixa menos espaço.
    if remaining is null or r.lim - v_usado < remaining then
      bucket := r.b;
      monthly_limit := r.lim;
      used := v_usado;
      remaining := greatest(r.lim - v_usado, 0);
    end if;
  end loop;

  return next;
end $$;

-- O que a tela de planos mostra: plano, situação da cobrança e uso do mês nos dois baldes.
create or replace function public.my_plan()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  s record;
  e record;
  c record;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select status, current_period_end, cancel_at_period_end, price_lookup_key
    into s from public.subscriptions where user_id = v_user;
  select * into e from public.ocr_allowance('label');
  select * into c from public.ocr_allowance('receipt');
  return jsonb_build_object(
    'plano', public.plan_of(v_user),
    'status', coalesce(s.status, 'none'),
    'renova_em', s.current_period_end,
    'cancela_no_fim', coalesce(s.cancel_at_period_end, false),
    'preco', s.price_lookup_key,
    'etiqueta', jsonb_build_object('limite', e.monthly_limit, 'usado', e.used, 'resta', e.remaining),
    'cupom', jsonb_build_object('limite', c.monthly_limit, 'usado', c.used, 'resta', c.remaining),
    'zera_em', e.resets_at);
end $$;

revoke all on function public.month_start() from public, anon;
revoke all on function public.plan_of(uuid) from public, anon;
revoke all on function public.ocr_allowance(text) from public, anon;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.month_start() to authenticated;
grant execute on function public.ocr_allowance(text) to authenticated;
grant execute on function public.my_plan() to authenticated;
