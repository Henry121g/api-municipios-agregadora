// Agregação: município (IBGE) + clima (Open-Meteo) + feriados (BrasilAPI), com resposta parcial.
import { cached, type CachePolicy, type CacheStore, type Sourced } from "./cache";
import { SourceError } from "./http";
import {
  fetchClima,
  fetchCoordenadas,
  fetchFeriados,
  fetchMunicipio,
  fetchMunicipiosDaUf,
  type Clima,
  type Coordenadas,
  type Feriado,
  type Municipio,
} from "./sources";

const DAY = 86_400;
export const POLICIES = {
  municipio: { ttlSeconds: 7 * DAY, staleSeconds: 30 * DAY },
  lista_uf: { ttlSeconds: 7 * DAY, staleSeconds: 30 * DAY },
  coordenadas: { ttlSeconds: 30 * DAY, staleSeconds: 180 * DAY },
  clima: { ttlSeconds: 30 * 60, staleSeconds: 6 * 3600 },
  feriados: { ttlSeconds: 7 * DAY, staleSeconds: 365 * DAY },
} satisfies Record<string, CachePolicy>;

/** Funções de busca injetáveis (testes simulam falhas por fonte). */
export interface Sources {
  municipio: (ibge: number) => Promise<Municipio>;
  municipiosDaUf: (uf: string) => Promise<Municipio[]>;
  coordenadas: (m: Municipio) => Promise<Coordenadas>;
  clima: (c: Coordenadas) => Promise<Clima>;
  feriados: (ano: number) => Promise<Feriado[]>;
}

export const realSources: Sources = {
  municipio: (ibge) => fetchMunicipio(ibge),
  municipiosDaUf: (uf) => fetchMunicipiosDaUf(uf),
  coordenadas: (m) => fetchCoordenadas(m),
  clima: (c) => fetchClima(c),
  feriados: (ano) => fetchFeriados(ano),
};

export interface SourceStatus {
  fonte: string;
  origem: Sourced<unknown>["origem"] | "indisponivel" | "sem_escopo";
  obtido_em: string | null;
  valido_ate: string | null;
  aviso?: string;
  erro?: string;
}

function describeError(err: unknown): string {
  if (err instanceof SourceError) {
    if (err.kind === "timeout") return "a fonte não respondeu a tempo";
    if (err.kind === "http" && err.status === 404) return "não encontrado na fonte";
    if (err.kind === "http") return `a fonte respondeu com erro (${err.status})`;
    if (err.kind === "formato") return err.message;
    return "falha de rede ao acessar a fonte";
  }
  return "erro inesperado ao consultar a fonte";
}

function status(fonte: string, r: PromiseSettledResult<Sourced<unknown>>): SourceStatus {
  return r.status === "fulfilled"
    ? { fonte, origem: r.value.origem, obtido_em: r.value.obtido_em, valido_ate: r.value.valido_ate, ...(r.value.aviso ? { aviso: r.value.aviso } : {}) }
    : { fonte, origem: "indisponivel", obtido_em: null, valido_ate: null, erro: describeError(r.reason) };
}

export async function getMunicipio(store: CacheStore, src: Sources, ibge: number) {
  return cached(store, `ibge:municipio:${ibge}`, POLICIES.municipio, () => src.municipio(ibge));
}

export async function getFeriados(store: CacheStore, src: Sources, ano: number) {
  return cached(store, `brasilapi:feriados:${ano}`, POLICIES.feriados, () => src.feriados(ano));
}

export interface ListaQuery {
  uf: string;
  nome?: string;
  pagina: number;
  porPagina: number;
}

export async function listMunicipios(store: CacheStore, src: Sources, q: ListaQuery) {
  const res = await cached(store, `ibge:uf:${q.uf}`, POLICIES.lista_uf, () => src.municipiosDaUf(q.uf));
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const filtrados = q.nome ? res.data.filter((m) => norm(m.nome).includes(norm(q.nome!))) : res.data;
  const ordenados = [...filtrados].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const total = ordenados.length;
  const inicio = (q.pagina - 1) * q.porPagina;
  return {
    dados: ordenados.slice(inicio, inicio + q.porPagina),
    paginacao: { pagina: q.pagina, por_pagina: q.porPagina, total, total_paginas: Math.max(1, Math.ceil(total / q.porPagina)) },
    fonte: status("IBGE", { status: "fulfilled", value: res }),
  };
}

export interface Resumo {
  municipio: Municipio | null;
  clima: Clima | null;
  feriados: Feriado[] | null;
  periodo: { de: string; ate: string };
  parcial: boolean;
  fontes: SourceStatus[];
}

/**
 * Município e feriados rodam em paralelo; o clima depende das coordenadas, que dependem do nome/UF do
 * município (as coordenadas ficam em cache por 30 dias, então o clima segue funcionando mesmo se o IBGE
 * cair depois da primeira consulta). Qualquer fonte que falhe vira `null` + erro — nunca dado inventado.
 */
export async function getResumo(
  store: CacheStore,
  src: Sources,
  ibge: number,
  de: string,
  ate: string,
  incluir: { clima: boolean; feriados: boolean } = { clima: true, feriados: true },
): Promise<Resumo> {
  const anos = [...new Set([Number(de.slice(0, 4)), Number(ate.slice(0, 4))])];
  const municipioP = getMunicipio(store, src, ibge);
  const skip = Promise.reject(new Error("sem_escopo"));
  skip.catch(() => {});
  const feriadosP = !incluir.feriados ? skip : Promise.all(anos.map((a) => getFeriados(store, src, a))).then((list) => ({
    ...list[0],
    // Combina os anos; a origem mais "fraca" prevalece (se algum ano veio de cache expirado, avisa).
    origem: list.some((l) => l.origem === "cache_expirado") ? ("cache_expirado" as const) : list.some((l) => l.origem === "fonte") ? ("fonte" as const) : ("cache" as const),
    data: list.flatMap((l) => l.data).filter((f) => f.data >= de && f.data <= ate),
  }));

  const climaP = !incluir.clima ? skip : (async () => {
    // Coordenadas em cache não esperam o IBGE; se vencidas, o loader usa o nome/UF do município.
    const coords: Sourced<Coordenadas> = await cached(store, `geo:${ibge}`, POLICIES.coordenadas, async () =>
      src.coordenadas((await municipioP).data),
    );
    const key = `clima:${coords.data.latitude.toFixed(3)},${coords.data.longitude.toFixed(3)}`;
    return cached(store, key, POLICIES.clima, () => src.clima(coords.data));
  })();

  const [m, c, f] = await Promise.allSettled([municipioP, climaP, feriadosP]);
  const semEscopo = (fonte: string): SourceStatus => ({ fonte, origem: "sem_escopo", obtido_em: null, valido_ate: null, aviso: "A chave não tem o escopo desta fonte." });
  const fontes = [
    status("IBGE", m),
    incluir.clima ? status("Open-Meteo", c) : semEscopo("Open-Meteo"),
    incluir.feriados ? status("BrasilAPI", f) : semEscopo("BrasilAPI"),
  ];
  return {
    municipio: m.status === "fulfilled" ? m.value.data : null,
    clima: c.status === "fulfilled" ? c.value.data : null,
    feriados: f.status === "fulfilled" ? f.value.data : null,
    periodo: { de, ate },
    parcial: fontes.some((s) => s.origem === "indisponivel"),
    fontes,
  };
}
