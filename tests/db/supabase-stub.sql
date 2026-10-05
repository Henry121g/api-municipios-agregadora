-- Stub mínimo do ambiente Supabase para testes com PGlite (sem Docker).
-- Reproduz apenas o que a migração usa: schema auth, auth.users, auth.uid() e os papéis da API.
create schema if not exists extensions;
create schema if not exists auth;

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- Mesma lógica do Supabase: lê o "sub" do JWT da requisição.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Stub do Supabase Realtime: realtime.send grava em realtime.messages (como no Supabase) e
-- realtime.topic() lê o tópico do canal sendo autorizado (aqui, de uma configuração de sessão).
create schema if not exists realtime;
create table realtime.messages (
  id          bigint generated always as identity primary key,
  topic       text not null,
  extension   text not null,
  event       text,
  payload     jsonb,
  private     boolean default true,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert on realtime.messages to authenticated;

create or replace function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;

create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql as $$
  insert into realtime.messages (topic, extension, event, payload, private) values (topic, 'broadcast', event, payload, private)
$$;
grant execute on function realtime.topic() to anon, authenticated, service_role;
