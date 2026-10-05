import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions } from "@/lib/sentry-scrub";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(sentryBaseOptions);
  }
}

// Captura erros de Server Components, Route Handlers e do proxy.
export const onRequestError = Sentry.captureRequestError;
