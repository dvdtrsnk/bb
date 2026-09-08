import {
  appCommandIdSchema,
  appKeybindingSchema,
  type AppKeybinding,
  type AppKeybindings,
} from "@bb/domain";
import { z } from "zod";

const desktopKeybindingSchema = appKeybindingSchema.extend({
  command: z.string(),
});

const desktopSystemConfigSchema = z.object({
  keybindings: z.array(desktopKeybindingSchema).max(256),
});

interface DesktopSystemConfig {
  keybindings: AppKeybindings;
}

export function parseDesktopSystemConfig(
  payload: unknown,
): DesktopSystemConfig {
  const parsed = desktopSystemConfigSchema.parse(payload);
  const keybindings: AppKeybinding[] = [];
  for (const binding of parsed.keybindings) {
    const command = appCommandIdSchema.safeParse(binding.command);
    if (!command.success) {
      continue;
    }
    keybindings.push({ ...binding, command: command.data });
  }
  return { keybindings };
}

export async function fetchDesktopSystemConfig(args: {
  fetchImpl: typeof fetch;
  serverUrl: string;
}): Promise<DesktopSystemConfig> {
  const url = new URL(args.serverUrl);
  url.pathname = "/api/v1/system/config";
  url.search = "";
  url.hash = "";
  const response = await args.fetchImpl(url.toString(), { redirect: "error" });
  if (!response.ok) {
    throw new Error(
      `System config request failed with HTTP ${response.status}`,
    );
  }
  const payload: unknown = await response.json();
  return parseDesktopSystemConfig(payload);
}
