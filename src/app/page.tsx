import Link from "next/link";
import { buttonStyles } from "@/components/ui";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col items-start gap-4 py-6">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">Município, clima e feriados numa única chamada.</h1>
        <p className="max-w-xl text-lg text-muted">
          Uma API que junta IBGE, Open-Meteo e BrasilAPI numa resposta normalizada — e diz, para cada fonte, se o dado é
          fresco, do cache ou um cache expirado porque a fonte caiu.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/demo" className={buttonStyles.primary}>Ver demonstração</Link>
          <Link href="/docs" className={buttonStyles.secondary}>Documentação</Link>
          <Link href="/cadastrar" className={buttonStyles.secondary}>Criar chave de API</Link>
        </div>
      </section>
      <section aria-labelledby="destaques" className="grid gap-4 sm:grid-cols-3">
        <h2 id="destaques" className="sr-only">Destaques</h2>
        {[
          ["Funciona mesmo com fonte fora do ar", "Se o clima falhar, você recebe município e feriados, com o erro da fonte indicado. Nada é inventado."],
          ["Cache e limite entre instâncias", "Cache com validade e contador de requisições ficam no Postgres, valendo para todas as instâncias serverless."],
          ["Chaves seguras", "A chave aparece uma única vez; guardamos só o hash. Escopos por chave e revogação imediata."],
        ].map(([title, text]) => (
          <div key={title} className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
