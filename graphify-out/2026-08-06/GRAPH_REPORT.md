# Graph Report - task-9d763a53-7b7b-43bc-b822-a8d3cda23d2a  (2026-07-18)

## Corpus Check
- 140 files · ~110,567 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1260 nodes · 2147 edges · 103 communities (73 shown, 30 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 202 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f232f487`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- orchestrator.py
- feature-files-dashboard.tsx
- communications.py
- agent-output-viewer.tsx
- feature-file-graph.tsx
- architecture.py
- main.py
- architecture-view.ts
- devDependencies
- Feature-First Graph Workspace Shell
- compilerOptions
- architecture_document.py
- migration_deployment.py
- scan_feature_file_projects
- feature-workspace-utils.ts
- run_agent_prompt_cycle
- parameter-file-parser.ts
- main.py
- README.md
- summary
- load_daemon_config
- $defs
- run_cursor_exec
- properties
- recurrent-supabase-queries.test.ts
- required
- $ref
- git-sync-panel.tsx
- __init__.py
- update_execution_entry_point_in_toml
- build_codex_prompt
- run_codex_exec
- software-architecture-v1.schema.json
- entry-point-picker.tsx
- page.tsx
- run_git_sync_cycle
- coding.md
- planning.md
- agent-task-notifications.tsx
- daemon-manager-panel.tsx
- Agent Task Notifications
- Auth-Scoped Supabase Access
- Cursor Agent
- Daedalus Git Worktrees
- Dev Environment Parameter File Loading
- Feature Execution System
- Feature File Communications System
- Git Sync
- Local Daemon Feature File Scanner
- Local Daemon Manager
- Planning Questionnaire
- Recurrent Row Review Protocol
- Frontend Supabase Config
- Supabase Migration Deployment
- System Architecture Communication Engine
- System Architecture Visualization Engine
- Ventures
- architecture.md
- enum
- integrating.md
- layout.tsx
- agent-chat-cache.ts
- Daedalus Project Instructions
- README.md
- Shared Database Artifacts
- Next.js Agent Rules
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- __init__.py
- Document Icon
- Globe Icon
- Next.js Logo
- Vercel Logo
- Browser Window Icon
- Next.js Project
- Daedalus Workspace
- system_definition
- integrating.md
- run_tracked_agent_command
- Daedalus Project Instructions
- README.md
- prune-local-branches.sh
- object_field_definition
- __init__.py
- Feature File Graph Display
- Feature Search Fuzzy Finder
- Path
- Popen
- Exception
- Exception
- Path
- Exception
- Path
- Path
- Popen
- Path
- Popen
- Path
- Path

## God Nodes (most connected - your core abstractions)
1. `GitWorktreeOrchestrator` - 41 edges
2. `FeatureFilesDashboard()` - 30 edges
3. `getAuthenticatedSupabaseHeaders()` - 29 edges
4. `generate_architecture_view()` - 22 edges
5. `AgentOutputViewer()` - 19 edges
6. `call_daemon_rpc()` - 19 edges
7. `SupabaseUnavailableError` - 18 edges
8. `run_agent_prompt_cycle()` - 18 edges
9. `run_cursor_exec()` - 18 edges
10. `main()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `extractFeatureFileReferences()` --indirect_call--> `normalizeFeatureFilePath()`  [INFERRED]
  daedalus-site/app/feature-file-graph.tsx → daedalus-site/app/feature-workspace-utils.ts
- `FeatureFilesDashboard()` --indirect_call--> `exchange()`  [INFERRED]
  daedalus-site/app/feature-files-dashboard.tsx → daedalus-site/lib/agent-output-history.test.ts
- `generate_architecture_view()` --calls--> `format_architecture_validation_errors()`  [EXTRACTED]
  local-daemon/src/daedalus_daemon/architecture.py → local-daemon/src/daedalus_daemon/architecture_document.py
- `DirectPromptSupervisor` --uses--> `SupabaseUnavailableError`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/communications.py
- `FakeResponse` --uses--> `SupabaseUnavailableError`  [INFERRED]
  local-daemon/tests/test_communications.py → local-daemon/src/daedalus_daemon/communications.py

## Import Cycles
- None detected.

## Communities (103 total, 30 thin omitted)

### Community 0 - "orchestrator.py"
Cohesion: 0.06
Nodes (45): build_resolver_prompt(), build_task_prompt(), build_task_repair_prompt(), commit_worktree_changes(), create_task_worktree(), delete_merged_branch(), find_migration_directories(), format_process_failure() (+37 more)

### Community 1 - "feature-files-dashboard.tsx"
Cohesion: 0.05
Nodes (75): acknowledgeClientReviews(), AgentPromptPayload, AgentPromptQueueEntry, AgentPromptQueueStatus, AgentTaskRow, AuthMode, callRecoveryRpc(), clampNumber() (+67 more)

### Community 2 - "communications.py"
Cohesion: 0.05
Nodes (36): Request, call_daemon_rpc(), claim_architecture_view(), claim_feature_execution_run(), complete_architecture_view(), complete_task_deletion(), fetch_communication_rows(), fetch_current_message() (+28 more)

### Community 3 - "agent-output-viewer.tsx"
Cohesion: 0.07
Nodes (57): AgentOutputDetailProps, AgentOutputViewer(), AgentOutputViewerPresentation, AgentOutputViewerProps, architectureActionLabel(), architectureProgressLabel(), formatTime(), logViewerRequest() (+49 more)

### Community 4 - "feature-file-graph.tsx"
Cohesion: 0.05
Nodes (51): applyNodeVisualMetrics(), applyZoomAtPoint(), buildGraphData(), buildProjectFeatureLayout(), centerGraphViewport(), clamp(), ClientPoint, ClusterColor (+43 more)

### Community 5 - "architecture.py"
Cohesion: 0.12
Nodes (33): acquire_lease(), begin_restart(), call_manager_rpc(), claim_restart(), complete_control_request(), complete_recovery(), complete_restart(), get_active_request() (+25 more)

### Community 6 - "main.py"
Cohesion: 0.11
Nodes (22): add_snapshot_worktree(), architecture_document_path(), architecture_failure_details(), architecture_log_path(), architecture_operational_failure(), architecture_snapshot_path(), build_architecture_correction_prompt(), build_architecture_prompt() (+14 more)

### Community 7 - "architecture-view.ts"
Cohesion: 0.06
Nodes (42): ArchitectureCanvas(), architectureFailureDetail(), ArchitectureProgressStepper(), ArchitectureViewport, ArchitectureVisualization(), ArchitectureVisualizationProps, ChannelTooltip(), clamp() (+34 more)

### Community 8 - "devDependencies"
Cohesion: 0.05
Nodes (40): eslint, eslint-config-next, fuse.js, next, react, react-dom, react-markdown, remark-gfm (+32 more)

### Community 9 - "Feature-First Graph Workspace Shell"
Cohesion: 0.29
Nodes (6): Agent Output Viewer, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 11 - "architecture_document.py"
Cohesion: 0.11
Nodes (14): BaseModel, ArchitectureDocumentModel, ArrayFieldDefinition, ChannelDefinition, format_architecture_validation_errors(), load_published_architecture_schema(), NamedFieldDefinition, ObjectFieldDefinition (+6 more)

### Community 12 - "migration_deployment.py"
Cohesion: 0.12
Nodes (16): blocked(), deploy_pending_migrations(), diagnostic_text(), load_deployment_settings(), migration_files_changed(), positive_int(), project_lock(), project_ref_for_repository() (+8 more)

### Community 13 - "scan_feature_file_projects"
Cohesion: 0.12
Nodes (22): apply_entry_point_update(), apply_parameter_file_update(), build_entry_point_update_state_message(), build_parameter_file_update_state_message(), build_skipped_push_step(), execute_git_sync_operation(), is_cursor_plan_mode_unsupported(), is_toml_float() (+14 more)

### Community 14 - "feature-workspace-utils.ts"
Cohesion: 0.16
Nodes (22): AgentPromptMode, AgentSessionPanel(), AgentSessionPanelProps, FeatureGraphSelection, FeatureSearchDialog(), FeatureSearchDialogProps, FeatureSearchMode, buildFeatureExecutionRequest() (+14 more)

### Community 15 - "run_agent_prompt_cycle"
Cohesion: 0.14
Nodes (10): find_project_directories(), is_linked_git_worktree(), load_snapshot_limits(), Read one explicitly requested file within its project and response bound., read_project_file(), scan_feature_file_projects(), scan_parameter_file_projects(), scan_project_files() (+2 more)

### Community 16 - "parameter-file-parser.ts"
Cohesion: 0.17
Nodes (20): ParameterVariableSelector(), ParameterVariableSelectorProps, ExecutionEntryPointMetadata, isDoubleQuotedString(), isSingleQuotedString(), isSupportedArrayLiteral(), isValidFloat(), normalizeFloatLiteral() (+12 more)

### Community 17 - "main.py"
Cohesion: 0.12
Nodes (10): build_agent_prompt_state_message(), filter_targeted_feature_paths(), parse_agent_prompt_message(), run_agent_prompt_cycle(), AgentOutputHistoryPublicationTests, CursorProviderRoutingTests, FakeGitProcess, FilterTargetedFeaturePathsTests (+2 more)

### Community 18 - "README.md"
Cohesion: 0.10
Nodes (20): 1. Daedalus Site, 2. Backend, 3. Persistent Idea Space, 4. Local Daemon, 5. AI Execution Layer, Core Subsystems, Daedalus, Design Philosophy (+12 more)

### Community 19 - "summary"
Cohesion: 0.22
Nodes (10): get_env_config_value(), get_optional_bool(), get_optional_positive_int(), get_poll_interval_ms(), load_daemon_config(), load_env_files(), load_parameter_file(), parse_env_line() (+2 more)

### Community 20 - "load_daemon_config"
Cohesion: 0.12
Nodes (16): additionalProperties, type, $defs, array_field_definition, field_definition, identifier, non_empty_string, primitive_field_definition (+8 more)

### Community 21 - "$defs"
Cohesion: 0.19
Nodes (15): properties, type, $ref, properties, properties, fields, items, name (+7 more)

### Community 22 - "run_cursor_exec"
Cohesion: 0.26
Nodes (4): build_codex_prompt(), build_cursor_prompt(), build_planning_refinement_context(), BuildCodexPromptTests

### Community 24 - "recurrent-supabase-queries.test.ts"
Cohesion: 0.12
Nodes (14): architectureViewSource, batchCleanupMigrationSource, canonicalSchemaSource, daemonMainSource, dashboardSource, historySource, managerSource, migrationDeploymentEventsSource (+6 more)

### Community 25 - "required"
Cohesion: 0.23
Nodes (14): fields, files, id, items, name, source_system_id, summary, target_system_id (+6 more)

### Community 26 - "$ref"
Cohesion: 0.20
Nodes (11): items, type, items, $ref, properties, channels, schema_version, systems (+3 more)

### Community 27 - "git-sync-panel.tsx"
Cohesion: 0.29
Nodes (8): GitSyncPanelProps, GitSyncOperation, GitSyncResult, GitSyncStep, ParsedGitSyncRow, formatGitSyncOutput(), formatStepOutput(), parseGitSyncRowMessage()

### Community 28 - "__init__.py"
Cohesion: 0.27
Nodes (5): run_parameter_file_poll_cycle(), run_poll_cycle(), run_project_load_cycle(), RunParameterFilePollCycleTests, RunPollCycleTests

### Community 29 - "update_execution_entry_point_in_toml"
Cohesion: 0.20
Nodes (10): system_definition, items, type, uniqueItems, $ref, files, id, additionalProperties (+2 more)

### Community 30 - "build_codex_prompt"
Cohesion: 0.32
Nodes (5): ArchitectureViewSupervisor, snapshot_communication_messages(), DirectPromptSupervisor, main(), run_cycle_safely()

### Community 31 - "run_codex_exec"
Cohesion: 0.39
Nodes (3): parse_git_sync_message(), run_git_sync_cycle(), RunGitSyncCycleTests

### Community 32 - "software-architecture-v1.schema.json"
Cohesion: 0.18
Nodes (10): channels, schema_version, systems, additionalProperties, description, $id, required, $schema (+2 more)

### Community 33 - "entry-point-picker.tsx"
Cohesion: 0.29
Nodes (6): EntryPointPicker(), Props, getRelevantFileEntryPointSuggestions(), normalizeEntryPointPath(), ParameterFileProjects, ParameterFileRecord

### Community 34 - "page.tsx"
Cohesion: 0.33
Nodes (6): Home(), AgentModel, AgentModelsConfig, loadAgentModels(), FrontendConfig, loadFrontendConfig()

### Community 35 - "run_git_sync_cycle"
Cohesion: 0.25
Nodes (8): additionalProperties, properties, type, channel_definition, source_system_id, target_system_id, $ref, $ref

### Community 36 - "coding.md"
Cohesion: 0.29
Nodes (6): 4-Stage Development Lifecycle, Alignment, Debugging, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 37 - "planning.md"
Cohesion: 0.29
Nodes (6): 4-Stage Development Lifecycle, Alignment, Debugging, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 38 - "agent-task-notifications.tsx"
Cohesion: 0.33
Nodes (6): AgentTaskNotification, AgentTaskNotifications(), AgentTaskNotificationsProps, AgentTaskNotificationStatus, formatRelativeTime(), STATUS_LABELS

### Community 39 - "daemon-manager-panel.tsx"
Cohesion: 0.33
Nodes (5): DaemonManagerPanel(), DaemonManagerRequest, DaemonManagerStatus, formatTime(), Props

### Community 40 - "Agent Task Notifications"
Cohesion: 0.29
Nodes (6): Agent Prompt Chat, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 41 - "Auth-Scoped Supabase Access"
Cohesion: 0.29
Nodes (6): Auth-Scoped Supabase Access, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 42 - "Cursor Agent"
Cohesion: 0.29
Nodes (6): Agent Task Notifications, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 43 - "Daedalus Git Worktrees"
Cohesion: 0.29
Nodes (6): Daedalus Git Worktrees, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 44 - "Dev Environment Parameter File Loading"
Cohesion: 0.29
Nodes (6): Cursor Agent, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 45 - "Feature Execution System"
Cohesion: 0.29
Nodes (6): Dev Environment Parameter File Loading, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 46 - "Feature File Communications System"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature Execution System, Key Points, Relevant Files, State Log, Summary

### Community 47 - "Git Sync"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature File Communications System, Key Points, Relevant Files, State Log, Summary

### Community 48 - "Local Daemon Feature File Scanner"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature-File Graph Display, Key Points, Relevant Files, State Log, Summary

### Community 49 - "Local Daemon Manager"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Local Daemon Manager, Relevant Files, State Log, Summary

### Community 50 - "Planning Questionnaire"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature-First Graph Workspace Shell, Key Points, Relevant Files, State Log, Summary

### Community 51 - "Recurrent Row Review Protocol"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Recurrent Row Review Protocol, Relevant Files, State Log, Summary

### Community 52 - "Frontend Supabase Config"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature Search / Fuzzy Finder, Key Points, Relevant Files, State Log, Summary

### Community 53 - "Supabase Migration Deployment"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, Supabase Migration Deployment

### Community 54 - "System Architecture Communication Engine"
Cohesion: 0.29
Nodes (6): Dev Mode, Git Sync, Key Points, Relevant Files, State Log, Summary

### Community 55 - "System Architecture Visualization Engine"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, System Architecture Visualization Engine

### Community 56 - "Ventures"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Local Daemon Feature File Scanner, Relevant Files, State Log, Summary

### Community 57 - "architecture.md"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Planning Questionnaire, Relevant Files, State Log, Summary

### Community 58 - "enum"
Cohesion: 0.33
Nodes (6): boolean, integer, null, number, string, enum

### Community 59 - "integrating.md"
Cohesion: 0.29
Nodes (6): Dev Mode, Frontend Supabase Config, Key Points, Relevant Files, State Log, Summary

### Community 60 - "layout.tsx"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 62 - "Daedalus Project Instructions"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, System Architecture Communication Engine

### Community 64 - "README.md"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, Ventures

### Community 65 - "Shared Database Artifacts"
Cohesion: 0.50
Nodes (3): Automated deployment bootstrap, Shared Database Artifacts, Task-only orchestration contract

### Community 72 - "__init__.py"
Cohesion: 0.43
Nodes (3): map_reasoning_for_codex(), run_codex_exec(), RunCodexExecTests

### Community 80 - "system_definition"
Cohesion: 0.33
Nodes (5): 4-Stage Development Lifecycle, Evidence Extraction, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 81 - "integrating.md"
Cohesion: 0.40
Nodes (4): 4-Stage Development Lifecycle, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 82 - "run_tracked_agent_command"
Cohesion: 0.50
Nodes (4): kill_agent_process(), register_agent_process(), run_tracked_agent_command(), unregister_agent_process()

### Community 83 - "Daedalus Project Instructions"
Cohesion: 0.50
Nodes (3): Daedalus Project Instructions, graphify, Task mode

### Community 84 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 86 - "object_field_definition"
Cohesion: 0.67
Nodes (3): object_field_definition, additionalProperties, type

## Knowledge Gaps
- **372 isolated node(s):** `AgentOutputDetailProps`, `AgentOutputViewerProps`, `AgentOutputViewerPresentation`, `AgentPromptMode`, `AgentSessionPanelProps` (+367 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SupabaseUnavailableError` connect `orchestrator.py` to `communications.py`, `build_codex_prompt`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `GitWorktreeOrchestrator` connect `orchestrator.py` to `build_codex_prompt`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `main()` connect `build_codex_prompt` to `orchestrator.py`, `communications.py`, `__init__.py`, `scan_feature_file_projects`, `run_tracked_agent_command`, `summary`, `properties`, `__init__.py`, `run_codex_exec`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `GitWorktreeOrchestrator` (e.g. with `SupabaseUnavailableError` and `CancelOrchestratorTests`) actually correct?**
  _`GitWorktreeOrchestrator` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `FeatureFilesDashboard()` (e.g. with `mapAgentTaskRowToQueueEntry()` and `exchange()`) actually correct?**
  _`FeatureFilesDashboard()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `generate_architecture_view()` (e.g. with `.run_cycle()` and `.test_dedicated_codex_settings_and_read_only_generation()`) actually correct?**
  _`generate_architecture_view()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AgentOutputDetailProps`, `AgentOutputViewerProps`, `AgentOutputViewerPresentation` to the rest of the system?**
  _372 weakly-connected nodes found - possible documentation gaps or missing edges._