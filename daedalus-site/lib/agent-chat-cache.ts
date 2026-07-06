export type AgentChatExchange = {
  directory: string;
  prompt: string;
  reply: string;
  provider?: string;
  model?: string;
  reasoning?: string;
  planningMode?: boolean;
};

let cachedExchange: AgentChatExchange | null = null;

export function getCachedExchange() {
  return cachedExchange;
}

export function setCachedExchange(exchange: AgentChatExchange) {
  cachedExchange = exchange;
}
