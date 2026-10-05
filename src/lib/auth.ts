import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";


export interface Viewer {
  id: string;
  email: string | null;
  fullName: string;
}

/** Usuário autenticado (validado via getClaims) com perfil neste app. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", claims.sub).maybeSingle();
  if (!profile) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null, fullName: profile.full_name };
});

export async function requireViewer(next: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/entrar?proximo=${encodeURIComponent(next)}`);
  return viewer;
}
