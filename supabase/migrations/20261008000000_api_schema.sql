-- Projeto 6 — API agregadora de municípios
-- Schema `api` (projeto Supabase separado das demos com interface; ver PLANO.md do portfólio).
-- Estado compartilhado entre instâncias serverless: chaves (hash), contadores de limite e cache.

create schema if not exists api;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table api.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 2 and 100),
  created_at  timestamptz not null default now()
);

create table api.keys (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references api.profiles (id) on delete cascade,
  name                   text not null check (char_length(name) between 2 and 60),
  prefix                 text not null,                 -- primeiros caracteres, para identificar na tela
  key_hash               text not null unique,          -- sha256 da chave; a chave em si nunca é gravada
  scopes                 text[] not null default array['municipios', 'clima', 'feriados'],
  rate_limit_per_minute  int not null default 60 check (rate_limit_per_minute between 1 and 600),
  created_at             timestamptz not null default now(),
  last_used_at           timestamptz,
  revoked_at             timestamptz,
  check (scopes <@ array['municipios', 'clima', 'feriados'])
);
create index on api.keys (user_id);

-- Contador por chave e minuto. A linha é a "fonte da verdade" entre instâncias.
create table api.rate_counters (
  key_id        uuid not null references api.keys (id) on delete cascade,
  window_start  timestamptz not null,
  count         int not null,
  primary key (key_id, window_start)
);

create table api.usage_daily (
  key_id    uuid not null references api.keys (id) on delete cascade,
  day       date not null,
  requests  int not null default 0,
  limited   int not null default 0,    -- requisições recusadas por limite
  primary key (key_id, day)
);

create table api.cache (
  key          text primary key check (char_length(key) <= 300),
  payload      jsonb not null,
  fetched_at   timestamptz not null,
  expires_at   timestamptz not null,   -- até quando é "atual"
  stale_until  timestamptz not null,   -- até quando pode ser servido se a fonte falhar
  check (stale_until >= expires_at and expires_at >= fetched_at)
);

-- ---------------------------------------------------------------------------
-- Funções do serviço (somente service_role: chamadas pelas rotas da API)
-- ---------------------------------------------------------------------------

-- Valida a chave pelo hash. Atualiza last_used_at no máximo 1x/min (evita escrita a cada requisição).
create or replace function api.authenticate(p_hash text)
returns table (key_id uuid, user_id uuid, scopes text[], rate_limit_per_minute int)
language plpgsql security definer set search_path = '' as $$
declare
  v_key api.keys;
begin
  select * into v_key from api.keys k where k.key_hash = p_hash and k.revoked_at is null;
  if v_key.id is null then
    return;
  end if;
  if v_key.last_used_at is null or v_key.last_used_at < now() - interval '1 minute' then
    update api.keys set last_used_at = now() where id = v_key.id;
  end if;
  return query select v_key.id, v_key.user_id, v_key.scopes, v_key.rate_limit_per_minute;
end $$;

-- Consome 1 requisição da janela atual. Atômico: duas instâncias simultâneas nunca leem o mesmo valor.
create or replace function api.consume(p_key uuid, p_limit int, p_now timestamptz default now())
returns table (allowed boolean, remaining int, reset_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := date_trunc('minute', p_now);
  v_count  int;
begin
  insert into api.rate_counters as rc (key_id, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key_id, window_start) do update set count = rc.count + 1
  returning rc.count into v_count;

  insert into api.usage_daily as u (key_id, day, requests, limited)
  values (p_key, (p_now at time zone 'America/Sao_Paulo')::date, 1, case when v_count > p_limit then 1 else 0 end)
  on conflict (key_id, day) do update
    set requests = u.requests + 1, limited = u.limited + case when v_count > p_limit then 1 else 0 end;

  -- Limpeza ocasional de janelas antigas (~1% das chamadas).
  if random() < 0.01 then
    delete from api.rate_counters where window_start < p_now - interval '10 minutes';
  end if;

  return query select v_count <= p_limit, greatest(p_limit - v_count, 0), v_window + interval '1 minute';
end $$;

create or replace function api.cache_get(p_key text)
returns table (payload jsonb, fetched_at timestamptz, expires_at timestamptz, stale_until timestamptz)
language sql stable security definer set search_path = '' as $$
  select payload, fetched_at, expires_at, stale_until from api.cache where key = p_key and stale_until > now()
$$;

create or replace function api.cache_put(p_key text, p_payload jsonb, p_ttl_seconds int, p_stale_seconds int)
returns void language sql security definer set search_path = '' as $$
  insert into api.cache (key, payload, fetched_at, expires_at, stale_until)
  values (p_key, p_payload, now(), now() + make_interval(secs => p_ttl_seconds),
          now() + make_interval(secs => p_ttl_seconds + p_stale_seconds))
  on conflict (key) do update set
    payload = excluded.payload, fetched_at = excluded.fetched_at,
    expires_at = excluded.expires_at, stale_until = excluded.stale_until
$$;

-- ---------------------------------------------------------------------------
-- Funções do portal (usuário autenticado)
-- ---------------------------------------------------------------------------

-- Cria chave e devolve o texto em claro UMA vez. Limite: 5 chaves ativas por usuário.
create or replace function api.create_key(p_name text, p_scopes text[] default array['municipios', 'clima', 'feriados'])
returns table (id uuid, key text)
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := 'mun_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_id  uuid;
begin
  if auth.uid() is null or not exists (select 1 from api.profiles where profiles.id = auth.uid()) then
    raise exception 'NAO_AUTENTICADO' using errcode = '28000';
  end if;
  if (select count(*) from api.keys k where k.user_id = auth.uid() and k.revoked_at is null) >= 5 then
    raise exception 'LIMITE_DE_CHAVES' using errcode = 'P0001';
  end if;
  if p_scopes is null or cardinality(p_scopes) = 0 or not (p_scopes <@ array['municipios', 'clima', 'feriados']) then
    raise exception 'ESCOPO_INVALIDO' using errcode = '22023';
  end if;
  insert into api.keys (user_id, name, prefix, key_hash, scopes)
  values (auth.uid(), trim(p_name), left(v_key, 12), encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), p_scopes)
  returning keys.id into v_id;
  return query select v_id, v_key;
end $$;

create or replace function api.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if new.raw_user_meta_data ->> 'app' is distinct from 'api' then
    return new;
  end if;
  v_name := left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100);
  if char_length(v_name) < 2 then v_name := 'Desenvolvedor'; end if;
  insert into api.profiles (id, full_name) values (new.id, v_name);
  return new;
end $$;

create trigger api_on_auth_user_created
  after insert on auth.users
  for each row execute function api.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

grant usage on schema api to authenticated, service_role;
revoke all on all functions in schema api from public;
revoke all on all tables in schema api from anon, authenticated;

grant select on api.profiles to authenticated;
-- O hash nunca é exposto ao usuário.
grant select (id, user_id, name, prefix, scopes, rate_limit_per_minute, created_at, last_used_at, revoked_at)
  on api.keys to authenticated;
grant update (revoked_at, name) on api.keys to authenticated;
grant select on api.usage_daily to authenticated;
grant all on all tables in schema api to service_role;

grant execute on function api.create_key(text, text[]) to authenticated;
grant execute on function api.authenticate(text), api.consume(uuid, int, timestamptz),
  api.cache_get(text), api.cache_put(text, jsonb, int, int) to service_role;

alter table api.profiles      enable row level security;
alter table api.keys          enable row level security;
alter table api.rate_counters enable row level security;
alter table api.usage_daily   enable row level security;
alter table api.cache         enable row level security;

create policy "perfil próprio" on api.profiles for select to authenticated using (id = auth.uid());
create policy "chaves próprias" on api.keys for select to authenticated using (user_id = auth.uid());
-- Revogar é definitivo: só se altera chave ativa, e não dá para "desrevogar".
create policy "revogar/renomear chaves próprias" on api.keys for update to authenticated
  using (user_id = auth.uid() and revoked_at is null) with check (user_id = auth.uid());
create policy "uso das próprias chaves" on api.usage_daily for select to authenticated
  using (exists (select 1 from api.keys k where k.id = key_id and k.user_id = auth.uid()));
-- rate_counters e cache: sem políticas para usuários (somente service_role).
