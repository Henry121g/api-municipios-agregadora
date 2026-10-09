// Especificação OpenAPI 3.1 da API (servida em /api/v1/openapi.json).

const problem = {
  description: "Erro no formato application/problem+json (RFC 9457)",
  content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problema" } } },
};
const rateHeaders = {
  "X-RateLimit-Limit": { description: "Requisições permitidas por minuto para a chave", schema: { type: "integer" } },
  "X-RateLimit-Remaining": { description: "Requisições restantes na janela atual", schema: { type: "integer" } },
  "X-RateLimit-Reset": { description: "Início da próxima janela (epoch em segundos)", schema: { type: "integer" } },
};
const commonErrors = {
  "400": problem,
  "401": problem,
  "403": problem,
  "429": { ...problem, headers: { ...rateHeaders, "Retry-After": { schema: { type: "integer" } } } },
  "503": problem,
};
const ibgeParam = {
  name: "ibge",
  in: "path",
  required: true,
  description: "Código IBGE do município (7 dígitos)",
  schema: { type: "string", pattern: "^\\d{7}$" },
  example: "3509502",
};

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "API de Municípios Brasileiros (agregadora)",
    version: "1.0.0",
    description:
      "Agrega IBGE (município), Open-Meteo (clima, CC BY 4.0) e BrasilAPI (feriados) numa resposta normalizada. Cada fonte informa sua origem: `fonte` (consultada agora), `cache` (dentro da validade), `cache_expirado` (fonte indisponível; dado antigo servido) ou `indisponivel`. Projeto de portfólio.",
    license: { name: "Dados meteorológicos: Open-Meteo.com — CC BY 4.0", url: "https://open-meteo.com/en/license" },
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearer: [] }, { apiKey: [] }],
  paths: {
    "/municipios": {
      get: {
        summary: "Busca municípios de uma UF (paginado)",
        description: "Escopo: `municipios`.",
        parameters: [
          { name: "uf", in: "query", required: true, schema: { type: "string", example: "SP" } },
          { name: "nome", in: "query", schema: { type: "string" }, description: "Contém (sem diferenciar acentos)" },
          { name: "pagina", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "por_pagina", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          "200": {
            description: "Lista paginada",
            headers: rateHeaders,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    dados: { type: "array", items: { $ref: "#/components/schemas/Municipio" } },
                    paginacao: { $ref: "#/components/schemas/Paginacao" },
                    meta: { $ref: "#/components/schemas/Meta" },
                  },
                },
              },
            },
          },
          "502": problem,
          ...commonErrors,
        },
      },
    },
    "/municipios/{ibge}": {
      get: {
        summary: "Dados de um município",
        description: "Escopo: `municipios`.",
        parameters: [ibgeParam],
        responses: {
          "200": {
            description: "Município",
            headers: rateHeaders,
            content: {
              "application/json": {
                schema: { type: "object", properties: { dados: { $ref: "#/components/schemas/Municipio" }, meta: { $ref: "#/components/schemas/Meta" } } },
              },
            },
          },
          "404": problem,
          "502": problem,
          ...commonErrors,
        },
      },
    },
    "/municipios/{ibge}/resumo": {
      get: {
        summary: "Resumo agregado: município + clima + feriados do período",
        description:
          "Escopo: `municipios` (clima e feriados exigem os escopos `clima` e `feriados`; sem eles a fonte aparece como `sem_escopo`). Se uma fonte falhar, a resposta continua 200 com `parcial: true` e o erro da fonte em `meta.fontes`.",
        parameters: [
          ibgeParam,
          { name: "de", in: "query", schema: { type: "string", format: "date" }, description: "Padrão: hoje" },
          { name: "ate", in: "query", schema: { type: "string", format: "date" }, description: "Padrão: de + 6 dias; máx. 366 dias" },
        ],
        responses: {
          "200": {
            description: "Resumo (possivelmente parcial)",
            headers: rateHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/Resumo" } } },
          },
          ...commonErrors,
        },
      },
    },
    "/feriados/{ano}": {
      get: {
        summary: "Feriados nacionais do ano",
        description: "Escopo: `feriados`.",
        parameters: [{ name: "ano", in: "path", required: true, schema: { type: "string", pattern: "^\\d{4}$" }, example: "2026" }],
        responses: {
          "200": {
            description: "Feriados",
            headers: rateHeaders,
            content: {
              "application/json": {
                schema: { type: "object", properties: { dados: { type: "array", items: { $ref: "#/components/schemas/Feriado" } }, meta: { $ref: "#/components/schemas/Meta" } } },
              },
            },
          },
          "502": problem,
          ...commonErrors,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearer: { type: "http", scheme: "bearer", description: "Chave criada no portal (começa com `mun_`)." },
      apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
    schemas: {
      Municipio: {
        type: "object",
        properties: {
          ibge: { type: "integer", example: 3509502 },
          nome: { type: "string", example: "Campinas" },
          uf: { type: "object", properties: { sigla: { type: "string" }, nome: { type: "string" } } },
          regiao: { type: "object", properties: { sigla: { type: "string" }, nome: { type: "string" } } },
          microrregiao: { type: ["string", "null"] },
          regiao_imediata: { type: ["string", "null"] },
        },
      },
      Clima: {
        type: "object",
        properties: {
          atual: {
            type: ["object", "null"],
            properties: { temperatura_c: { type: "number" }, vento_kmh: { type: ["number", "null"] }, condicao: { type: "string" }, horario: { type: "string" } },
          },
          dias: {
            type: "array",
            items: {
              type: "object",
              properties: {
                data: { type: "string", format: "date" },
                minima_c: { type: "number" },
                maxima_c: { type: "number" },
                chance_chuva_pct: { type: ["number", "null"] },
                chuva_mm: { type: ["number", "null"] },
                condicao: { type: "string" },
              },
            },
          },
          atribuicao: { type: "string" },
        },
      },
      Feriado: {
        type: "object",
        properties: { data: { type: "string", format: "date" }, nome: { type: "string" }, dia_da_semana: { type: ["string", "null"] } },
      },
      Fonte: {
        type: "object",
        properties: {
          fonte: { type: "string", enum: ["IBGE", "Open-Meteo", "BrasilAPI"] },
          origem: { type: "string", enum: ["fonte", "cache", "cache_expirado", "indisponivel", "sem_escopo"] },
          obtido_em: { type: ["string", "null"], format: "date-time" },
          valido_ate: { type: ["string", "null"], format: "date-time" },
          aviso: { type: "string" },
          erro: { type: "string" },
        },
      },
      Meta: {
        type: "object",
        properties: { gerado_em: { type: "string", format: "date-time" }, fontes: { type: "array", items: { $ref: "#/components/schemas/Fonte" } } },
      },
      Paginacao: {
        type: "object",
        properties: { pagina: { type: "integer" }, por_pagina: { type: "integer" }, total: { type: "integer" }, total_paginas: { type: "integer" } },
      },
      Resumo: {
        type: "object",
        properties: {
          municipio: { oneOf: [{ $ref: "#/components/schemas/Municipio" }, { type: "null" }] },
          clima: { oneOf: [{ $ref: "#/components/schemas/Clima" }, { type: "null" }] },
          feriados: { oneOf: [{ type: "array", items: { $ref: "#/components/schemas/Feriado" } }, { type: "null" }] },
          periodo: { type: "object", properties: { de: { type: "string", format: "date" }, ate: { type: "string", format: "date" } } },
          parcial: { type: "boolean" },
          meta: { $ref: "#/components/schemas/Meta" },
        },
      },
      Problema: {
        type: "object",
        properties: { type: { type: "string" }, title: { type: "string" }, status: { type: "integer" }, detail: { type: "string" }, instance: { type: "string" } },
      },
    },
  },
} as const;
