-- Meu Carrin — tira privilégios que nenhuma tela usa.
--
-- Projeto Supabase novo vem com um privilégio padrão no schema `public` que concede TUDO
-- (`arwdDxtm`) a `anon` e a `authenticated` em cada tabela criada — inclusive TRUNCATE, TRIGGER,
-- REFERENCES e MAINTAIN. As migrações anteriores concediam select/insert/update/delete
-- explicitamente, mas conceder não revoga o que o padrão já deu: TRUNCATE ficou de pé em 29
-- tabelas para quem tem conta e em 16 para visitante, inclusive `promotions`, `supermarkets` e
-- `app_admins`.
--
-- Tamanho real do risco, sem exagero: o PostgREST não expõe TRUNCATE, então não há hoje um
-- caminho conhecido para disparar isso com a chave pública. O que existe é um privilégio que
-- ninguém precisa e que a RLS **não** cobre — TRUNCATE não passa por política de linha. Bastaria
-- uma função futura com `security invoker` ou uma injeção de SQL para virar perda total de
-- dados. Privilégio que nenhuma tela usa é privilégio que não deve existir.
--
-- O que fica: select/insert/update/delete seguem exatamente como as migrações anteriores
-- definiram, tabela por tabela, com a RLS decidindo cada linha. Nada que o aplicativo faz muda.

do $$
declare t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    execute format('revoke truncate, trigger, references on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- E para as tabelas que vierem depois desta migração.
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
