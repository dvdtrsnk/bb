import { describe, expect, it, vi } from "vitest";
import { createFakeSocketFactory } from "../realtime/fake-socket";
import { MOBILE_APP_SURFACE_HEADER } from "./app-surface";
import { createProfileClientRegistry } from "./client-registry";
import { createMobileFetch, type ServerMovedResponse } from "./mobile-fetch";

const MOVED_BODY = {
  code: "server_moved",
  message: "This bb server moved to studio",
  details: {
    serverUrl: "https://studio.tailnet.ts.net/",
    toHostName: "studio",
    movedAt: 1_750_000_000_000,
  },
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setup(response: () => Response) {
  const baseFetch = vi.fn<typeof fetch>(async () => response());
  const onAuthFailure = vi.fn<(status: number) => void>();
  const onServerMoved = vi.fn<(moved: ServerMovedResponse) => void>();
  const mobileFetch = createMobileFetch(baseFetch, {
    onAuthFailure,
    onServerMoved,
  });
  return { baseFetch, mobileFetch, onAuthFailure, onServerMoved };
}

describe("createMobileFetch", () => {
  it("reports a server_moved 410 and leaves the body readable for the caller", async () => {
    const { mobileFetch, onAuthFailure, onServerMoved } = setup(() =>
      jsonResponse(MOVED_BODY, 410),
    );

    const response = await mobileFetch("http://192.168.1.20:38886/api/v1/x");

    expect(onServerMoved).toHaveBeenCalledExactlyOnceWith({
      serverUrl: "https://studio.tailnet.ts.net",
      toHostName: "studio",
    });
    expect(onAuthFailure).not.toHaveBeenCalled();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual(MOVED_BODY);
  });

  it.each([
    [
      "a non-JSON body",
      () => new Response("<html>gone</html>", { status: 410 }),
    ],
    [
      "another 410 code",
      () => jsonResponse({ ...MOVED_BODY, code: "gone" }, 410),
    ],
    [
      "missing details",
      () => jsonResponse({ code: "server_moved", message: "moved" }, 410),
    ],
    [
      "a non-http address",
      () =>
        jsonResponse(
          {
            ...MOVED_BODY,
            details: {
              ...MOVED_BODY.details,
              serverUrl: "javascript:alert(1)",
            },
          },
          410,
        ),
    ],
    [
      "an address without a scheme",
      () =>
        jsonResponse(
          {
            ...MOVED_BODY,
            details: { ...MOVED_BODY.details, serverUrl: "studio.local:38886" },
          },
          410,
        ),
    ],
    [
      "an empty host name",
      () =>
        jsonResponse(
          { ...MOVED_BODY, details: { ...MOVED_BODY.details, toHostName: "" } },
          410,
        ),
    ],
    [
      "a server_moved body on another status",
      () => jsonResponse(MOVED_BODY, 503),
    ],
  ])("ignores %s", async (_label, response) => {
    const { mobileFetch, onServerMoved } = setup(response);

    const result = await mobileFetch("http://192.168.1.20:38886/api/v1/x");

    expect(onServerMoved).not.toHaveBeenCalled();
    expect(result.bodyUsed).toBe(false);
  });

  it("still reports auth failures and tags the app surface", async () => {
    const { baseFetch, mobileFetch, onAuthFailure, onServerMoved } = setup(() =>
      jsonResponse({ code: "unauthorized" }, 401),
    );

    await mobileFetch("https://bee.getbb.app/api/v1/x", {
      headers: { accept: "application/json" },
    });

    expect(onAuthFailure).toHaveBeenCalledExactlyOnceWith(401);
    expect(onServerMoved).not.toHaveBeenCalled();
    const headers = new Headers(baseFetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get(MOBILE_APP_SURFACE_HEADER.name)).toBe(
      MOBILE_APP_SURFACE_HEADER.value,
    );
    expect(headers.get("accept")).toBe("application/json");
  });
});

describe("profile client registry server moves", () => {
  it("reports the moved address with the profile that received it", async () => {
    const onServerMoved =
      vi.fn<(profileId: string, moved: ServerMovedResponse) => void>();
    const registry = createProfileClientRegistry({
      onServerMoved,
      sdk: {
        fetch: async () => jsonResponse(MOVED_BODY, 410),
        realtime: {
          socketFactory: createFakeSocketFactory(),
          onInvalidMessage: () => {},
        },
      },
    });
    const client = registry.getClientForProfile({
      id: "laptop",
      serverUrl: "http://192.168.1.20:38886",
    });

    await expect(client.sdk.system.config()).rejects.toThrow();

    expect(onServerMoved).toHaveBeenCalledExactlyOnceWith("laptop", {
      serverUrl: "https://studio.tailnet.ts.net",
      toHostName: "studio",
    });
    registry.disposeAll();
  });
});


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

describe("createMobileFetch forward-auth redirects", () => {
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
