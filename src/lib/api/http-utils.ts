// Utilitários das rotas: chave de API, erros RFC 9457 e validação de parâmetros.
import { createHash, randomUUID } from "node:crypto";

export type Scope = "municipios" | "clima" | "feriados";

/** Lê a chave de `Authorization: Bearer <chave>` ou `X-API-Key`. */
export function readApiKey(headers: Headers): string | null {
  const auth = headers.get("authorization");
  const bearer = auth?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const key = bearer ?? headers.get("x-api-key")?.trim() ?? null;
  return key && /^mun_[0-9a-f]{64}$/.test(key) ? key : key ? "invalida" : null;
}

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
}

/** Resposta de erro no formato application/problem+json (RFC 9457). */
export function problem(status: number, title: string, detail: string, headers: Record<string, string> = {}): Response {
  const body: Problem = { type: `https://httpstatuses.io/${status}`, title, status, detail, instance: randomUUID() };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/problem+json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export const isIbgeCode = (v: string) => /^\d{7}$/.test(v);
export const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Período padrão: hoje + 6 dias (o mesmo horizonte da previsão). Máximo de 366 dias. */
export function parsePeriod(de: string | null, ate: string | null, today: string): { de: string; ate: string } | { error: string } {
  const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  if ((de && !isDate(de)) || (ate && !isDate(ate))) return { error: "Datas devem estar no formato AAAA-MM-DD." };
  const from = de ?? today;
  const to = ate ?? addDays(from, 6);
  if (from > to) return { error: "`de` deve ser anterior ou igual a `ate`." };
  if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000) return { error: "O período máximo é de 366 dias." };
  return { de: from, ate: to };
}
