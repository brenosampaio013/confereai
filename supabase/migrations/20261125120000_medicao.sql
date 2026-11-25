-- Meu Carrin — medição do funil (decisão 5 da reformulação 2.0).
--
-- Só contagem de eventos. A tabela não tem coluna para quem fez a ação: nada de id de usuário,
-- e-mail, IP, aparelho ou de onde a pessoa veio. O app e o site gravam por uma única porta, a
-- função `registrar_evento`, que aceita uma lista fechada de eventos e de dados (palavras curtas
-- em minúsculas, sem espaço, arroba ou número longo — não cabe nome, e-mail nem telefone).
--
-- Eventos de assinatura (concluída, cancelada) não passam por essa porta: só o webhook da
-- Stripe, com a chave de serviço, grava esses — ele é a fonte confiável. A coluna `ref` evita
-- contar duas vezes o mesmo aviso, que a Stripe pode reenviar.
--
-- Ninguém lê, altera ou apaga pelo app ou pelo site. A leitura é pelo painel do Supabase.

create table public.analytics_events (
  id bigint generated always as identity primary key,
  event text not null check (event in (
    'page_view', 'signup_started', 'signup_completed', 'app_first_use', 'pricing_viewed',
    'checkout_started', 'subscription_completed', 'subscription_canceled', 'free_limit_reached',
    'upgrade_clicked')),
  source text not null check (source in ('site', 'app', 'servidor')),
  props jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 512),
  ref text unique check (ref is null or source = 'servidor'),
  created_at timestamptz not null default now()
);

comment on table public.analytics_events is
  'Contagem de eventos do funil, sem dado pessoal. Escrita: registrar_evento (app e site) e o webhook da Stripe (assinaturas).';

create index analytics_events_event_created_at on public.analytics_events (event, created_at);

-- Sem política nenhuma: com a RLS ligada, quem não for a chave de serviço não vê nem escreve.
alter table public.analytics_events enable row level security;
revoke all on table public.analytics_events from anon, authenticated;

create function public.registrar_evento(p_evento text, p_origem text, p_dados jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dados jsonb := coalesce(p_dados, '{}'::jsonb);
  chave text;
  valor jsonb;
  texto text;
  valido boolean;
begin
  if p_origem is null or p_origem not in ('site', 'app') then
    raise exception 'origem inválida';
  end if;
  -- Os eventos de assinatura ficam de fora: só o webhook grava esses.
  if p_evento is null or p_evento not in (
    'page_view', 'signup_started', 'signup_completed', 'app_first_use', 'pricing_viewed',
    'checkout_started', 'free_limit_reached', 'upgrade_clicked') then
    raise exception 'evento inválido';
  end if;
  if jsonb_typeof(dados) <> 'object' then
    raise exception 'dados inválidos';
  end if;

  for chave, valor in select * from jsonb_each(dados) loop
    if chave not in ('pagina', 'plano', 'periodo', 'tipo', 'lugar') then
      raise exception 'dado não permitido: %', chave;
    end if;
    if jsonb_typeof(valor) <> 'string' then
      raise exception 'valor inválido em %', chave;
    end if;
    texto := valor #>> '{}';
    valido := case chave
      when 'pagina' then texto ~ '^/[a-z0-9/_-]*$'
      when 'plano' then texto in ('mais', 'ia')
      when 'periodo' then texto in ('mensal', 'anual')
      when 'tipo' then texto in ('etiqueta', 'cupom', 'produto', 'voz')
      else texto ~ '^[a-z0-9_-]{1,40}$'
    end;
    if not valido or length(texto) > 60 or texto ~ '[0-9]{6,}' then
      raise exception 'valor inválido em %', chave;
    end if;
  end loop;

  insert into public.analytics_events (event, source, props) values (p_evento, p_origem, dados);
end;
$$;

comment on function public.registrar_evento(text, text, jsonb) is
  'Única porta de escrita do app e do site na medição do funil. Lista fechada de eventos e de dados.';

revoke all on function public.registrar_evento(text, text, jsonb) from public;
grant execute on function public.registrar_evento(text, text, jsonb) to anon, authenticated;
