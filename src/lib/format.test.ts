import { describe, expect, it } from "vitest";
import { friendlyDbError, GENERIC_ERROR } from "./errors";
import { formatDuration, formatMoney, formatTime, localDate, upcomingDays, zonedToUtcIso } from "./format";

const SP = "America/Sao_Paulo";

describe("formatação", () => {
  it("formata centavos em reais sem erro de ponto flutuante", () => {
    expect(formatMoney(4500)).toBe("R$ 45,00");
    expect(formatMoney(1)).toBe("R$ 0,01");
    expect(formatMoney(123456)).toBe("R$ 1.234,56");
  });

  it("formata durações", () => {
    expect(formatDuration(30)).toBe("30 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(90)).toBe("1 h 30 min");
  });

  it("exibe horários no fuso da barbearia, não no do servidor", () => {
    expect(formatTime("2026-10-05T12:00:00Z", SP)).toBe("09:00");
    expect(formatTime("2026-10-05T12:00:00Z", "Asia/Tokyo")).toBe("21:00");
  });

  it("calcula a data local perto da meia-noite", () => {
    // 02:30 UTC do dia 6 ainda é dia 5 em São Paulo.
    expect(localDate(new Date("2026-10-06T02:30:00Z"), SP)).toBe("2026-10-05");
  });

  it("converte data/hora local em UTC respeitando o fuso de cada data", () => {
    expect(zonedToUtcIso("2026-10-05", "00:00", SP)).toBe("2026-10-05T03:00:00.000Z");
    // Nova York: horário de verão em julho (UTC−4) e padrão em dezembro (UTC−5).
    expect(zonedToUtcIso("2026-07-01", "09:00", "America/New_York")).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtcIso("2026-12-01", "09:00", "America/New_York")).toBe("2026-12-01T14:00:00.000Z");
  });

  it("lista os próximos dias a partir da data local", () => {
    const dias = upcomingDays(3, SP, new Date("2026-10-06T02:30:00Z"));
    expect(dias).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
  });
});

describe("mensagens de erro", () => {
  it("traduz códigos do banco e não vaza detalhes técnicos", () => {
    expect(friendlyDbError({ message: 'CONFLITO' })).toMatch(/outra pessoa/);
    expect(friendlyDbError({ message: "relation \"x\" does not exist" })).toBe(GENERIC_ERROR);
    expect(friendlyDbError({ code: "42501", message: "permission denied" })).toMatch(/não permite/);
  });
});
