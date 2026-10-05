import type { Metadata } from "next";
import Link from "next/link";
import { openapi } from "@/lib/api/openapi";
import { TryIt } from "./try-it";

export const metadata: Metadata = { title: "Documentação" };

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const curl = (path: string) => `curl -s "${BASE}/api/v1${path}" \\\n  -H "Authorization: Bearer $API_MUNICIPIOS_KEY"`;

export default function DocsPage() {
  const paths = Object.entries(openapi.paths) as [string, { get: { summary: string; description: string } }][];
  const exemplo: Record<string, string> = {
    "/municipios": "/municipios?uf=SP&nome=campinas&pagina=1&por_pagina=20",
    "/municipios/{ibge}": "/municipios/3509502",
    "/municipios/{ibge}/resumo": "/municipios/3509502/resumo?de=2026-10-05&ate=2026-10-11",
    "/feriados/{ano}": "/feriados/2026",
  };

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">Documentação</h1>
        <p className="mt-1 text-sm text-muted">
          Especificação completa: <a href="/api/v1/openapi.json" className="underline">OpenAPI 3.1 (JSON)</a>. Crie sua chave em{" "}
          <Link href="/painel" className="underline">Minhas chaves</Link>.
        </p>
      </header>

      <section aria-labelledby="auth" className="flex flex-col gap-2 text-sm">
        <h2 id="auth" className="text-lg font-semibold">Autenticação e limites</h2>
        <ul className="list-inside list-disc text-muted">
          <li>Envie a chave em <code>Authorization: Bearer mun_…</code> ou <code>X-API-Key</code>.</li>
          <li>60 requisições por minuto por chave; veja <code>X-RateLimit-Remaining</code> e, ao exceder, <code>429</code> com <code>Retry-After</code>.</li>
          <li>Erros seguem <code>application/problem+json</code> (RFC 9457), com mensagens em português.</li>
          <li>Cada fonte informa <code>origem</code>: <code>fonte</code>, <code>cache</code>, <code>cache_expirado</code>, <code>indisponivel</code> ou <code>sem_escopo</code>.</li>
        </ul>
      </section>

      <section aria-labelledby="endpoints" className="flex flex-col gap-4">
        <h2 id="endpoints" className="text-lg font-semibold">Endpoints</h2>
        {paths.map(([path, op]) => (
          <article key={path} className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-mono text-sm font-semibold">GET /api/v1{path}</h3>
            <p className="mt-1 text-sm">{op.get.summary}</p>
            <p className="mt-1 text-sm text-muted">{op.get.description}</p>
            <pre className="mt-2 overflow-auto rounded-lg bg-background p-3 text-xs">{curl(exemplo[path])}</pre>
          </article>
        ))}
      </section>

      <section aria-labelledby="testar" className="flex flex-col gap-3">
        <h2 id="testar" className="text-lg font-semibold">Testar agora</h2>
        <TryIt />
      </section>
    </div>
  );
}
