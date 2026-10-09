// Cliente HTTP para as fontes externas: timeout por tentativa, novas tentativas limitadas apenas para
// erros transitórios (rede, timeout, 5xx, 429) com espera crescente, e erros tipados.

export type SourceErrorKind = "timeout" | "rede" | "http" | "formato";

export class SourceError extends Error {
  constructor(
    public readonly kind: SourceErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SourceError";
  }
  get transient() {
    return this.kind === "timeout" || this.kind === "rede" || (this.kind === "http" && (this.status! >= 500 || this.status === 429));
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Somente ASCII: com acento (ex.: "portfólio") o IBGE responde 400 a qualquer requisição. */
export const USER_AGENT = "portfolio-api-municipios (projeto de portfolio)";

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const { timeoutMs = 3000, retries = 2, backoffMs = 250, fetchImpl = fetch, sleep = defaultSleep } = opts;
  let lastError: SourceError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1)); // 250 ms, 500 ms
    try {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      });
      if (!res.ok) {
        lastError = new SourceError("http", `HTTP ${res.status}`, res.status);
      } else {
        try {
          return (await res.json()) as T;
        } catch {
          throw new SourceError("formato", "resposta não é JSON válido");
        }
      }
    } catch (err) {
      if (err instanceof SourceError) {
        if (!err.transient) throw err;
        lastError = err;
      } else if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        lastError = new SourceError("timeout", `sem resposta em ${timeoutMs} ms`);
      } else {
        lastError = new SourceError("rede", err instanceof Error ? err.message : "falha de rede");
      }
    }
    if (lastError && !lastError.transient) throw lastError;
  }
  throw lastError ?? new SourceError("rede", "falha desconhecida");
}
