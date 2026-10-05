"use client";

import { useState } from "react";
import { Alert, buttonStyles } from "@/components/ui";

const EXAMPLES = [
  "/api/v1/municipios?uf=SP&nome=campinas",
  "/api/v1/municipios/3509502",
  "/api/v1/municipios/3509502/resumo",
  "/api/v1/feriados/2026",
];

/** Executa uma requisição real com a SUA chave (ela fica só na memória desta aba). */
export function TryIt() {
  const [key, setKey] = useState("");
  const [path, setPath] = useState(EXAMPLES[2]);
  const [out, setOut] = useState<{ status: number; headers: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const input = "min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-base";

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!path.startsWith("/api/v1/")) return setError("O caminho deve começar com /api/v1/.");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(path, { headers: key ? { Authorization: `Bearer ${key.trim()}` } : {} });
      const headers = ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "retry-after", "content-type"]
        .map((h) => (res.headers.get(h) ? `${h}: ${res.headers.get(h)}` : null))
        .filter(Boolean)
        .join("\n");
      const text = await res.text();
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {}
      setOut({ status: res.status, headers, body });
    } catch {
      setError("Falha de rede ao chamar a API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={run} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Sua chave (não é enviada a nenhum outro lugar)
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="mun_…" autoComplete="off" className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Requisição GET
        <input value={path} onChange={(e) => setPath(e.target.value)} list="exemplos" className={`${input} font-mono text-sm`} />
        <datalist id="exemplos">{EXAMPLES.map((e) => <option key={e} value={e} />)}</datalist>
      </label>
      <button type="submit" className={`${buttonStyles.primary} self-start`} disabled={loading}>{loading ? "Enviando…" : "Enviar"}</button>
      {error && <Alert kind="error">{error}</Alert>}
      {out && (
        <div aria-live="polite" className="flex flex-col gap-2 text-sm">
          <p className="font-semibold">HTTP {out.status}</p>
          {out.headers && <pre className="overflow-auto rounded-lg bg-background p-3 text-xs">{out.headers}</pre>}
          <pre className="max-h-96 overflow-auto rounded-lg bg-background p-3 text-xs">{out.body}</pre>
        </div>
      )}
    </form>
  );
}
