import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { buttonStyles } from "@/components/button-styles";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revokeKey } from "./actions";
import { CreateKeyForm } from "./create-key-form";

export const metadata: Metadata = { title: "Minhas chaves" };

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "nunca";

export default async function KeysPage() {
  const viewer = await requireViewer("/painel");
  const supabase = await createClient();
  const [{ data: keys, error }, { data: usage }] = await Promise.all([
    supabase.from("keys").select("id, name, prefix, scopes, rate_limit_per_minute, created_at, last_used_at, revoked_at").order("created_at", { ascending: false }),
    supabase.from("usage_daily").select("key_id, day, requests, limited").order("day", { ascending: false }).limit(200),
  ]);
  const active = (keys ?? []).filter((k) => !k.revoked_at);
  const revoked = (keys ?? []).filter((k) => k.revoked_at);
  const usageOf = (id: string) => (usage ?? []).filter((u) => u.key_id === id).slice(0, 7);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">Minhas chaves</h1>
        <p className="text-sm text-muted">
          Olá, {viewer.fullName}. Até 5 chaves ativas, 60 requisições por minuto cada. Veja como usar na{" "}
          <Link href="/docs" className="underline">documentação</Link>.
        </p>
      </header>

      <section aria-labelledby="nova-chave" className="rounded-xl border border-border bg-surface p-4">
        <h2 id="nova-chave" className="mb-3 font-semibold">Nova chave</h2>
        <CreateKeyForm />
      </section>

      <section aria-labelledby="ativas" className="flex flex-col gap-3">
        <h2 id="ativas" className="text-lg font-semibold">Chaves ativas ({active.length}/5)</h2>
        {error && <p role="alert" className="text-danger">Não foi possível carregar suas chaves.</p>}
        {active.length === 0 ? (
          <EmptyState title="Nenhuma chave ativa." />
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((k) => {
              const u = usageOf(k.id);
              return (
                <li key={k.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p>
                      <span className="font-semibold">{k.name}</span> <code className="text-muted">{k.prefix}…</code>
                    </p>
                    <form action={revokeKey}>
                      <input type="hidden" name="id" value={k.id} />
                      <button className={buttonStyles.danger}>Revogar <span className="sr-only">{k.name}</span></button>
                    </form>
                  </div>
                  <p className="text-muted">
                    Escopos: {k.scopes.join(", ")} · {k.rate_limit_per_minute}/min · criada em {fmt(k.created_at)} · último uso: {fmt(k.last_used_at)}
                  </p>
                  {u.length > 0 && (
                    <table className="mt-1 w-full max-w-md text-xs">
                      <caption className="text-left text-muted">Uso nos últimos dias</caption>
                      <thead className="text-left text-muted">
                        <tr><th scope="col">Dia</th><th scope="col" className="text-right">Requisições</th><th scope="col" className="text-right">Bloqueadas por limite</th></tr>
                      </thead>
                      <tbody>
                        {u.map((d) => (
                          <tr key={d.day}>
                            <td>{d.day.split("-").reverse().join("/")}</td>
                            <td className="text-right">{d.requests}</td>
                            <td className="text-right">{d.limited}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {revoked.length > 0 && (
        <section aria-labelledby="revogadas">
          <h2 id="revogadas" className="mb-2 text-lg font-semibold">Revogadas</h2>
          <ul className="text-sm text-muted">
            {revoked.map((k) => (
              <li key={k.id}>{k.name} <code>{k.prefix}…</code> — revogada em {fmt(k.revoked_at)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
