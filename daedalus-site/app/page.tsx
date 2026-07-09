import FeatureFilesDashboard from "./feature-files-dashboard";
import { loadAgentModels } from "@/lib/agent-models";
import { loadSharedConfig } from "@/lib/shared-config";

export default async function Home() {
  const config = await loadSharedConfig();
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
