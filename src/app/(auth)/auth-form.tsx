"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui";
import type { FormState } from "./actions";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function SignInForm({ action, next }: { action: Action; next: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="proximo" value={next} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Entrando…">Entrar</SubmitButton>
    </form>
  );
}

export function SignUpForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  if (state.success) return <Alert kind="success">{state.success}</Alert>;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label="Nome completo" name="fullName" autoComplete="name" required error={state.fieldErrors?.fullName} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="Mínimo de 8 caracteres, com letras e números."
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Criando conta…">Criar conta</SubmitButton>
    </form>
  );
}
