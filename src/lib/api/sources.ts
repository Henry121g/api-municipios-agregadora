// Fontes externas: busca + normalização para o formato da nossa API (em português, sem campos crus).
import { fetchJson, SourceError, type FetchOptions } from "./http";

// ---------------------------------------------------------------- IBGE ----

export interface Municipio {
  ibge: number;
  nome: string;
  uf: { sigla: string; nome: string };
  regiao: { sigla: string; nome: string };
  microrregiao: string | null;
  regiao_imediata: string | null;
}

interface IbgeMunicipioRaw {
  id: number;
  nome: string;
  microrregiao?: { nome: string; mesorregiao?: { UF?: IbgeUfRaw } } | null;
  "regiao-imediata"?: { nome: string; "regiao-intermediaria"?: { UF?: IbgeUfRaw } } | null;
}
interface IbgeUfRaw {
  sigla: string;
  nome: string;
  regiao: { sigla: string; nome: string };
}

export function normalizeMunicipio(raw: IbgeMunicipioRaw): Municipio {
  // Alguns municípios recentes vêm sem microrregião; a UF também está na região imediata.
  const uf = raw.microrregiao?.mesorregiao?.UF ?? raw["regiao-imediata"]?.["regiao-intermediaria"]?.UF;
  if (!uf) throw new SourceError("formato", "IBGE: município sem UF");
  return {
    ibge: raw.id,
    nome: raw.nome,
    uf: { sigla: uf.sigla, nome: uf.nome },
    regiao: { sigla: uf.regiao.sigla, nome: uf.regiao.nome },
    microrregiao: raw.microrregiao?.nome ?? null,
    regiao_imediata: raw["regiao-imediata"]?.nome ?? null,
  };
}

const IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades";

export async function fetchMunicipio(ibge: number, opts?: FetchOptions): Promise<Municipio> {
  const raw = await fetchJson<IbgeMunicipioRaw | []>(`${IBGE}/municipios/${ibge}`, opts);
  // O IBGE responde 200 com [] para código inexistente.
  if (Array.isArray(raw)) throw new SourceError("http", "município não encontrado no IBGE", 404);
  return normalizeMunicipio(raw);
}

export async function fetchMunicipiosDaUf(uf: string, opts?: FetchOptions): Promise<Municipio[]> {
  const raw = await fetchJson<IbgeMunicipioRaw[]>(`${IBGE}/estados/${uf}/municipios`, opts);
  if (!Array.isArray(raw)) throw new SourceError("formato", "IBGE: lista inesperada");
  return raw.map(normalizeMunicipio);
}

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
  "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

// ------------------------------------------------------------ Open-Meteo ----

export interface Coordenadas {
  latitude: number;
  longitude: number;
  fuso: string;
}

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country_code: string;
  admin1?: string;
  feature_code?: string;
  population?: number;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Escolhe o resultado com o mesmo nome e a mesma UF (nome do estado); a busca é aproximada. */
export function pickCoordinates(results: GeoResult[] | undefined, municipio: Pick<Municipio, "nome" | "uf">): Coordenadas | null {
  const match = (results ?? [])
    .filter((r) => r.country_code === "BR" && norm(r.name) === norm(municipio.nome) && norm(r.admin1 ?? "") === norm(municipio.uf.nome))
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
  return match ? { latitude: match.latitude, longitude: match.longitude, fuso: match.timezone } : null;
}

export async function fetchCoordenadas(municipio: Pick<Municipio, "nome" | "uf">, opts?: FetchOptions): Promise<Coordenadas> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(municipio.nome)}&count=20&language=pt&countryCode=BR`;
  const raw = await fetchJson<{ results?: GeoResult[] }>(url, opts);
  const c = pickCoordinates(raw.results, municipio);
  if (!c) throw new SourceError("formato", `coordenadas não encontradas para ${municipio.nome}/${municipio.uf.sigla}`);
  return c;
}

export interface Clima {
  atual: { temperatura_c: number; vento_kmh: number | null; condicao: string; horario: string } | null;
  dias: { data: string; minima_c: number; maxima_c: number; chance_chuva_pct: number | null; chuva_mm: number | null; condicao: string }[];
  atribuicao: string;
}

interface ForecastRaw {
  current?: { time: string; temperature_2m: number; weather_code: number; wind_speed_10m?: number };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: (number | null)[];
    precipitation_sum?: (number | null)[];
    weather_code: number[];
  };
}

/** Códigos WMO usados pelo Open-Meteo → descrição em português. */
export function weatherCode(code: number): string {
  if (code === 0) return "Céu limpo";
  if (code <= 2) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if (code === 45 || code === 48) return "Neblina";
  if (code >= 51 && code <= 57) return "Garoa";
  if (code >= 61 && code <= 67) return "Chuva";
  if (code >= 71 && code <= 77) return "Neve";
  if (code >= 80 && code <= 82) return "Pancadas de chuva";
  if (code >= 95) return "Tempestade";
  return "Indefinido";
}

export function normalizeClima(raw: ForecastRaw): Clima {
  if (!raw.daily?.time) throw new SourceError("formato", "Open-Meteo: previsão diária ausente");
  const d = raw.daily;
  return {
    atual: raw.current
      ? {
          temperatura_c: raw.current.temperature_2m,
          vento_kmh: raw.current.wind_speed_10m ?? null,
          condicao: weatherCode(raw.current.weather_code),
          horario: raw.current.time,
        }
      : null,
    dias: d.time.map((data, i) => ({
      data,
      minima_c: d.temperature_2m_min[i],
      maxima_c: d.temperature_2m_max[i],
      chance_chuva_pct: d.precipitation_probability_max?.[i] ?? null,
      chuva_mm: d.precipitation_sum?.[i] ?? null,
      condicao: weatherCode(d.weather_code[i]),
    })),
    atribuicao: "Dados meteorológicos: Open-Meteo.com (CC BY 4.0)",
  };
}

export async function fetchClima(c: Coordenadas, opts?: FetchOptions): Promise<Clima> {
  const params = new URLSearchParams({
    latitude: String(c.latitude),
    longitude: String(c.longitude),
    current: "temperature_2m,weather_code,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code",
    timezone: c.fuso || "America/Sao_Paulo",
    forecast_days: "7",
  });
  return normalizeClima(await fetchJson<ForecastRaw>(`https://api.open-meteo.com/v1/forecast?${params}`, opts));
}

// ------------------------------------------------------------- BrasilAPI ----

export interface Feriado {
  data: string;
  nome: string;
  dia_da_semana: string | null;
}

export function normalizeFeriados(raw: { date: string; name: string; weekday?: string }[]): Feriado[] {
  if (!Array.isArray(raw)) throw new SourceError("formato", "BrasilAPI: lista inesperada");
  return raw
    .map((f) => ({ data: f.date, nome: f.name, dia_da_semana: f.weekday ?? null }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

export async function fetchFeriados(ano: number, opts?: FetchOptions): Promise<Feriado[]> {
  return normalizeFeriados(await fetchJson(`https://brasilapi.com.br/api/feriados/v1/${ano}`, opts));
}
