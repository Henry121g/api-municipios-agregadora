import type { Metadata } from "next";
import { DemoClient } from "./demo-client";

export const metadata: Metadata = { title: "Demonstração" };

export default function DemoPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Demonstração</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Busque um município e veja o resumo agregado dos próximos 7 dias. Os dados vêm das APIs públicas reais; repita a
          consulta para ver as fontes passarem de “Atualizado agora” para “Do cache”. A demonstração usa uma chave com
          limite próprio, guardada no servidor.
        </p>
      </header>
      <DemoClient />
    </div>
  );
}
