import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 py-10">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <Link href="/" className="font-semibold text-brand underline">
        Voltar ao início
      </Link>
    </div>
  );
}
