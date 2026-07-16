export type ArchitectureViewStatus =
  | "available"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type ArchitectureView = {
  id: string;
  prompt_id: string;
  repository: string;
  base_commit: string;
  final_commit: string;
  targeted_feature_paths: string[];
  generation: number;
  status: ArchitectureViewStatus;
  changed_files: Array<{ status: string; path: string; previousPath?: string }>;
  report_markdown: string;
  error: string;
  provider: string;
  model: string;
  reasoning: string;
  requested_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchArchitectureView(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  promptId: string,
) {
  return callArchitectureRpc(
    supabaseUrl,
    supabasePublishableKey,
    accessToken,
    "get_architecture_view",
    { p_prompt_id: promptId },
  );
}

export async function requestArchitectureView(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  promptId: string,
) {
  return callArchitectureRpc(
    supabaseUrl,
    supabasePublishableKey,
    accessToken,
    "request_architecture_view",
    { p_prompt_id: promptId },
  );
}

async function callArchitectureRpc(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  functionName: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(
    new URL(`/rest/v1/rpc/${functionName}`, supabaseUrl),
    {
      method: "POST",
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(detail || "Architecture View request failed.");
  }
  const rows = await response.json() as ArchitectureView[];
  return rows[0] ?? null;
}
