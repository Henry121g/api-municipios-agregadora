# Fixtures reais

Respostas **reais** das APIs públicas, capturadas com `curl` em 2026-10-05T02:56Z para testar a
normalização sem depender da rede. Não foram editadas. Para atualizar, rode os mesmos endpoints:

- IBGE Localidades: `/api/v1/localidades/municipios/3509502` e `/estados/AC/municipios`
- Open-Meteo Geocoding: `/v1/search?name=Campinas&count=10&language=pt&countryCode=BR`
- Open-Meteo Forecast: `/v1/forecast` (Campinas, 7 dias) — dados sob licença CC BY 4.0
- BrasilAPI: `/api/feriados/v1/2026`
