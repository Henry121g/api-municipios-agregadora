// Valores monetários trafegam em centavos (inteiros); a conversão acontece apenas na exibição.
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Hora (HH:mm) de um instante, no fuso da barbearia. */
export function formatTime(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** Ex.: "seg., 5 de out." no fuso da barbearia. */
export function formatDay(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Data local (AAAA-MM-DD) de um instante no fuso informado. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return parts; // en-CA já produz AAAA-MM-DD
}

/** Instante UTC (ISO) correspondente a `day` + `time` no fuso informado, considerando o deslocamento da data. */
export function zonedToUtcIso(day: string, time: string, timeZone: string): string {
  const guess = new Date(`${day}T${time}:00Z`);
  const offsetName = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")?.value; // ex.: "GMT-03:00" ou "GMT"
  const m = offsetName?.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMin = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(guess.getTime() - offsetMin * 60_000).toISOString();
}

/** Próximos `count` dias (AAAA-MM-DD) a partir de hoje no fuso da barbearia. */
export function upcomingDays(count: number, timeZone: string, now = new Date()): string[] {
  const today = localDate(now, timeZone);
  const base = new Date(`${today}T12:00:00Z`); // meio-dia UTC evita saltos de data
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** Rótulo de um dia (AAAA-MM-DD) sem conversão de fuso. */
export function formatLocalDay(day: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${day}T12:00:00Z`));
}

export const MOVEMENT_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste",
  venda: "Venda",
  estorno_venda: "Estorno de venda",
};

export const SALE_STATUS_LABEL: Record<string, string> = {
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export function formatInt(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}
