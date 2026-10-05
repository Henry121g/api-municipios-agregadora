import type { Metadata } from "next";
import Link from "next/link";
import { safeNext } from "@/lib/safe-next";
import { signIn } from "../actions";
import { SignInForm } from "../auth-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignInPage({ searchParams }: PageProps<"/entrar">) {
  const { proximo } = await searchParams;
  const next = safeNext(typeof proximo === "string" ? proximo : null);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Entrar</h1>
      <SignInForm action={signIn} next={next} />
      <p className="mt-6 text-sm">
        Não tem conta?{" "}
        <Link href="/cadastrar" className="font-semibold text-brand underline">
          Cadastre-se
        </Link>
      </p>
      <section aria-labelledby="demo" className="mt-8 rounded-xl border border-border bg-surface p-4 text-sm">
        <h2 id="demo" className="font-semibold">Só quer ver a API funcionando?</h2>
        <p className="mt-1 text-muted">
          A <Link href="/demo" className="underline">demonstração</Link> não exige conta. Para usar a API no seu código,
          crie uma conta e gere uma chave.
        </p>
      </section>
    </div>
  );
}
