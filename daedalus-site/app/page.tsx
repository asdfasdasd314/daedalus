import FeatureFilesDashboard from "./feature-files-dashboard";
import { loadSharedConfig } from "@/lib/shared-config";

export default async function Home() {
  const config = await loadSharedConfig();

  return (
    <FeatureFilesDashboard
      pollIntervalMs={config.pollIntervalMs}
      supabaseAnonKey={config.supabaseAnonKey}
      supabaseUrl={config.supabaseUrl}
    />
  );
}
