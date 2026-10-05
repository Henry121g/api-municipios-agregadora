"use client";

import { useActionState } from "react";
import { Alert, SubmitButton } from "@/components/ui";
import { demoList, demoResumo } from "./actions";

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

interface Fonte {
  fonte: string;
  origem: string;
  obtido_em: string | null;
  valido_ate: string | null;
  aviso?: string;
  erro?: string;
}

const ORIGEM: Record<string, { label: string; cls: string }> = {
  fonte: { label: "Atualizado agora", cls: "bg-success-bg text-success" },
  cache: { label: "Do cache (válido)", cls: "bg-background text-foreground border border-border" },
  cache_expirado: { label: "Cache expirado (fonte fora do ar)", cls: "bg-danger-bg text-danger" },
  indisponivel: { label: "Indisponível", cls: "bg-danger-bg text-danger" },
  sem_escopo: { label: "Sem escopo", cls: "bg-background text-muted border border-border" },
};

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—");

export function DemoClient() {
  const [list, listAction] = useActionState(demoList, {});
  const [resumo, resumoAction] = useActionState(demoResumo, {});
  const select = "min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-base";

  const municipios = (list.body as { dados?: { ibge: number; nome: string; uf: { sigla: string } }[] } | undefined)?.dados ?? [];
  const r = resumo.body as
    | {
        municipio: { nome: string; uf: { sigla: string; nome: string }; regiao: { nome: string }; microrregiao: string | null } | null;
        clima: { atual: { temperatura_c: number; condicao: string } | null; dias: { data: string; minima_c: number; maxima_c: number; chance_chuva_pct: number | null; condicao: string }[]; atribuicao: string } | null;
        feriados: { data: string; nome: string; dia_da_semana: string | null }[] | null;
        periodo: { de: string; ate: string };
        parcial: boolean;
        meta: { fontes: Fonte[] };
        title?: string;
        detail?: string;
      }
    | undefined;

  return (
    <div className="flex flex-col gap-6">
      <form action={listAction} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          UF
          <select name="uf" defaultValue="SP" className={select}>
            {UFS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Nome contém (opcional)
          <input name="nome" maxLength={60} placeholder="ex.: campinas" className={select} />
        </label>
        <SubmitButton pendingLabel="Buscando…">Buscar municípios</SubmitButton>
      </form>
      {list.error && <Alert kind="error">{list.error}</Alert>}
      {list.status && list.status !== 200 && <Alert kind="error">Erro {list.status}: {(list.body as { detail?: string })?.detail}</Alert>}

      {municipios.length > 0 && (
        <form action={resumoAction} className="flex flex-col gap-2">
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-1.5 text-sm font-medium">Escolha o município (código IBGE)</legend>
            {municipios.map((m) => (
              <button key={m.ibge} name="ibge" value={m.ibge} type="submit" className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm hover:border-brand">
                {m.nome} <span className="text-muted">({m.ibge})</span>
              </button>
            ))}
          </fieldset>
          {list.rate?.remaining && <p className="text-xs text-muted">Limite da chave de demonstração: {list.rate.remaining} de {list.rate.limit} requisições restantes neste minuto.</p>}
        </form>
      )}

      {resumo.error && <Alert kind="error">{resumo.error}</Alert>}
      {resumo.status && resumo.status !== 200 && <Alert kind="error">Erro {resumo.status}: {r?.detail}</Alert>}

      {r && resumo.status === 200 && (
        <section aria-labelledby="resultado" className="flex flex-col gap-4" aria-live="polite">
          <h2 id="resultado" className="text-xl font-semibold">
            {r.municipio ? `${r.municipio.nome} — ${r.municipio.uf.sigla}` : "Município indisponível"}
          </h2>
          {r.parcial && <Alert kind="error">Resposta parcial: uma das fontes falhou. As demais informações continuam válidas.</Alert>}

          <ul className="grid gap-2 sm:grid-cols-3" aria-label="Situação de cada fonte">
            {r.meta.fontes.map((f) => (
              <li key={f.fonte} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="font-semibold">{f.fonte}</p>
                <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${ORIGEM[f.origem]?.cls}`}>{ORIGEM[f.origem]?.label ?? f.origem}</span>
                <p className="mt-1 text-xs text-muted">Obtido: {hora(f.obtido_em)} · válido até: {hora(f.valido_ate)}</p>
                {(f.erro || f.aviso) && <p className="mt-1 text-xs">{f.erro ?? f.aviso}</p>}
              </li>
            ))}
          </ul>

          {r.municipio && (
            <p className="text-sm">
              {r.municipio.uf.nome}, região {r.municipio.regiao.nome}
              {r.municipio.microrregiao && ` · microrregião ${r.municipio.microrregiao}`}
            </p>
          )}

          {r.clima && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="mb-2 font-semibold">
                Clima {r.clima.atual && <span className="font-normal">— agora {r.clima.atual.temperatura_c} °C, {r.clima.atual.condicao.toLowerCase()}</span>}
              </h3>
              <table className="w-full text-sm">
                <caption className="sr-only">Previsão diária</caption>
                <thead className="text-left text-muted">
                  <tr><th scope="col">Dia</th><th scope="col">Condição</th><th scope="col" className="text-right">Mín/Máx</th><th scope="col" className="text-right">Chuva</th></tr>
                </thead>
                <tbody>
                  {r.clima.dias.map((d) => (
                    <tr key={d.data}>
                      <td>{d.data.split("-").reverse().slice(0, 2).join("/")}</td>
                      <td>{d.condicao}</td>
                      <td className="text-right">{Math.round(d.minima_c)}° / {Math.round(d.maxima_c)}°</td>
                      <td className="text-right">{d.chance_chuva_pct ?? "—"}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">{r.clima.atribuicao}</p>
            </div>
          )}

          {r.feriados && (
            <div className="rounded-xl border border-border bg-surface p-4 text-sm">
              <h3 className="mb-2 font-semibold">Feriados nacionais de {r.periodo.de.split("-").reverse().join("/")} a {r.periodo.ate.split("-").reverse().join("/")}</h3>
              {r.feriados.length ? (
                <ul>{r.feriados.map((f) => <li key={f.data}>{f.data.split("-").reverse().join("/")} — {f.nome}{f.dia_da_semana && ` (${f.dia_da_semana})`}</li>)}</ul>
              ) : (
                <p className="text-muted">Nenhum feriado nacional no período.</p>
              )}
            </div>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Ver JSON da resposta</summary>
            <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-surface p-3 text-xs">{JSON.stringify(r, null, 2)}</pre>
          </details>
        </section>
      )}
    </div>
  );
}
