import type { Metadata } from "next";
import Link from "next/link";
import { signUp } from "../actions";
import { SignUpForm } from "../auth-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-2 text-2xl font-bold">Criar conta</h1>
      <p className="mb-6 text-sm text-muted">Com a conta você cria e revoga chaves de API e acompanha o uso.</p>
      <SignUpForm action={signUp} />
      <p className="mt-6 text-sm">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-brand underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
