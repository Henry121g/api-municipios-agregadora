// Cache com validade e "dado expirado como reserva". O armazenamento é injetável:
// em produção é o Postgres (compartilhado entre instâncias); nos testes, memória com relógio falso.

export interface CacheEntry<T> {
  payload: T;
  fetched_at: string;
  expires_at: string;
  stale_until: string;
}

export interface CacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  put<T>(key: string, payload: T, ttlSeconds: number, staleSeconds: number): Promise<CacheEntry<T>>;
}

export type Origin = "fonte" | "cache" | "cache_expirado";

export interface Sourced<T> {
  data: T;
  origem: Origin;
  obtido_em: string;
  valido_ate: string;
  aviso?: string;
}

export interface CachePolicy {
  ttlSeconds: number;
  staleSeconds: number;
}

/**
 * 1. Cache válido → devolve sem chamar a fonte (origem "cache").
 * 2. Senão chama a fonte; sucesso → grava e devolve (origem "fonte").
 * 3. Fonte falhou e há cache expirado dentro da janela → devolve com aviso (origem "cache_expirado").
 * 4. Sem nada → propaga o erro (a agregação marca a fonte como indisponível).
 */
export async function cached<T>(
  store: CacheStore,
  key: string,
  policy: CachePolicy,
  loader: () => Promise<T>,
  now: () => Date = () => new Date(),
): Promise<Sourced<T>> {
  let entry: CacheEntry<T> | null = null;
  try {
    entry = await store.get<T>(key);
  } catch {
    entry = null; // cache indisponível não pode derrubar a resposta
  }
  if (entry && new Date(entry.expires_at) > now()) {
    return { data: entry.payload, origem: "cache", obtido_em: entry.fetched_at, valido_ate: entry.expires_at };
  }
  try {
    const data = await loader();
    let saved: CacheEntry<T> | null = null;
    try {
      saved = await store.put(key, data, policy.ttlSeconds, policy.staleSeconds);
    } catch {
      saved = null;
    }
    const t = now();
    return {
      data,
      origem: "fonte",
      obtido_em: saved?.fetched_at ?? t.toISOString(),
      valido_ate: saved?.expires_at ?? new Date(t.getTime() + policy.ttlSeconds * 1000).toISOString(),
    };
  } catch (err) {
    if (entry && new Date(entry.stale_until) > now()) {
      return {
        data: entry.payload,
        origem: "cache_expirado",
        obtido_em: entry.fetched_at,
        valido_ate: entry.expires_at,
        aviso: "Fonte indisponível; dado expirado servido do cache.",
      };
    }
    throw err;
  }
}

/** Armazenamento em memória (testes e desenvolvimento sem banco). */
export function memoryStore(now: () => Date = () => new Date()): CacheStore & { entries: Map<string, CacheEntry<unknown>> } {
  const entries = new Map<string, CacheEntry<unknown>>();
  return {
    entries,
    async get<T>(key: string) {
      const e = entries.get(key) as CacheEntry<T> | undefined;
      return e && new Date(e.stale_until) > now() ? e : null;
    },
    async put<T>(key: string, payload: T, ttl: number, stale: number) {
      const t = now().getTime();
      const e: CacheEntry<T> = {
        payload,
        fetched_at: new Date(t).toISOString(),
        expires_at: new Date(t + ttl * 1000).toISOString(),
        stale_until: new Date(t + (ttl + stale) * 1000).toISOString(),
      };
      entries.set(key, e as CacheEntry<unknown>);
      return e;
    },
  };
}
