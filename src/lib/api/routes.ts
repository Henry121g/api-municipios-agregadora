import { createAdminClient } from "@/lib/supabase/admin";
import { getFeriados, getMunicipio, getResumo, listMunicipios, realSources } from "./aggregate";
import { isIbgeCode, parsePeriod, problem } from "./http-utils";
import { supabaseBackend, withApiKey } from "./pipeline";
import { UFS } from "./sources";

// Backend único por instância: chaves, limite e cache vivem no Postgres (compartilhados).
let backend: ReturnType<typeof supabaseBackend> | null = null;
function api() {
  if (!backend) {
    const admin = createAdminClient();
    backend = supabaseBackend((fn, args) => admin.rpc(fn, args));
  }
  return backend;
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const meta = (fontes: unknown) => ({ gerado_em: new Date().toISOString(), fontes });

export function handleList(request: Request) {
  return withApiKey(request, "municipios", api(), async () => {
    const sp = new URL(request.url).searchParams;
    const uf = (sp.get("uf") ?? "").toUpperCase();
    if (!UFS.includes(uf as (typeof UFS)[number])) return problem(400, "Parâmetro inválido", "Informe `uf` com uma sigla válida (ex.: SP).");
    const pagina = Number(sp.get("pagina") ?? 1);
    const porPagina = Number(sp.get("por_pagina") ?? 20);
    if (!Number.isInteger(pagina) || pagina < 1 || !Number.isInteger(porPagina) || porPagina < 1 || porPagina > 100) {
      return problem(400, "Parâmetro inválido", "`pagina` deve ser ≥ 1 e `por_pagina` entre 1 e 100.");
    }
    const nome = (sp.get("nome") ?? "").trim().slice(0, 60) || undefined;
    try {
      const r = await listMunicipios(api(), realSources, { uf, nome, pagina, porPagina });
      return { dados: r.dados, paginacao: r.paginacao, meta: meta([r.fonte]) };
    } catch {
      return problem(502, "Fonte indisponível", "O IBGE não respondeu e não há lista em cache para esta UF.");
    }
  });
}

export function handleMunicipio(request: Request, ibge: string) {
  return withApiKey(request, "municipios", api(), async () => {
    if (!isIbgeCode(ibge)) return problem(400, "Parâmetro inválido", "O código IBGE tem 7 dígitos (ex.: 3509502).");
    try {
      const r = await getMunicipio(api(), realSources, Number(ibge));
      return { dados: r.data, meta: meta([{ fonte: "IBGE", origem: r.origem, obtido_em: r.obtido_em, valido_ate: r.valido_ate }]) };
    } catch (err) {
      if ((err as { status?: number }).status === 404) return problem(404, "Não encontrado", `Município ${ibge} não existe no IBGE.`);
      return problem(502, "Fonte indisponível", "O IBGE não respondeu e não há dado em cache para este município.");
    }
  });
}

export function handleResumo(request: Request, ibge: string) {
  return withApiKey(request, "municipios", api(), async ({ scopes }) => {
    if (!isIbgeCode(ibge)) return problem(400, "Parâmetro inválido", "O código IBGE tem 7 dígitos (ex.: 3509502).");
    const sp = new URL(request.url).searchParams;
    const period = parsePeriod(sp.get("de"), sp.get("ate"), today());
    if ("error" in period) return problem(400, "Parâmetro inválido", period.error);
    const r = await getResumo(api(), realSources, Number(ibge), period.de, period.ate, {
      clima: scopes.includes("clima"),
      feriados: scopes.includes("feriados"),
    });
    const { fontes, ...dados } = r;
    return { ...dados, meta: meta(fontes) };
  });
}

export function handleFeriados(request: Request, ano: string) {
  return withApiKey(request, "feriados", api(), async () => {
    const n = Number(ano);
    if (!/^\d{4}$/.test(ano) || n < 1900 || n > 2199) return problem(400, "Parâmetro inválido", "Ano entre 1900 e 2199.");
    try {
      const r = await getFeriados(api(), realSources, n);
      return { dados: r.data, meta: meta([{ fonte: "BrasilAPI", origem: r.origem, obtido_em: r.obtido_em, valido_ate: r.valido_ate }]) };
    } catch {
      return problem(502, "Fonte indisponível", "A BrasilAPI não respondeu e não há dado em cache para este ano.");
    }
  });
}
