import { createServer } from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import type { AppKeybinding } from "@bb/domain";
import {
  fetchDesktopSystemConfig,
  parseDesktopSystemConfig,
} from "../src/desktop-system-config.js";

const reloadBinding: AppKeybinding = {
  command: "browser.reload",
  desktopOnly: true,
  shortcut: {
    key: "r",
    mod: true,
    meta: false,
    control: false,
    alt: false,
    shift: false,
  },
  when: { all: ["mainSurface", "browserFocus"], none: ["modalOpen"] },
};

describe("parseDesktopSystemConfig", () => {
  it("keeps known bindings and drops commands this shell does not know", () => {
    const config = parseDesktopSystemConfig({
      generalSettings: { showKeyboardHints: true },
      keybindings: [
        reloadBinding,
        { ...reloadBinding, command: "browser.futureCommand" },
      ],
      serverUrl: "http://127.0.0.1:1",
      unknownTopLevelField: 1,
    });
    expect(config.keybindings).toEqual([reloadBinding]);
  });

  it("rejects a malformed binding rather than a malformed command id", () => {
    expect(() =>
      parseDesktopSystemConfig({
        keybindings: [{ ...reloadBinding, shortcut: { key: "r" } }],
      }),
    ).toThrow();
    expect(() => parseDesktopSystemConfig({})).toThrow();
  });
});

describe("fetchDesktopSystemConfig", () => {
  it("does not restart an SSO flow while polling, and reads config after login", async () => {
    let authenticated = false;
    let loginRestarts = 0;
    const server = createServer((request, response) => {
      if (request.url === "/login") {
        loginRestarts += 1;
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end("Login restarted");
      } else if (!authenticated) {
        response.writeHead(302, { Location: "/login" });
        response.end();
      } else {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ keybindings: [reloadBinding] }));
      }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Expected a TCP listener");
      }
      const args = {
        fetchImpl: fetch,
        serverUrl: `http://127.0.0.1:${address.port}`,
      };
      await expect(fetchDesktopSystemConfig(args)).rejects.toThrow();
      await expect(fetchDesktopSystemConfig(args)).rejects.toThrow();
      expect(loginRestarts).toBe(0);
      authenticated = true;
      await expect(fetchDesktopSystemConfig(args)).resolves.toEqual({
        keybindings: [reloadBinding],
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
