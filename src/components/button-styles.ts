// Classes de botão. Fica fora de ui.tsx ("use client") para funcionar também em Server Components.
const base =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold min-h-11 disabled:opacity-60 disabled:cursor-not-allowed";

export const buttonStyles = {
  primary: `${base} bg-brand text-brand-foreground hover:brightness-110`,
  secondary: `${base} border border-border bg-surface text-foreground hover:bg-background`,
  danger: `${base} border border-danger text-danger hover:bg-danger-bg`,
};
