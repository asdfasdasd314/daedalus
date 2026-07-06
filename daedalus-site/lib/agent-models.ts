import { readFile } from "node:fs/promises";
import path from "node:path";

export type AgentModel = {
  id: string;
  name: string;
  reasoning: string[];
  default_reasoning: string;
};

export type AgentModelsConfig = {
  codex: {
    models: AgentModel[];
  };
};

export async function loadAgentModels(): Promise<AgentModelsConfig> {
  const configPath = path.join(process.cwd(), "..", "shared", "agent_models.json");
  const configText = await readFile(configPath, "utf-8");
  return JSON.parse(configText) as AgentModelsConfig;
}
