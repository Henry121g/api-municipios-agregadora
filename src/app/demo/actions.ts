"use server";

import { z } from "zod";
import { handleList, handleResumo } from "@/lib/api/routes";

// A demonstração usa o MESMO caminho da API pública (chave, limite, cache, fontes), com uma chave de
// demonstração guardada só no servidor — ela nunca chega ao navegador.

export interface DemoResult {
  error?: string;
  status?: number;
  body?: unknown;
  rate?: { limit: string | null; remaining: string | null };
}

function demoRequest(path: string): Request | null {
  const key = process.env.DEMO_API_KEY;
  if (!key) return null;
  return new Request(`http://demo.interno${path}`, { headers: { "x-api-key": key } });
}

async function toResult(res: Response): Promise<DemoResult> {
  return {
    status: res.status,
    body: await res.json(),
    rate: { limit: res.headers.get("x-ratelimit-limit"), remaining: res.headers.get("x-ratelimit-remaining") },
  };
}

const PENDENTE = "Demonstração indisponível: a chave de demonstração (DEMO_API_KEY) ainda não foi configurada neste ambiente.";

export async function demoList(_: DemoResult, formData: FormData): Promise<DemoResult> {
  const p = z
    .object({ uf: z.string().regex(/^[A-Z]{2}$/), nome: z.string().trim().max(60) })
    .safeParse({ uf: formData.get("uf"), nome: formData.get("nome") ?? "" });
  if (!p.success) return { error: "Escolha a UF." };
  const qs = new URLSearchParams({ uf: p.data.uf, por_pagina: "15", ...(p.data.nome ? { nome: p.data.nome } : {}) });
  const req = demoRequest(`/api/v1/municipios?${qs}`);
  return req ? toResult(await handleList(req)) : { error: PENDENTE };
}

export async function demoResumo(_: DemoResult, formData: FormData): Promise<DemoResult> {
  const p = z.object({ ibge: z.string().regex(/^\d{7}$/) }).safeParse({ ibge: formData.get("ibge") });
  if (!p.success) return { error: "Município inválido." };
  const req = demoRequest(`/api/v1/municipios/${p.data.ibge}/resumo`);
  return req ? toResult(await handleResumo(req, p.data.ibge)) : { error: PENDENTE };
}
