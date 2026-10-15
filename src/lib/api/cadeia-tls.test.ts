import { X509Certificate } from "node:crypto";
import tls from "node:tls";
import { describe, expect, it } from "vitest";
import { SECTIGO_DV_R36 } from "./cadeia-tls";

describe("intermediário TLS embutido (IBGE omite a cadeia)", () => {
  const cert = new X509Certificate(SECTIGO_DV_R36);

  it("é o Sectigo DV R36 e ainda está válido", () => {
    expect(cert.subject).toContain("CN=Sectigo Public Server Authentication CA DV R36");
    expect(cert.ca).toBe(true);
    expect(new Date(cert.validTo).getTime()).toBeGreaterThan(Date.now());
    expect(cert.fingerprint256).toBe(
      "8C:54:C3:34:B6:6B:A4:E4:26:77:2A:F4:A3:F9:13:6C:19:A1:AE:C7:29:FD:B2:8C:53:5C:07:A5:A4:EF:22:E0",
    );
  });

  it("é assinado por uma raiz confiável do próprio Node (não amplia a confiança)", () => {
    const raiz = tls.rootCertificates.map((pem) => new X509Certificate(pem)).find((r) => cert.checkIssued(r));
    expect(raiz?.subject).toContain("Sectigo Public Server Authentication Root R46");
    expect(cert.verify(raiz!.publicKey)).toBe(true);
  });
});
