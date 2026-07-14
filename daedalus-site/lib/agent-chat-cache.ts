export type TargetedFeature = {
  projectPath: string;
  filePath: string;
  featureName: string;
};

export type AgentChatExchange = {
  promptId: string;
  directory: string;
  prompt: string;
  reply: string;
  provider?: string;
  model?: string;
  reasoning?: string;
  planningMode?: boolean;
  askMode?: boolean;
  targetedFeaturePaths?: string[];
};

let cachedExchange: AgentChatExchange | null = null;

export function getCachedExchange() {
  return cachedExchange;
}

export function setCachedExchange(exchange: AgentChatExchange) {
  cachedExchange = exchange;
}
