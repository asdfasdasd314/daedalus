import FeatureFilesDashboard from "./feature-files-dashboard";
import { loadAgentModels } from "@/lib/agent-models";
import { loadFrontendConfig } from "@/lib/frontend-config";

export default async function Home() {
  const config = await loadFrontendConfig();
  const agentModels = await loadAgentModels();

  return (
    <FeatureFilesDashboard
      agentModels={agentModels}
      pollIntervalMs={config.pollIntervalMs}
      supabasePublishableKey={config.supabasePublishableKey}
      supabaseUrl={config.supabaseUrl}
    />
  );
}
