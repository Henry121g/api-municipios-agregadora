"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface KeyState {
  error?: string;
  createdKey?: string;
}

const MESSAGES: Record<string, string> = {
  LIMITE_DE_CHAVES: "Você já tem 5 chaves ativas. Revogue uma para criar outra.",
  ESCOPO_INVALIDO: "Escolha ao menos um escopo.",
};

export async function createKey(_: KeyState, formData: FormData): Promise<KeyState> {
  await requireViewer("/painel");
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Dê um nome à chave (ex.: “meu app”).").max(60),
      scopes: z.array(z.enum(["municipios", "clima", "feriados"])).min(1, "Escolha ao menos um escopo."),
    })
    .safeParse({ name: formData.get("name"), scopes: formData.getAll("scopes") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_key", { p_name: parsed.data.name, p_scopes: parsed.data.scopes });
  if (error) {
    const key = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    return { error: key ? MESSAGES[key] : "Não foi possível criar a chave. Tente novamente." };
  }
  revalidatePath("/painel");
  return { createdKey: (data as { key: string }[])[0].key };
}

export async function revokeKey(formData: FormData) {
  await requireViewer("/painel");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("keys").update({ revoked_at: new Date().toISOString() }).eq("id", id.data);
  revalidatePath("/painel");
}
