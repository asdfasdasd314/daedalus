import { readFile } from "node:fs/promises";
import path from "node:path";

export type FrontendConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  pollIntervalMs: number;
};

export async function loadFrontendConfig(): Promise<FrontendConfig> {
  const configPath = path.join(process.cwd(), "config", "supabase_config.json");
  const configText = await readFile(configPath, "utf-8");
  return JSON.parse(configText) as FrontendConfig;
}
