import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { getViewer } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "API de Municípios — dados do IBGE, clima e feriados", template: "%s · API de Municípios" },
  description: "Projeto de portfólio: API agregadora de dados públicos de municípios com Next.js e Supabase. Dados fictícios.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  const navLink = "rounded-md px-2 py-1.5 hover:bg-surface";

  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
        >
          Pular para o conteúdo
        </a>
        <div role="note" className="bg-foreground px-4 py-1.5 text-center text-xs text-background">
          Projeto de portfólio com dados fictícios — os dados vêm de APIs públicas reais; contas e chaves são de teste.
        </div>
        <header className="border-b border-border">
          <nav
            aria-label="Principal"
            className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm"
          >
            <Link href={viewer ? "/painel" : "/"} className="mr-auto text-base font-bold text-brand">
              ⌗ API de Municípios
            </Link>
            {viewer ? (
              <>
                <Link href="/docs" className={navLink}>Documentação</Link>
                <Link href="/demo" className={navLink}>Demonstração</Link>
                <Link href="/painel" className={navLink}>Minhas chaves</Link>
                <form action={signOut}>
                  <button type="submit" className={navLink}>
                    Sair <span className="sr-only">da conta de {viewer.fullName}</span>
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/docs" className={navLink}>Documentação</Link>
                <Link href="/demo" className={navLink}>Demonstração</Link>
                <Link href="/entrar" className={navLink}>Entrar</Link>
                <Link href="/cadastrar" className={navLink}>Criar conta</Link>
              </>
            )}
          </nav>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted">
          Projeto de portfólio desenvolvido com assistência de IA (Claude Code). Fontes: IBGE, Open-Meteo.com (CC BY 4.0) e BrasilAPI.
        </footer>
      </body>
    </html>
  );
}
