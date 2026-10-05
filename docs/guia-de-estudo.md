# Guia de estudo — API de Municípios

## Pitch de 30 segundos
“É uma API que agrega IBGE, Open-Meteo e BrasilAPI. Ela autentica por chave, limita requisições por
consumidor com um contador atômico no Postgres — que funciona entre instâncias serverless — e usa um
cache com validade que também serve de reserva quando uma fonte cai. A resposta diz, por fonte, se o
dado é fresco, do cache ou expirado, e nunca inventa dados.”

## Onde está cada coisa
| Assunto | Arquivo |
|---|---|
| Timeout e novas tentativas | `src/lib/api/http.ts` |
| Cache com reserva | `src/lib/api/cache.ts` |
| Fontes e normalização | `src/lib/api/sources.ts` |
| Agregação parcial | `src/lib/api/aggregate.ts` |
| Chave, escopo, limite | `src/lib/api/pipeline.ts` e `supabase/migrations/…_api_schema.sql` |
| OpenAPI | `src/lib/api/openapi.ts` |

## Perguntas prováveis

**“Por que não guardar o contador em memória?”** Serverless = várias instâncias efêmeras. Cada uma teria
seu contador. Mostre `api.consume` e o teste com 25 chamadas paralelas.

**“Por que não Redis?”** Seria mais rápido, mas exigiria outro serviço; o Postgres já está lá e o
`ON CONFLICT` resolve a atomicidade. Saiba dizer quando trocaria (latência, volume).

**“Janela fixa ou deslizante?”** Fixa é simples e barata; o defeito é permitir rajada de até 2× na virada.
Sliding window log ou token bucket resolvem com mais custo.

**“Como distinguir dado atualizado de cache?”** `origem` por fonte + `obtido_em`/`valido_ate`. E a
diferença entre `cache` (dentro da validade) e `cache_expirado` (só porque a fonte falhou).

**“E se o IBGE cair?”** Município vira `null` com erro; clima continua se as coordenadas estiverem em
cache; feriados não dependem do IBGE. Resposta 200 com `parcial: true`.

**“Por que SHA-256 e não bcrypt para a chave?”** A chave tem 256 bits de aleatoriedade: não há
dicionário para atacar. Hash rápido permite busca por índice a cada requisição.

## Exercícios
1. Implemente janela deslizante e compare com a fixa num teste.
2. Adicione “coalescência” de requisições para evitar várias buscas simultâneas na expiração do cache.
3. Gere um cliente TypeScript a partir do `openapi.json`.
