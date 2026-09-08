import { describe, expect, it } from "vitest";
import { rewriteAuthentikSameSite } from "../src/desktop-authentik-cookie-compat.js";

describe("Authentik cookie compatibility", () => {
  it("rewrites rotated sessions while preserving security and expiry attributes", () => {
    const headers = [
      "authentik_session=old.jwt; Path=/; SameSite=None; Secure; HttpOnly",
      "authentik_session=new.jwt; Domain=.example.test; SameSite=None; Secure; Expires=Wed, 09 Sep 2026 10:00:00 GMT",
      "authentik_csrf=token; Secure; samesite=none",
    ];
    expect(rewriteAuthentikSameSite(headers)).toEqual([
      "authentik_session=old.jwt; Path=/; SameSite=Lax; Secure; HttpOnly",
      "authentik_session=new.jwt; Domain=.example.test; SameSite=Lax; Secure; Expires=Wed, 09 Sep 2026 10:00:00 GMT",
      "authentik_csrf=token; Secure; samesite=Lax",
    ]);
    expect(headers[0]).toContain("SameSite=None");
  });

  it("preserves unrelated cookies, cookie values, and existing SameSite policies", () => {
    const headers = [
      "other=authentik_session; SameSite=None; Secure",
      "prefix_authentik_session=token; SameSite=None; Secure",
      "authentik_session=SameSite=None; Secure; SameSite=Strict",
      "authentik_session=token; SameSite=Lax; Secure",
      "authentik_session=token; Secure",
    ];
    expect(rewriteAuthentikSameSite(headers)).toEqual(headers);
    expect(rewriteAuthentikSameSite([])).toEqual([]);
  });
});
