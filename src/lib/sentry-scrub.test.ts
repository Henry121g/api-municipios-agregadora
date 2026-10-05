import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubEvent } from "./sentry-scrub";

describe("scrubEvent", () => {
  it("remove senha, cookies, tokens e dados pessoais", () => {
    const event = {
      type: undefined,
      request: {
        url: "https://app.test/entrar?token=abc",
        cookies: { "sb-access-token": "segredo" },
        data: { email: "ana@exemplo.test", password: "123" },
        headers: { authorization: "Bearer x", "user-agent": "teste" },
        query_string: "token=abc",
      },
      user: { id: "u1", email: "ana@exemplo.test", ip_address: "1.2.3.4" },
      breadcrumbs: [{ message: "login de ana@exemplo.test", data: { apiKey: "k", url: "/x" } }],
    } as unknown as ErrorEvent;

    const out = JSON.stringify(scrubEvent(event));
    for (const secret of ["segredo", "ana@exemplo.test", "Bearer x", "token=abc", "1.2.3.4", '"123"', '"k"']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("user-agent");
    expect(out).toContain('"id":"u1"');
  });
});
