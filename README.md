# API de Municípios — agregadora com autenticação e cache

> Projeto de portfólio desenvolvido com assistência de IA (Claude Code). Os dados vêm de **APIs
> públicas reais** (IBGE, Open-Meteo e BrasilAPI); contas e chaves são de teste.

**Demonstração:** _pendente de deploy_ · **CI:** ver aba Actions

<!-- Screenshots reais serão adicionadas após o deploy. -->

## O problema

Quem planeja eventos, viagens ou operações em cidades brasileiras precisa cruzar dados oficiais do
município, previsão do tempo e feriados — três APIs diferentes, com formatos, limites e falhas
diferentes.

**Solução:** uma API REST que devolve tudo isso numa resposta normalizada, em português, e diz para
cada fonte se o dado é **fresco**, **do cache** ou **um cache expirado servido porque a fonte caiu**.

**Público:** desenvolvedores que precisam desses dados em seus sistemas (e recrutadores avaliando
design de APIs).

## Funcionalidades

| Requisito | Como foi feito |
|---|---|
| Integração real com 2+ APIs | IBGE Localidades, Open-Meteo (geocodificação + previsão) e BrasilAPI |
| Normalização | Tipos próprios em português (`Municipio`, `Clima`, `Feriado`), condições WMO traduzidas |
| Autenticação | Chave de API (`Bearer` ou `X-API-Key`); só o hash SHA-256 é gravado |
| Autorização | Escopos por chave (`municipios`, `clima`, `feriados`); revogação imediata |
| Limite por consumidor | 60/min por chave, contador atômico no Postgres (vale entre instâncias) |
| Cache com validade | Postgres, com `expires_at` e `stale_until` por tipo de dado |
| Paginação e filtros | `/municipios?uf=&nome=&pagina=&por_pagina=` |
| Timeouts e tentativas | 3 s por tentativa, até 2 novas tentativas só em erros transitórios |
| Funcionamento parcial | Uma fonte falha → 200 com `parcial: true` e o erro daquela fonte |
| OpenAPI e exemplos | `/api/v1/openapi.json`, página `/docs` com teste ao vivo, `docs/exemplos.http` |
| Interface de demonstração | `/demo` (sem conta) e portal de chaves `/painel` |

## Exemplo de resposta (`GET /api/v1/municipios/3509502/resumo`)

```jsonc
{
  "municipio": { "ibge": 3509502, "nome": "Campinas", "uf": { "sigla": "SP", "nome": "São Paulo" }, … },
  "clima": { "atual": { "temperatura_c": 18.1, "condicao": "Parcialmente nublado", … }, "dias": [ … ], "atribuicao": "Dados meteorológicos: Open-Meteo.com (CC BY 4.0)" },
  "feriados": [ { "data": "2026-10-12", "nome": "Nossa Senhora Aparecida", "dia_da_semana": "segunda-feira" } ],
  "periodo": { "de": "2026-10-05", "ate": "2026-10-11" },
  "parcial": false,
  "meta": {
    "gerado_em": "…",
    "fontes": [
      { "fonte": "IBGE", "origem": "cache", "obtido_em": "…", "valido_ate": "…" },
      { "fonte": "Open-Meteo", "origem": "fonte", "obtido_em": "…", "valido_ate": "…" },
      { "fonte": "BrasilAPI", "origem": "cache_expirado", "aviso": "Fonte indisponível; dado expirado servido do cache.", … }
    ]
  }
}
```

## Decisões técnicas

### 1. Estado compartilhado no Postgres, não na memória
Na Vercel, cada requisição pode cair numa instância diferente; um contador em memória deixaria passar
`limite × instâncias`. O limite é uma linha por (chave, minuto), incrementada com
`INSERT … ON CONFLICT DO UPDATE … RETURNING count` — atômico mesmo com instâncias simultâneas. O mesmo
banco guarda o cache. **Trade-off:** uma ida ao banco por requisição; Redis seria mais rápido, mas exigiria
outro serviço (orçamento zero).

### 2. Cache com “dado expirado como reserva”
Cada tipo de dado tem validade própria (clima 30 min, município 7 dias, coordenadas 30 dias, feriados
7 dias) e uma janela extra em que o dado expirado só é usado **se a fonte falhar**. A resposta sempre
diz a origem — o consumidor decide se aceita um clima de 2 horas atrás.

### 3. Resposta parcial em vez de erro total
Fontes independentes rodam em paralelo (`Promise.allSettled`). O clima depende das coordenadas, que
dependem do nome/UF do IBGE — mas as coordenadas ficam em cache 30 dias, então o clima continua
funcionando mesmo se o IBGE cair depois da primeira consulta (testado). Falhas viram `null` + erro
legível; **nenhum dado é inventado**.

### 4. Tentativas só quando faz sentido
Novas tentativas (250 ms, 500 ms) apenas para rede, timeout, 5xx e 429. Um 404 não é repetido.

### 5. Geocodificação desambiguada
A busca do Open-Meteo é aproximada (“Campinas” também retorna “Araranguá”). O município é casado por
**nome e UF** exatos (sem acentos) — se não houver correspondência, a fonte retorna erro em vez de
coordenadas erradas.

### 6. Chaves como senhas
A chave (`mun_` + 64 hex) é exibida uma vez; o banco guarda só o SHA-256 (busca por igualdade no
índice único — chaves aleatórias longas dispensam hash lento). O usuário não consegue ler o hash nem
“desrevogar” uma chave (RLS).

### 7. Projeto Supabase separado
As demos com interface compartilham um projeto Supabase; esta API usa o segundo projeto do plano
gratuito, para que o tráfego da API (contadores e cache) não interfira nas outras.

## Termos das fontes
- **Open-Meteo:** uso não comercial, < 10.000 chamadas/dia, atribuição CC BY 4.0 (exibida na
  interface e em `clima.atribuicao`). O cache mantém o volume baixo.
- **IBGE** e **BrasilAPI:** APIs públicas e gratuitas.

## Arquitetura

```
Cliente ─► /api/v1/* (Route Handlers, Vercel)
             ├─ withApiKey: chave → escopo → api.consume (Postgres) → cabeçalhos X-RateLimit-*
             └─ getResumo ─┬─ cached(IBGE)        ┐
                           ├─ cached(BrasilAPI)   ├─ api.cache (Postgres): validade + reserva
                           └─ cached(Open-Meteo)  ┘
                                 └─ fetchJson: timeout 3 s, até 2 novas tentativas
```

**Tecnologias:** Next.js 16 · TypeScript · Supabase (Postgres, Auth, RLS) · Zod · Vitest · PGlite ·
GitHub Actions · Vercel.

## Como executar

```bash
pnpm install
cp .env.example .env.local      # projeto Supabase da API
```

1. Supabase → **Exposed schemas**: adicione `api`; aplique `supabase/migrations/`.
2. `pnpm seed:demo` → copie a chave impressa para `DEMO_API_KEY` no `.env.local`.
3. `pnpm dev` → http://localhost:3000 (crie sua conta em `/cadastrar` e uma chave em `/painel`).

## Testes

```bash
pnpm test         # núcleo (timeout, tentativas, cache, agregação parcial, pipeline, OpenAPI) + banco (PGlite)
pnpm test:limite  # 90 requisições paralelas contra o deploy: só o limite passa (entre instâncias)
pnpm lint && pnpm typecheck && pnpm build
```

As normalizações são testadas com **respostas reais** gravadas em `tests/fixtures/` (data da captura
em `LEIAME.md`). Os testes nunca fazem chamadas de rede; falhas de fonte são simuladas por injeção.

## Limitações

- Feriados apenas **nacionais** (a BrasilAPI não cobre estaduais/municipais de forma completa).
- O clima traz sempre os próximos 7 dias (limite da previsão), independentemente do período pedido; o
  período filtra apenas os feriados.
- Janela fixa de 1 minuto permite rajadas de até 2× o limite na virada do minuto (troca simples por
  janela deslizante se necessário).
- Sem proteção contra “thundering herd” no cache (várias instâncias podem buscar a fonte ao mesmo
  tempo quando o cache expira).

## Melhorias futuras

Feriados estaduais · janela deslizante · SDK TypeScript gerado do OpenAPI · métricas de latência por fonte.

## Guia de estudo

[docs/guia-de-estudo.md](docs/guia-de-estudo.md)

## Transparência sobre o uso de IA

Código, testes e documentação produzidos com assistência do Claude Code (Anthropic), sob minha direção
e revisão.
