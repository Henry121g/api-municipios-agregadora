import { describe, expect, it, vi } from "vitest";
import { hashKey, parsePeriod, readApiKey } from "./http-utils";
import { withApiKey, type ApiBackend } from "./pipeline";

const KEY = `mun_${"a".repeat(64)}`;
const req = (headers: Record<string, string> = {}) => new Request("https://api.test/x", { headers });

function backend(over: Partial<ApiBackend> = {}): ApiBackend {
  return {
    authenticate: vi.fn(async (h: string) => (h === hashKey(KEY) ? { key_id: "k1", scopes: ["municipios", "feriados"], rate_limit_per_minute: 2 } : null)),
    consume: vi.fn(async () => ({ allowed: true, remaining: 1, reset_at: new Date(Date.now() + 30_000).toISOString() })),
    ...over,
  };
}

describe("leitura da chave", () => {
  it("aceita Bearer e X-API-Key; recusa formatos estranhos", () => {
    expect(readApiKey(new Headers({ authorization: `Bearer ${KEY}` }))).toBe(KEY);
    expect(readApiKey(new Headers({ "x-api-key": KEY }))).toBe(KEY);
    expect(readApiKey(new Headers({ "x-api-key": "123" }))).toBe("invalida");
    expect(readApiKey(new Headers())).toBeNull();
  });
});

describe("pipeline da API", () => {
  it("sem chave → 401 problem+json com WWW-Authenticate", async () => {
    const r = await withApiKey(req(), "municipios", backend(), async () => ({}));
    expect(r.status).toBe(401);
    expect(r.headers.get("content-type")).toMatch(/problem\+json/);
    expect(r.headers.get("www-authenticate")).toMatch(/Bearer/);
    expect(await r.json()).toMatchObject({ title: "Chave ausente", status: 401 });
  });

  it("chave desconhecida ou revogada → 401; sem escopo → 403", async () => {
    const outra = `mun_${"b".repeat(64)}`;
    expect((await withApiKey(req({ "x-api-key": outra }), "municipios", backend(), async () => ({}))).status).toBe(401);
    expect((await withApiKey(req({ "x-api-key": KEY }), "clima", backend(), async () => ({}))).status).toBe(403);
  });

  it("sucesso inclui cabeçalhos de limite", async () => {
    const r = await withApiKey(req({ authorization: `Bearer ${KEY}` }), "municipios", backend(), async () => ({ ok: true }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(r.headers.get("x-ratelimit-limit")).toBe("2");
    expect(r.headers.get("x-ratelimit-remaining")).toBe("1");
  });

  it("acima do limite → 429 com Retry-After, sem executar o handler", async () => {
    const handler = vi.fn(async () => ({}));
    const b = backend({ consume: async () => ({ allowed: false, remaining: 0, reset_at: new Date(Date.now() + 20_000).toISOString() }) });
    const r = await withApiKey(req({ "x-api-key": KEY }), "municipios", b, handler);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it("banco indisponível → 503 (não libera acesso sem validar)", async () => {
    const handler = vi.fn(async () => ({}));
    const r = await withApiKey(req({ "x-api-key": KEY }), "municipios", backend({ authenticate: () => Promise.reject(new Error("db")) }), handler);
    expect(r.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it("erro inesperado no handler → 500 genérico, sem vazar detalhes", async () => {
    const r = await withApiKey(req({ "x-api-key": KEY }), "municipios", backend(), async () => {
      throw new Error("senha do banco: 123");
    });
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("senha");
  });
});

describe("período", () => {
  it("padrão de 7 dias a partir de hoje; valida formato, ordem e tamanho", () => {
    expect(parsePeriod(null, null, "2026-10-05")).toEqual({ de: "2026-10-05", ate: "2026-10-11" });
    expect(parsePeriod("2026-13-01", null, "2026-10-05")).toHaveProperty("error");
    expect(parsePeriod("2026-10-10", "2026-10-01", "2026-10-05")).toHaveProperty("error");
    expect(parsePeriod("2026-01-01", "2027-06-01", "2026-10-05")).toHaveProperty("error");
  });
});
