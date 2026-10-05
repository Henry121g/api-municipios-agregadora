# Projeto 6 — API agregadora de municípios brasileiros

## Problema
Quem planeja eventos, viagens ou operações em cidades brasileiras precisa cruzar três consultas em
APIs diferentes, com formatos diferentes: dados oficiais do município (IBGE), previsão do tempo e
feriados no período. Cada API tem seus limites, falhas e formatos.

## Solução
Uma API REST que, dado o código IBGE de um município e um período, devolve numa única resposta
normalizada: dados do município, previsão diária e feriados nacionais do período — indicando, **para
cada fonte**, se o dado veio agora da fonte, do cache ou de um cache expirado (fonte fora do ar).

## Fontes (gratuitas, sem chave)
| Fonte | Uso | Cache |
|---|---|---|
| IBGE Localidades | município, UF, região, microrregião; lista por UF | 7 dias (muda raramente) |
| Open-Meteo Geocoding | coordenadas do município (casando nome + UF) | 30 dias |
| Open-Meteo Forecast | clima atual e previsão diária (até 7 dias) | 30 minutos |
| BrasilAPI | feriados nacionais do ano | 7 dias |

Open-Meteo: uso não comercial, < 10.000 chamadas/dia, atribuição CC BY 4.0 (exibida na interface e nas respostas).

## Endpoints (v1)
- `GET /api/v1/municipios?uf=SP&nome=camp&pagina=1&por_pagina=20` — busca paginada.
- `GET /api/v1/municipios/{ibge}` — dados do município.
- `GET /api/v1/municipios/{ibge}/resumo?de=AAAA-MM-DD&ate=AAAA-MM-DD` — agregado (município + clima + feriados).
- `GET /api/v1/feriados/{ano}` — feriados nacionais.
- `GET /api/v1/openapi.json` — especificação OpenAPI 3.1 (pública).

## Requisitos não funcionais
- **Autenticação:** chave de API (`Authorization: Bearer <chave>` ou `X-API-Key`). Só o hash SHA-256 é
  gravado; a chave aparece uma única vez na criação. Máximo de 5 chaves ativas por usuário.
- **Autorização:** escopos por chave (`municipios`, `clima`, `feriados`); revogação imediata.
- **Limite por consumidor:** janela fixa de 1 minuto por chave, contador atômico no Postgres
  (`INSERT … ON CONFLICT DO UPDATE`) — vale para todas as instâncias serverless. Respostas com
  `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` e `429` + `Retry-After`.
- **Cache compartilhado** no Postgres com `expires_at` (validade) e `stale_until` (até quando um dado
  expirado pode ser servido se a fonte falhar).
- **Resiliência:** timeout por fonte (3 s), até 2 novas tentativas com espera crescente apenas em erros
  transitórios (rede, timeout, 5xx, 429); fontes independentes em paralelo; resposta **parcial** quando
  uma fonte falha (`parcial: true` + erro daquela fonte), nunca dado inventado.
- **Erros** no formato `application/problem+json` (RFC 9457), em português.

## Critérios de aceite
1. Com a fonte de clima fora do ar, `/resumo` responde 200 com município e feriados e `clima` com erro.
2. Cada fonte informa `origem` (`fonte`, `cache`, `cache_expirado`) e horários de obtenção/validade.
3. Limite de requisições respeitado entre instâncias (contador no banco; verificado por script com requisições paralelas).
4. Chave revogada ou sem escopo → 401/403; sem chave → 401; acima do limite → 429.
5. OpenAPI válido, exemplos `curl` executáveis e interface de demonstração.
