import type { ErrorEvent } from "@sentry/nextjs";

const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key|email|phone|jwt/i;

function scrubObject(obj: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!obj) return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[removido]" : v;
  }
  return out;
}

/**
 * Remove dados sensíveis antes do envio ao Sentry: cookies, cabeçalhos de autenticação,
 * corpo de requisições (pode conter senha), query strings com tokens e identificação pessoal.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    event.request.headers = scrubObject(event.request.headers) as Record<string, string> | undefined;
    if (event.request.query_string) event.request.query_string = "[removido]";
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined;
  event.extra = scrubObject(event.extra);
  event.breadcrumbs = event.breadcrumbs?.map((b) => ({
    ...b,
    data: scrubObject(b.data),
    message: b.message?.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[e-mail]"),
  }));
  return event;
}

export const sentryBaseOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  beforeSend: scrubEvent,
};
