-- Meu Carrin — plano "Meu Carrin IA" e o assistente de voz.
--
-- O que ele acrescenta: falar com o assistente, que escuta o pedido e sugere itens para o
-- carrinho. A pessoa confirma antes de qualquer item entrar — a IA sugere, nunca decide.
--
-- A conversa tem custo por minuto de áudio, então entra no mesmo caderno de uso da leitura por
-- foto (`ocr_usage`, agora com o tipo 'voice') e ganha um balde próprio, 'voz'. Nos planos que
-- não incluem o assistente o balde é zero — e zero é o que a trava do servidor lê, sem precisar
-- de nenhuma regra escrita em código sobre "quem pode".

alter table public.ocr_usage drop constraint ocr_usage_kind_check;
alter table public.ocr_usage add constraint ocr_usage_kind_check
  check (kind in ('receipt', 'label', 'product', 'voice'));

alter table public.plan_limits drop constraint plan_limits_plan_check;
alter table public.plan_limits add constraint plan_limits_plan_check
  check (plan in ('gratis', 'mais', 'ia'));
alter table public.plan_limits drop constraint plan_limits_bucket_check;
alter table public.plan_limits add constraint plan_limits_bucket_check
  check (bucket in ('etiqueta', 'cupom', 'voz', 'total'));

alter table public.subscriptions drop constraint subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan in ('gratis', 'mais', 'ia'));

insert into public.plan_limits (plan, bucket, monthly_limit) values
  -- Sem assistente nos dois planos de baixo: o balde zerado é a própria trava.
  ('gratis', 'voz', 0),
  ('mais', 'voz', 0),
  -- O plano de cima: o dobro das leituras do Mais, mais as conversas.
  ('ia', 'total', 600),
  ('ia', 'voz', 150)
on conflict (plan, bucket) do nothing;

-- O tipo 'voice' passa a ter balde próprio; o resto da função continua igual.
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
    when p_kind = 'voice' then 'voz'
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
        or (r.b = 'voz' and u.kind = 'voice')
        or (r.b = 'etiqueta' and u.kind in ('label', 'product')));
    if remaining is null or r.lim - v_usado < remaining then
      bucket := r.b;
      monthly_limit := r.lim;
      used := v_usado;
      remaining := greatest(r.lim - v_usado, 0);
    end if;
  end loop;

  return next;
end $$;

-- A tela de planos passa a mostrar também o uso do assistente.
create or replace function public.my_plan()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  s record;
  e record;
  c record;
  v record;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select status, current_period_end, cancel_at_period_end, price_lookup_key
    into s from public.subscriptions where user_id = v_user;
  select * into e from public.ocr_allowance('label');
  select * into c from public.ocr_allowance('receipt');
  select * into v from public.ocr_allowance('voice');
  return jsonb_build_object(
    'plano', public.plan_of(v_user),
    'status', coalesce(s.status, 'none'),
    'renova_em', s.current_period_end,
    'cancela_no_fim', coalesce(s.cancel_at_period_end, false),
    'preco', s.price_lookup_key,
    'etiqueta', jsonb_build_object('limite', e.monthly_limit, 'usado', e.used, 'resta', e.remaining),
    'cupom', jsonb_build_object('limite', c.monthly_limit, 'usado', c.used, 'resta', c.remaining),
    'voz', jsonb_build_object('limite', v.monthly_limit, 'usado', v.used, 'resta', v.remaining),
    'zera_em', e.resets_at);
end $$;

revoke all on function public.ocr_allowance(text) from public, anon;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.ocr_allowance(text) to authenticated;
grant execute on function public.my_plan() to authenticated;
