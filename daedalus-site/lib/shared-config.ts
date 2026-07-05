import { readFile } from "node:fs/promises";
import path from "node:path";

export type SharedConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  frontendBaseUrl: string;
  pollIntervalMs: number;
};

export async function loadSharedConfig(): Promise<SharedConfig> {
  const configPath = path.join(process.cwd(), "..", "shared", "supabase_config.json");
  const configText = await readFile(configPath, "utf-8");
  return JSON.parse(configText) as SharedConfig;
}
