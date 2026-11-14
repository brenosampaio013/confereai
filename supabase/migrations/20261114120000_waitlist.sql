-- Meu Carrin — lista de espera do plano pago, usada pela landing page.
--
-- O formulário da landing é anônimo: qualquer visitante pode enviar um e-mail, mas
-- ninguém pode ler a lista. A tabela não tem política RLS (portanto nenhum acesso
-- direto por anon/authenticated) e a gravação acontece só pela função abaixo, que
-- valida o endereço e ignora repetições. A leitura é feita pelo painel do Supabase,
-- com a chave de serviço.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  origem text not null default 'landing',
  created_at timestamptz not null default now(),
  constraint waitlist_email_formato check (email = lower(email) and length(email) between 6 and 254),
  constraint waitlist_origem_tamanho check (length(origem) between 1 and 40)
);

create unique index if not exists waitlist_email_unico on public.waitlist (email);

alter table public.waitlist enable row level security;
revoke all on table public.waitlist from anon, authenticated;

create or replace function public.join_waitlist(p_email text, p_origem text default 'landing')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_origem text := nullif(trim(coalesce(p_origem, '')), '');
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' or length(v_email) > 254 then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;
  insert into public.waitlist (email, origem)
  values (v_email, left(coalesce(v_origem, 'landing'), 40))
  on conflict (email) do nothing;
end;
$$;

revoke all on function public.join_waitlist(text, text) from public;
grant execute on function public.join_waitlist(text, text) to anon, authenticated;
