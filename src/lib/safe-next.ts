/** Só aceita caminhos internos: impede redirecionamento para sites externos (open redirect). */
export function safeNext(value: FormDataEntryValue | string | null | undefined): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/painel";
}
