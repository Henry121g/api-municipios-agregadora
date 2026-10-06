"use client";

import { useActionState, useState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui";
import { buttonStyles } from "@/components/button-styles";
import { createKey } from "./actions";

export function CreateKeyForm() {
  const [state, action] = useActionState(createKey, {});
  const [copied, setCopied] = useState(false);

  if (state.createdKey) {
    return (
      <Alert kind="success">
        <p className="font-semibold">Chave criada. Copie agora — ela não será mostrada de novo.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="break-all rounded bg-surface px-2 py-1 text-xs text-foreground">{state.createdKey}</code>
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={async () => {
              await navigator.clipboard.writeText(state.createdKey!);
              setCopied(true);
            }}
          >
            {copied ? "Copiada!" : "Copiar chave"}
          </button>
        </div>
        <p className="mt-2 text-xs">Guarde em variável de ambiente; nunca no código ou no navegador.</p>
      </Alert>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Nome da chave" name="name" required maxLength={60} placeholder="meu app" />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Escopos</legend>
        <div className="flex flex-wrap gap-2">
          {[
            ["municipios", "Municípios (obrigatório para /resumo)"],
            ["clima", "Clima"],
            ["feriados", "Feriados"],
          ].map(([v, label]) => (
            <label key={v} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
              <input type="checkbox" name="scopes" value={v} defaultChecked /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <SubmitButton pendingLabel="Criando…" className="self-start">Criar chave</SubmitButton>
    </form>
  );
}
