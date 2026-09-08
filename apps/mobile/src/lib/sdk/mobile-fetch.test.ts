import { describe, expect, it } from "vitest";
import { createMobileFetch } from "./mobile-fetch";

function fakeFetch(response: { status: number; url: string; body: string }) {
  return async (): Promise<Response> => {
    return {
      status: response.status,
      url: response.url,
      json: async () => JSON.parse(response.body) as unknown,
      text: async () => response.body,
    } as unknown as Response;
  };
}

describe("createMobileFetch", () => {
  it("treats a same-site redirect to the identity provider as an auth failure instead of returning its HTML", async () => {
    const failures: number[] = [];
    const mobileFetch = createMobileFetch(
      fakeFetch({
        status: 200,
        url: "https://auth.example.com/idp/login",
        body: "<html>Sign in</html>",
      }),
      {
        serverUrl: "https://app.example.com",
        onAuthFailure: (status) => failures.push(status),
      },
    );

    const response = await mobileFetch(
      "https://app.example.com/api/v1/system/config",
    );

    expect(response.status).toBe(401);
    expect(failures).toEqual([401]);
  });

  it("passes through a normal same-origin response untouched", async () => {
    const failures: number[] = [];
    const mobileFetch = createMobileFetch(
      fakeFetch({
        status: 200,
        url: "https://app.example.com/api/v1/system/config",
        body: JSON.stringify({ ok: true }),
      }),
      {
        serverUrl: "https://app.example.com",
        onAuthFailure: (status) => failures.push(status),
      },
    );

    const response = await mobileFetch(
      "https://app.example.com/api/v1/system/config",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(failures).toEqual([]);
  });

  it("still reports direct 401/403 responses as before", async () => {
    const failures: number[] = [];
    const mobileFetch = createMobileFetch(
      fakeFetch({
        status: 403,
        url: "https://app.example.com/api/v1/system/config",
        body: JSON.stringify({ error: "forbidden" }),
      }),
      {
        serverUrl: "https://app.example.com",
        onAuthFailure: (status) => failures.push(status),
      },
    );

    const response = await mobileFetch(
      "https://app.example.com/api/v1/system/config",
    );

    expect(response.status).toBe(403);
    expect(failures).toEqual([403]);
  });

  it("ignores redirects to an unrelated domain, leaving the response unchanged", async () => {
    const failures: number[] = [];
    const mobileFetch = createMobileFetch(
      fakeFetch({
        status: 200,
        url: "https://totally-different.example/somewhere",
        body: "unexpected",
      }),
      {
        serverUrl: "https://app.example.com",
        onAuthFailure: (status) => failures.push(status),
      },
    );

    const response = await mobileFetch(
      "https://app.example.com/api/v1/system/config",
    );

    expect(response.status).toBe(200);
    expect(failures).toEqual([]);
  });
});
