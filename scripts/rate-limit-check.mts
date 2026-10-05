// Verifica o limite de requisições ENTRE INSTÂNCIAS contra o deploy real.
// Dispara N requisições em paralelo (a Vercel distribui entre várias instâncias); com limite L/min,
// devem passar exatamente L (se todas caírem na mesma janela de 1 minuto) e o resto receber 429.
// Uso: API_URL=https://seu-app.vercel.app API_KEY=mun_... pnpm test:limite [N]
const base = process.env.API_URL;
const key = process.env.API_KEY;
const N = Number(process.argv[2] ?? 90);
if (!base || !key) {
  console.error("Defina API_URL e API_KEY.");
  process.exit(1);
}

// Espera o início de um minuto para todas as requisições caírem na mesma janela.
const wait = 60_000 - (Date.now() % 60_000) + 500;
if (wait < 55_000) {
  console.log(`Aguardando ${Math.round(wait / 1000)} s para começar no início da janela…`);
  await new Promise((r) => setTimeout(r, wait));
}

const results = await Promise.all(
  Array.from({ length: N }, () =>
    fetch(`${base}/api/v1/feriados/2026`, { headers: { Authorization: `Bearer ${key}` } }).then((r) => ({
      status: r.status,
      limit: Number(r.headers.get("x-ratelimit-limit")),
      instance: r.headers.get("x-vercel-id") ?? "?",
    })),
  ),
);
const ok = results.filter((r) => r.status === 200).length;
const limited = results.filter((r) => r.status === 429).length;
const limit = results.find((r) => r.limit)?.limit ?? NaN;
const instances = new Set(results.map((r) => r.instance.split("::").pop())).size;
console.log(`Requisições: ${N} · 200: ${ok} · 429: ${limited} · outras: ${N - ok - limited} · limite: ${limit}/min`);
console.log(`Identificadores de execução distintos (x-vercel-id): ${instances}`);
const pass = ok === Math.min(N, limit) && ok + limited === N;
console.log(pass ? "✓ OK: o limite valeu para o conjunto das instâncias." : "✗ FALHOU");
process.exit(pass ? 0 : 1);
