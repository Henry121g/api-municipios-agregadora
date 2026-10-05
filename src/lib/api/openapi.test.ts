import { describe, expect, it } from "vitest";
import { openapi } from "./openapi";

/** Verificações estruturais simples (sem dependência extra de validador). */
describe("especificação OpenAPI", () => {
  const text = JSON.stringify(openapi);

  it("todas as referências $ref apontam para schemas existentes", () => {
    const refs = [...text.matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(5);
    for (const r of refs) expect(Object.keys(openapi.components.schemas)).toContain(r);
  });

  it("documenta os 4 endpoints, erros e cabeçalhos de limite", () => {
    expect(Object.keys(openapi.paths)).toEqual(["/municipios", "/municipios/{ibge}", "/municipios/{ibge}/resumo", "/feriados/{ano}"]);
    for (const p of Object.values(openapi.paths)) {
      expect(Object.keys(p.get.responses)).toEqual(expect.arrayContaining(["200", "401", "429"]));
      expect(p.get.responses["200"].headers).toHaveProperty("X-RateLimit-Remaining");
    }
  });

  it("lista as origens possíveis de cada fonte", () => {
    expect(openapi.components.schemas.Fonte.properties.origem.enum).toEqual(["fonte", "cache", "cache_expirado", "indisponivel", "sem_escopo"]);
  });
});
