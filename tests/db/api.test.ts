import { createHash } from "node:crypto";
import type { Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let t: TestDb;
let dev: string, outro: string, deOutroApp: string;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const as = <T,>(uid: string | null, sql: string, params: unknown[] = [], role?: "service_role") =>
  t.as(uid, async (tx: Transaction) => (await tx.query<T>(sql, params)).rows, role ? { role } : {});
const service = <T,>(sql: string, params: unknown[] = []) => as<T>(null, sql, params, "service_role");

beforeAll(async () => {
  t = await createTestDb();
  dev = await t.signUp("Dev");
  outro = await t.signUp("Outra dev");
  deOutroApp = await t.signUp("Usuário de outro app", "x@exemplo.test", "tarefas");
});

describe("chaves de API", () => {
  let key: string;
  let keyId: string;

  it("cria chave com prefixo mun_, devolve o texto uma vez e grava só o hash", async () => {
    [{ id: keyId, key }] = await as<{ id: string; key: string }>(dev, `select * from api.create_key('Meu app')`);
    expect(key).toMatch(/^mun_[0-9a-f]{64}$/);
    const { rows } = await t.db.query<{ key_hash: string; prefix: string }>(`select key_hash, prefix from api.keys where id = $1`, [keyId]);
    expect(rows[0]).toEqual({ key_hash: sha(key), prefix: key.slice(0, 12) });
  });

  it("o dono vê suas chaves, mas não o hash; outra pessoa não vê nada", async () => {
    await expect(as(dev, `select key_hash from api.keys`)).rejects.toThrow(/permission denied/);
    expect(await as(dev, `select id, prefix from api.keys`)).toHaveLength(1);
    expect(await as(outro, `select id from api.keys`)).toHaveLength(0);
  });

  it("autentica pelo hash e devolve escopos e limite", async () => {
    const [r] = await service<{ key_id: string; scopes: string[]; rate_limit_per_minute: number }>(`select * from api.authenticate($1)`, [sha(key)]);
    expect(r).toMatchObject({ key_id: keyId, scopes: ["municipios", "clima", "feriados"], rate_limit_per_minute: 60 });
    expect(await service(`select * from api.authenticate($1)`, [sha("mun_inventada")])).toHaveLength(0);
  });

  it("usuários não chamam as funções do serviço", async () => {
    await expect(as(dev, `select * from api.authenticate($1)`, [sha(key)])).rejects.toThrow(/permission denied/);
    await expect(as(dev, `select * from api.consume($1, 10)`, [keyId])).rejects.toThrow(/permission denied/);
    await expect(as(dev, `select * from api.cache_get('x')`)).rejects.toThrow(/permission denied/);
  });

  it("revogar é imediato e definitivo; não se revoga chave alheia", async () => {
    expect(await as(outro, `update api.keys set revoked_at = now() where id = $1 returning id`, [keyId])).toHaveLength(0);
    expect(await as(dev, `update api.keys set revoked_at = now() where id = $1 returning id`, [keyId])).toHaveLength(1);
    expect(await service(`select * from api.authenticate($1)`, [sha(key)])).toHaveLength(0);
    expect(await as(dev, `update api.keys set revoked_at = null where id = $1 returning id`, [keyId])).toHaveLength(0);
  });

  it("no máximo 5 chaves ativas; escopos validados", async () => {
    for (let i = 0; i < 5; i++) await as(dev, `select * from api.create_key($1)`, [`Chave ${i}`]);
    await expect(as(dev, `select * from api.create_key('Sexta')`)).rejects.toThrow(/LIMITE_DE_CHAVES/);
    await expect(as(outro, `select * from api.create_key('x', array['admin'])`)).rejects.toThrow(/ESCOPO_INVALIDO/);
    const [{ key: k }] = await as<{ key: string }>(outro, `select * from api.create_key('Só feriados', array['feriados'])`);
    const [r] = await service<{ scopes: string[] }>(`select scopes from api.authenticate($1)`, [sha(k)]);
    expect(r.scopes).toEqual(["feriados"]);
  });

  it("conta de outro app do portfólio não cria chaves", async () => {
    await expect(as(deOutroApp, `select * from api.create_key('x')`)).rejects.toThrow(/NAO_AUTENTICADO/);
  });
});

describe("limite de requisições (janela fixa por minuto)", () => {
  let keyId: string;
  beforeAll(async () => {
    [{ id: keyId }] = await as<{ id: string }>(outro, `select * from api.create_key('Limite')`);
  });

  it("permite até o limite, recusa a partir dele e informa o restante e o reinício", async () => {
    const now = "2026-10-05T12:00:30Z";
    const results = [];
    for (let i = 0; i < 4; i++) {
      const [r] = await service<{ allowed: boolean; remaining: number; reset_at: Date }>(`select * from api.consume($1, 3, $2)`, [keyId, now]);
      results.push(r);
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(new Date(results[0].reset_at).toISOString()).toBe("2026-10-05T12:01:00.000Z");
  });

  it("nova janela zera o contador", async () => {
    const [r] = await service<{ allowed: boolean; remaining: number }>(`select * from api.consume($1, 3, '2026-10-05T12:01:05Z')`, [keyId]);
    expect(r).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("chamadas disparadas em paralelo são todas contadas (contador atômico no banco)", async () => {
    const now = "2026-10-05T12:05:00Z";
    await Promise.all(Array.from({ length: 25 }, () => service(`select * from api.consume($1, 10, $2)`, [keyId, now])));
    const { rows } = await t.db.query<{ count: number }>(`select count from api.rate_counters where key_id = $1 and window_start = $2`, [keyId, now]);
    expect(rows[0].count).toBe(25);
  });

  it("registra uso diário e quantas foram limitadas", async () => {
    const { rows } = await t.db.query<{ requests: number; limited: number }>(
      `select sum(requests)::int requests, sum(limited)::int limited from api.usage_daily where key_id = $1`,
      [keyId],
    );
    expect(rows[0]).toEqual({ requests: 30, limited: 16 });
  });
});

describe("cache compartilhado", () => {
  it("guarda com validade e janela de expirado", async () => {
    await service(`select api.cache_put('clima:1', '{"t":20}', 60, 3600)`);
    const [r] = await service<{ payload: { t: number }; expires_at: Date; stale_until: Date; fetched_at: Date }>(`select * from api.cache_get('clima:1')`);
    expect(r.payload).toEqual({ t: 20 });
    expect(new Date(r.expires_at).getTime() - new Date(r.fetched_at).getTime()).toBe(60_000);
    expect(new Date(r.stale_until).getTime() - new Date(r.expires_at).getTime()).toBe(3_600_000);
  });

  it("sobrescreve ao atualizar e some depois da janela de expirado", async () => {
    await service(`select api.cache_put('clima:1', '{"t":21}', 60, 3600)`);
    expect((await service<{ payload: { t: number } }>(`select * from api.cache_get('clima:1')`))[0].payload).toEqual({ t: 21 });
    await t.db.query(
      `update api.cache set fetched_at = now() - interval '3 hours', expires_at = now() - interval '2 hours', stale_until = now() - interval '1 hour' where key = 'clima:1'`,
    );
    expect(await service(`select * from api.cache_get('clima:1')`)).toHaveLength(0);
  });

  it("usuários não leem o cache nem os contadores diretamente", async () => {
    await expect(as(dev, `select * from api.cache`)).rejects.toThrow(/permission denied/);
    await expect(as(dev, `select * from api.rate_counters`)).rejects.toThrow(/permission denied/);
  });
});
