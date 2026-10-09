import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getResumo, listMunicipios, realSources, type Sources } from "./aggregate";
import { cached, memoryStore } from "./cache";
import { fetchJson, SourceError } from "./http";
import { normalizeClima, normalizeFeriados, normalizeMunicipio, pickCoordinates } from "./sources";

const fixture = <T,>(name: string): T => JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "tests", "fixtures", name), "utf8"));
const noSleep = async () => {};

describe("fetchJson: timeout e novas tentativas", () => {
  it("tenta de novo em 5xx e devolve quando a fonte se recupera", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("x", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    expect(await fetchJson("https://x", { fetchImpl, sleep: noSleep })).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("não insiste em erro 4xx (exceto 429)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("x", { status: 404 }));
    await expect(fetchJson("https://x", { fetchImpl, sleep: noSleep })).rejects.toMatchObject({ kind: "http", status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("limita as tentativas e informa timeout", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(Object.assign(new Error("t"), { name: "TimeoutError" }));
    await expect(fetchJson("https://x", { fetchImpl, sleep: noSleep, retries: 2 })).rejects.toMatchObject({ kind: "timeout" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("espera de forma crescente entre tentativas", async () => {
    const sleep = vi.fn(async (ms: number) => void ms);
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchJson("https://x", { fetchImpl, sleep, retries: 2, backoffMs: 100 })).rejects.toMatchObject({ kind: "rede" });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });

  it("envia User-Agent só com ASCII (com acento o IBGE responde 400)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await fetchJson("https://x", { fetchImpl, sleep: noSleep });
    const ua = new Headers(fetchImpl.mock.calls[0][1].headers).get("User-Agent")!;
    expect(ua).toMatch(/^[\x20-\x7e]+$/);
  });

  it("um timeout real aborta a requisição", async () => {
    const fetchImpl = vi.fn((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    );
    await expect(fetchJson("https://x", { fetchImpl: fetchImpl as never, timeoutMs: 20, retries: 0 })).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("cache com dado expirado como reserva", () => {
  let clock = new Date("2026-10-05T12:00:00Z");
  const now = () => clock;
  const policy = { ttlSeconds: 60, staleSeconds: 3600 };

  it("1ª chamada vem da fonte; 2ª, do cache; depois de expirar, da fonte de novo", async () => {
    const store = memoryStore(now);
    const loader = vi.fn().mockResolvedValueOnce("v1").mockResolvedValueOnce("v2");
    expect(await cached(store, "k", policy, loader, now)).toMatchObject({ data: "v1", origem: "fonte" });
    expect(await cached(store, "k", policy, loader, now)).toMatchObject({ data: "v1", origem: "cache", valido_ate: "2026-10-05T12:01:00.000Z" });
    clock = new Date("2026-10-05T12:02:00Z");
    expect(await cached(store, "k", policy, loader, now)).toMatchObject({ data: "v2", origem: "fonte" });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("fonte fora do ar + cache expirado na janela → serve expirado com aviso", async () => {
    clock = new Date("2026-10-05T12:00:00Z");
    const store = memoryStore(now);
    await cached(store, "k", policy, async () => "antigo", now);
    clock = new Date("2026-10-05T12:30:00Z");
    const r = await cached(store, "k", policy, async () => Promise.reject(new SourceError("timeout", "x")), now);
    expect(r).toMatchObject({ data: "antigo", origem: "cache_expirado", obtido_em: "2026-10-05T12:00:00.000Z" });
    expect(r.aviso).toMatch(/indisponível/);
  });

  it("fonte fora do ar e nada utilizável no cache → erro", async () => {
    clock = new Date("2026-10-05T12:00:00Z");
    const store = memoryStore(now);
    await cached(store, "k", policy, async () => "antigo", now);
    clock = new Date("2026-10-05T14:00:00Z"); // além da janela de expirado
    await expect(cached(store, "k", policy, async () => Promise.reject(new SourceError("rede", "x")), now)).rejects.toThrow();
  });

  it("falha do armazenamento de cache não derruba a resposta", async () => {
    const broken = { get: () => Promise.reject(new Error("db")), put: () => Promise.reject(new Error("db")) };
    expect(await cached(broken, "k", policy, async () => "ok")).toMatchObject({ data: "ok", origem: "fonte" });
  });
});

describe("normalização com respostas reais", () => {
  it("IBGE: município com UF e região", () => {
    expect(normalizeMunicipio(fixture("ibge-municipio-3509502.json"))).toEqual({
      ibge: 3509502,
      nome: "Campinas",
      uf: { sigla: "SP", nome: "São Paulo" },
      regiao: { sigla: "SE", nome: "Sudeste" },
      microrregiao: "Campinas",
      regiao_imediata: "Campinas",
    });
  });

  it("IBGE: lista de uma UF inteira normaliza todos", () => {
    const lista = fixture<unknown[]>("ibge-municipios-AC.json").map((m) => normalizeMunicipio(m as never));
    expect(lista).toHaveLength(22);
    expect(lista.every((m) => m.uf.sigla === "AC")).toBe(true);
  });

  it("Open-Meteo Geocoding: casa nome e UF e ignora homônimos e resultados aproximados", () => {
    const geo = fixture<{ results: never[] }>("openmeteo-geocoding-campinas.json");
    expect(pickCoordinates(geo.results, { nome: "Campinas", uf: { sigla: "SP", nome: "São Paulo" } })).toMatchObject({
      latitude: -22.90556,
      longitude: -47.06083,
      fuso: "America/Sao_Paulo",
    });
    expect(pickCoordinates(geo.results, { nome: "Campinas", uf: { sigla: "AC", nome: "Acre" } })).toBeNull();
  });

  it("Open-Meteo Forecast: 7 dias, clima atual e atribuição", () => {
    const c = normalizeClima(fixture("openmeteo-forecast-campinas.json"));
    expect(c.dias).toHaveLength(7);
    expect(c.dias[0]).toEqual(expect.objectContaining({ data: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), condicao: expect.any(String) }));
    expect(c.atual?.temperatura_c).toEqual(expect.any(Number));
    expect(c.atribuicao).toMatch(/CC BY 4.0/);
  });

  it("BrasilAPI: feriados ordenados por data", () => {
    const f = normalizeFeriados(fixture("brasilapi-feriados-2026.json"));
    expect(f[0]).toEqual({ data: "2026-01-01", nome: "Confraternização mundial", dia_da_semana: "quinta-feira" });
    expect(f.map((x) => x.data)).toEqual([...f.map((x) => x.data)].sort());
  });

  it("formato inesperado vira erro de formato, não dado inventado", () => {
    expect(() => normalizeClima({} as never)).toThrow(SourceError);
    expect(() => normalizeFeriados({} as never)).toThrow(SourceError);
  });
});

describe("agregação com resposta parcial", () => {
  const municipio = normalizeMunicipio(fixture("ibge-municipio-3509502.json"));
  const fake = (over: Partial<Sources> = {}): Sources => ({
    municipio: async () => municipio,
    municipiosDaUf: async () => fixture<unknown[]>("ibge-municipios-AC.json").map((m) => normalizeMunicipio(m as never)),
    coordenadas: async () => ({ latitude: -22.9, longitude: -47.06, fuso: "America/Sao_Paulo" }),
    clima: async () => normalizeClima(fixture("openmeteo-forecast-campinas.json")),
    feriados: async () => normalizeFeriados(fixture("brasilapi-feriados-2026.json")),
    ...over,
  });

  it("todas as fontes ok → resposta completa, feriados filtrados pelo período", async () => {
    const r = await getResumo(memoryStore(), fake(), 3509502, "2026-10-01", "2026-11-30");
    expect(r.parcial).toBe(false);
    const esperados = normalizeFeriados(fixture("brasilapi-feriados-2026.json")).filter((f) => f.data >= "2026-10-01" && f.data <= "2026-11-30");
    expect(esperados.length).toBeGreaterThan(0);
    expect(r.feriados).toEqual(esperados);
    expect(r.feriados!.map((f) => f.nome)).toContain("Nossa Senhora Aparecida");
    expect(r.fontes.map((f) => f.origem)).toEqual(["fonte", "fonte", "fonte"]);
  });

  it("clima fora do ar → 200 parcial com município e feriados", async () => {
    const r = await getResumo(memoryStore(), fake({ clima: () => Promise.reject(new SourceError("timeout", "x")) }), 3509502, "2026-10-01", "2026-10-31");
    expect(r.parcial).toBe(true);
    expect(r.municipio?.nome).toBe("Campinas");
    expect(r.feriados).not.toBeNull();
    expect(r.clima).toBeNull();
    expect(r.fontes[1]).toMatchObject({ fonte: "Open-Meteo", origem: "indisponivel", erro: "a fonte não respondeu a tempo" });
  });

  it("IBGE fora do ar depois da 1ª consulta → clima continua (coordenadas em cache)", async () => {
    const store = memoryStore();
    await getResumo(store, fake(), 3509502, "2026-10-01", "2026-10-31");
    store.entries.delete("ibge:municipio:3509502");
    store.entries.forEach((e, k) => k.startsWith("clima:") && store.entries.delete(k));
    const r = await getResumo(store, fake({ municipio: () => Promise.reject(new SourceError("http", "x", 503)) }), 3509502, "2026-10-01", "2026-10-31");
    expect(r.municipio).toBeNull();
    expect(r.clima).not.toBeNull();
    expect(r.fontes.map((f) => f.origem)).toEqual(["indisponivel", "fonte", "cache"]);
  });

  it("segunda chamada distingue dados do cache", async () => {
    const store = memoryStore();
    const src = fake();
    const spy = vi.spyOn(src, "clima");
    await getResumo(store, src, 3509502, "2026-10-01", "2026-10-31");
    const r = await getResumo(store, src, 3509502, "2026-10-01", "2026-10-31");
    expect(r.fontes.map((f) => f.origem)).toEqual(["cache", "cache", "cache"]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("chave sem escopo de clima não aciona a fonte e não marca a resposta como parcial", async () => {
    const clima = vi.fn();
    const r = await getResumo(memoryStore(), fake({ clima }), 3509502, "2026-10-01", "2026-10-31", { clima: false, feriados: true });
    expect(clima).not.toHaveBeenCalled();
    expect(r.clima).toBeNull();
    expect(r.parcial).toBe(false);
    expect(r.fontes[1]).toMatchObject({ fonte: "Open-Meteo", origem: "sem_escopo" });
  });

  it("período em dois anos busca feriados dos dois", async () => {
    const feriados = vi.fn(async (ano: number) => [{ data: `${ano}-01-01`, nome: "Ano novo", dia_da_semana: null }]);
    const r = await getResumo(memoryStore(), fake({ feriados }), 3509502, "2026-12-20", "2027-01-10");
    expect(feriados.mock.calls.map((c) => c[0]).sort()).toEqual([2026, 2027]);
    expect(r.feriados!.map((f) => f.data)).toEqual(["2027-01-01"]);
  });
});

describe("lista paginada", () => {
  it("filtra por nome sem acento, ordena e pagina", async () => {
    const src: Sources = { ...realSources, municipiosDaUf: async () => fixture<unknown[]>("ibge-municipios-AC.json").map((m) => normalizeMunicipio(m as never)) };
    const p1 = await listMunicipios(memoryStore(), src, { uf: "AC", pagina: 1, porPagina: 5 });
    expect(p1.paginacao).toEqual({ pagina: 1, por_pagina: 5, total: 22, total_paginas: 5 });
    expect(p1.dados.map((m) => m.nome)).toEqual([...p1.dados.map((m) => m.nome)].sort((a, b) => a.localeCompare(b, "pt-BR")));
    const busca = await listMunicipios(memoryStore(), src, { uf: "AC", nome: "BRASILEIA", pagina: 1, porPagina: 5 });
    expect(busca.dados.map((m) => m.nome)).toEqual(["Brasiléia"]);
  });
});
