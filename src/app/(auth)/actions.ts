"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { friendlyAuthError } from "@/lib/errors";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

const signInSchema = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha."),
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]);
    out[key] ??= issue.message;
  }
  return out;
}

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: friendlyAuthError(error) };
  redirect(safeNext(formData.get("proximo")));
}

const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome.").max(100, "Nome muito longo."),
  email: z.email("Informe um e-mail válido."),
  password: z
    .string()
    .min(8, "A senha precisa ter ao menos 8 caracteres.")
    .regex(/[a-zA-Z]/, "Inclua ao menos uma letra.")
    .regex(/[0-9]/, "Inclua ao menos um número."),
});

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // O trigger do banco cria o perfil de desenvolvedor.
      data: { app: "api", full_name: parsed.data.fullName },
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  });
  if (error) return { error: friendlyAuthError(error) };
  if (data.session) redirect("/painel");
  return {
    success: "Conta criada! Enviamos um link de confirmação para o seu e-mail. Confirme para entrar.",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
