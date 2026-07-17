export type ArchitectureViewStatus =
  | "available"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type ArchitectureProgressStage =
  | "queued"
  | "preparing_snapshot"
  | "collecting_evidence"
  | "generating_document"
  | "validating_document"
  | "correcting_document"
  | "finalizing";

export type ArchitectureProgressEvent = {
  id: string;
  architecture_view_id: string;
  generation: number;
  stage: ArchitectureProgressStage;
  stage_order: number;
  attempt: number | null;
  total_attempts: number | null;
  detail: string;
  created_at: string;
  updated_at: string;
};

export type PrimitiveFieldDefinition = {
  name: string;
  summary: string;
  type: "string" | "number" | "integer" | "boolean" | "null";
  required: boolean;
};

export type ArrayFieldDefinition = {
  name: string;
  summary: string;
  type: "array";
  required: boolean;
  items: FieldDefinition;
};

export type ObjectFieldDefinition = {
  name: string;
  summary: string;
  type: "object";
  required: boolean;
  fields: FieldDefinition[];
};

export type FieldDefinition =
  | PrimitiveFieldDefinition
  | ArrayFieldDefinition
  | ObjectFieldDefinition;

export type SystemDefinition = {
  id: string;
  name: string;
  summary: string;
  files: string[];
};

export type ChannelDefinition = {
  id: string;
  name: string;
  summary: string;
  source_system_id: string;
  target_system_id: string;
  fields: FieldDefinition[];
};

export type SoftwareArchitecture = {
  schema_version: "1.0";
  summary: string;
  systems: SystemDefinition[];
  channels: ChannelDefinition[];
};

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
  architecture_document: SoftwareArchitecture | null;
  error: string;
  provider: string;
  model: string;
  reasoning: string;
  requested_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  progress_events?: ArchitectureProgressEvent[];
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
