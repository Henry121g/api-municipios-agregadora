"use client";

import { useEffect } from "react";
import { buttonStyles } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Sentry captura via instrumentation; aqui apenas registramos o identificador.
    console.error("Erro na página", error.digest);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-start gap-4 py-10">
      <h1 className="text-2xl font-bold">Algo deu errado</h1>
      <p className="text-muted">
        Não conseguimos carregar esta página. Tente novamente; se persistir, volte mais tarde.
        {error.digest && <span className="block text-xs">Código: {error.digest}</span>}
      </p>
      <button type="button" onClick={reset} className={buttonStyles.primary}>
        Tentar novamente
      </button>
    </div>
  );
}
