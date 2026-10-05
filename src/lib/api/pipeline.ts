// Pipeline de toda rota protegida: chave → escopo → limite (no Postgres, entre instâncias) → handler.
import type { CacheEntry, CacheStore } from "./cache";
import { hashKey, problem, readApiKey, type Scope } from "./http-utils";

export interface ApiContext {
  keyId: string;
  scopes: string[];
}

/** Operações do banco usadas pela pipeline (injetáveis para testes). */
export interface ApiBackend {
  authenticate(hash: string): Promise<{ key_id: string; scopes: string[]; rate_limit_per_minute: number } | null>;
  consume(keyId: string, limit: number): Promise<{ allowed: boolean; remaining: number; reset_at: string }>;
}

export async function withApiKey(
  request: Request,
  scope: Scope,
  backend: ApiBackend,
  handler: (ctx: ApiContext) => Promise<unknown>,
): Promise<Response> {
  const key = readApiKey(request.headers);
  if (!key) {
    return problem(401, "Chave ausente", "Envie a chave em `Authorization: Bearer <chave>` ou no cabeçalho `X-API-Key`.", {
      "WWW-Authenticate": 'Bearer realm="api-municipios"',
    });
  }
  if (key === "invalida") return problem(401, "Chave inválida", "Formato de chave inválido. Chaves começam com `mun_`.");

  let auth;
  try {
    auth = await backend.authenticate(hashKey(key));
  } catch {
    return problem(503, "Serviço indisponível", "Não foi possível validar a chave agora. Tente novamente em instantes.", { "Retry-After": "5" });
  }
  if (!auth) return problem(401, "Chave inválida", "Chave inexistente ou revogada.");
  if (!auth.scopes.includes(scope)) {
    return problem(403, "Escopo insuficiente", `Esta chave não tem o escopo \`${scope}\`. Crie uma chave com esse escopo no portal.`);
  }

  let rate;
  try {
    rate = await backend.consume(auth.key_id, auth.rate_limit_per_minute);
  } catch {
    return problem(503, "Serviço indisponível", "Não foi possível verificar o limite de requisições. Tente novamente.", { "Retry-After": "5" });
  }
  const resetEpoch = Math.ceil(new Date(rate.reset_at).getTime() / 1000);
  const rateHeaders = {
    "X-RateLimit-Limit": String(auth.rate_limit_per_minute),
    "X-RateLimit-Remaining": String(rate.remaining),
    "X-RateLimit-Reset": String(resetEpoch),
  };
  if (!rate.allowed) {
    const retry = Math.max(1, resetEpoch - Math.floor(Date.now() / 1000));
    return problem(429, "Limite de requisições excedido", `Limite de ${auth.rate_limit_per_minute} requisições por minuto. Tente novamente em ${retry} s.`, {
      ...rateHeaders,
      "Retry-After": String(retry),
    });
  }

  try {
    const body = await handler({ keyId: auth.key_id, scopes: auth.scopes });
    if (body instanceof Response) {
      Object.entries(rateHeaders).forEach(([k, v]) => body.headers.set(k, v));
      return body;
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...rateHeaders },
    });
  } catch {
    return problem(500, "Erro interno", "Falha inesperada ao processar a requisição.", rateHeaders);
  }
}

/** Implementações reais (Supabase com service_role). */
type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export function supabaseBackend(rpc: Rpc): ApiBackend & CacheStore {
  return {
    async authenticate(hash) {
      const { data, error } = await rpc("authenticate", { p_hash: hash });
      if (error) throw new Error(error.message);
      return (data as { key_id: string; scopes: string[]; rate_limit_per_minute: number }[])[0] ?? null;
    },
    async consume(keyId, limit) {
      const { data, error } = await rpc("consume", { p_key: keyId, p_limit: limit });
      if (error) throw new Error(error.message);
      return (data as { allowed: boolean; remaining: number; reset_at: string }[])[0];
    },
    async get<T>(key: string) {
      const { data, error } = await rpc("cache_get", { p_key: key });
      if (error) throw new Error(error.message);
      return ((data as CacheEntry<T>[])[0] ?? null) as CacheEntry<T> | null;
    },
    async put<T>(key: string, payload: T, ttl: number, stale: number) {
      const { error } = await rpc("cache_put", { p_key: key, p_payload: payload, p_ttl_seconds: ttl, p_stale_seconds: stale });
      if (error) throw new Error(error.message);
      const t = Date.now();
      return {
        payload,
        fetched_at: new Date(t).toISOString(),
        expires_at: new Date(t + ttl * 1000).toISOString(),
        stale_until: new Date(t + (ttl + stale) * 1000).toISOString(),
      };
    },
  };
}
