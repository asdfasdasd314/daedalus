# Graph Report - .  (2026-07-18)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1231 nodes · 2227 edges · 81 communities (68 shown, 13 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 193 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6b74ce5e`
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

## God Nodes (most connected - your core abstractions)
1. `GitWorktreeOrchestrator` - 42 edges
2. `getAuthenticatedSupabaseHeaders()` - 29 edges
3. `FeatureFilesDashboard()` - 28 edges
4. `generate_architecture_view()` - 23 edges
5. `SupabaseUnavailableError` - 20 edges
6. `AgentOutputViewer()` - 19 edges
7. `call_daemon_rpc()` - 19 edges
8. `run_agent_prompt_cycle()` - 19 edges
9. `run_cursor_exec()` - 19 edges
10. `main()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `extractFeatureFileReferences()` --indirect_call--> `normalizeFeatureFilePath()`  [INFERRED]
  daedalus-site/app/feature-file-graph.tsx → daedalus-site/app/feature-workspace-utils.ts
- `FeatureFilesDashboard()` --indirect_call--> `exchange()`  [INFERRED]
  daedalus-site/app/feature-files-dashboard.tsx → daedalus-site/lib/agent-output-history.test.ts
- `DirectPromptSupervisor` --uses--> `ArchitectureViewSupervisor`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/architecture.py
- `DirectPromptSupervisor` --uses--> `SupabaseUnavailableError`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/communications.py
- `FakeResponse` --uses--> `SupabaseUnavailableError`  [INFERRED]
  local-daemon/tests/test_communications.py → local-daemon/src/daedalus_daemon/communications.py

## Import Cycles
- None detected.

## Communities (81 total, 13 thin omitted)

### Community 0 - "orchestrator.py"
Cohesion: 0.06
Nodes (44): Exception, record_daemon_event(), SupabaseUnavailableError, update_agent_task(), build_resolver_prompt(), build_task_prompt(), build_task_repair_prompt(), commit_worktree_changes() (+36 more)

### Community 1 - "feature-files-dashboard.tsx"
Cohesion: 0.04
Nodes (75): acknowledgeClientReviews(), AgentPromptPayload, AgentPromptQueueEntry, AgentPromptQueueStatus, AgentTaskRow, AuthMode, callRecoveryRpc(), clampNumber() (+67 more)

### Community 2 - "communications.py"
Cohesion: 0.05
Nodes (37): call_daemon_rpc(), claim_architecture_view(), claim_feature_execution_run(), complete_architecture_view(), complete_task_deletion(), fetch_communication_rows(), fetch_current_message(), fetch_current_messages() (+29 more)

### Community 3 - "agent-output-viewer.tsx"
Cohesion: 0.07
Nodes (57): AgentOutputDetailProps, AgentOutputViewer(), AgentOutputViewerPresentation, AgentOutputViewerProps, architectureActionLabel(), architectureProgressLabel(), formatTime(), logViewerRequest() (+49 more)

### Community 4 - "feature-file-graph.tsx"
Cohesion: 0.05
Nodes (51): applyNodeVisualMetrics(), applyZoomAtPoint(), buildGraphData(), buildProjectFeatureLayout(), centerGraphViewport(), clamp(), ClientPoint, ClusterColor (+43 more)

### Community 5 - "architecture.py"
Cohesion: 0.11
Nodes (28): add_snapshot_worktree(), architecture_document_path(), architecture_failure_details(), architecture_log_path(), architecture_operational_failure(), architecture_snapshot_path(), ArchitectureViewSupervisor, build_architecture_correction_prompt() (+20 more)

### Community 6 - "main.py"
Cohesion: 0.13
Nodes (35): acquire_lease(), begin_restart(), call_manager_rpc(), claim_restart(), complete_control_request(), complete_recovery(), complete_restart(), get_active_request() (+27 more)

### Community 7 - "architecture-view.ts"
Cohesion: 0.09
Nodes (34): architectureFailureDetail(), ArchitectureProgressStepper(), ArchitectureVisualization(), ArchitectureVisualizationProps, PROGRESS_PHASES, stageOrder(), truncate(), wrapName() (+26 more)

### Community 8 - "devDependencies"
Cohesion: 0.05
Nodes (40): dependencies, fuse.js, next, react, react-dom, react-markdown, remark-gfm, @supabase/supabase-js (+32 more)

### Community 9 - "Feature-First Graph Workspace Shell"
Cohesion: 0.06
Nodes (30): Agent Output Viewer, Dev Mode, Key Points, Relevant Files, State Log, Summary, Agent Prompt Chat, Dev Mode (+22 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 11 - "architecture_document.py"
Cohesion: 0.12
Nodes (13): BaseModel, ArchitectureDocumentModel, ArrayFieldDefinition, ChannelDefinition, load_published_architecture_schema(), NamedFieldDefinition, ObjectFieldDefinition, parse_and_validate_architecture_response() (+5 more)

### Community 12 - "migration_deployment.py"
Cohesion: 0.14
Nodes (15): blocked(), deploy_pending_migrations(), diagnostic_text(), load_deployment_settings(), migration_files_changed(), positive_int(), project_lock(), Path (+7 more)

### Community 13 - "scan_feature_file_projects"
Cohesion: 0.15
Nodes (11): find_project_directories(), is_linked_git_worktree(), load_snapshot_limits(), Path, Read one explicitly requested file within its project and response bound., read_project_file(), scan_feature_file_projects(), scan_parameter_file_projects() (+3 more)

### Community 14 - "feature-workspace-utils.ts"
Cohesion: 0.16
Nodes (21): AgentPromptMode, AgentSessionPanel(), AgentSessionPanelProps, FeatureGraphSelection, FeatureSearchDialog(), FeatureSearchDialogProps, FeatureSearchMode, buildFeatureExecutionRequest() (+13 more)

### Community 15 - "run_agent_prompt_cycle"
Cohesion: 0.12
Nodes (10): build_agent_prompt_state_message(), filter_targeted_feature_paths(), parse_agent_prompt_message(), run_agent_prompt_cycle(), AgentOutputHistoryPublicationTests, CursorProviderRoutingTests, FakeGitProcess, FilterTargetedFeaturePathsTests (+2 more)

### Community 16 - "parameter-file-parser.ts"
Cohesion: 0.17
Nodes (20): ParameterVariableSelector(), ParameterVariableSelectorProps, ExecutionEntryPointMetadata, isDoubleQuotedString(), isSingleQuotedString(), isSupportedArrayLiteral(), isValidFloat(), normalizeFloatLiteral() (+12 more)

### Community 17 - "main.py"
Cohesion: 0.17
Nodes (17): snapshot_communication_messages(), build_entry_point_update_state_message(), build_parameter_file_update_state_message(), build_skipped_push_step(), DirectPromptSupervisor, execute_git_sync_operation(), is_toml_float(), is_toml_string() (+9 more)

### Community 18 - "README.md"
Cohesion: 0.10
Nodes (20): 1. Daedalus Site, 2. Backend, 3. Persistent Idea Space, 4. Local Daemon, 5. AI Execution Layer, Core Subsystems, Daedalus, Design Philosophy (+12 more)

### Community 19 - "summary"
Cohesion: 0.15
Nodes (18): properties, object_field_definition, primitive_field_definition, $ref, additionalProperties, properties, type, additionalProperties (+10 more)

### Community 20 - "load_daemon_config"
Cohesion: 0.22
Nodes (11): get_env_config_value(), get_optional_bool(), get_optional_positive_int(), get_poll_interval_ms(), load_daemon_config(), load_env_files(), load_parameter_file(), parse_env_line() (+3 more)

### Community 21 - "$defs"
Cohesion: 0.15
Nodes (13): additionalProperties, type, $defs, array_field_definition, field_definition, identifier, non_empty_string, oneOf (+5 more)

### Community 22 - "run_cursor_exec"
Cohesion: 0.22
Nodes (5): is_cursor_plan_mode_unsupported(), parse_cursor_plan_stream(), parse_cursor_result(), run_cursor_exec(), RunCursorExecTests

### Community 23 - "properties"
Cohesion: 0.18
Nodes (11): additionalProperties, properties, type, channel_definition, items, type, fields, source_system_id (+3 more)

### Community 24 - "recurrent-supabase-queries.test.ts"
Cohesion: 0.14
Nodes (12): architectureViewSource, daemonMainSource, dashboardSource, historySource, managerSource, migrationDeploymentEventsSource, migrationSource, orchestratorSource (+4 more)

### Community 25 - "required"
Cohesion: 0.23
Nodes (14): fields, files, id, items, name, source_system_id, summary, target_system_id (+6 more)

### Community 26 - "$ref"
Cohesion: 0.20
Nodes (11): items, type, $ref, properties, channels, items, schema_version, systems (+3 more)

### Community 27 - "git-sync-panel.tsx"
Cohesion: 0.27
Nodes (9): GitSyncPanel(), GitSyncPanelProps, GitSyncOperation, GitSyncResult, GitSyncStep, ParsedGitSyncRow, formatGitSyncOutput(), formatStepOutput() (+1 more)

### Community 28 - "__init__.py"
Cohesion: 0.23
Nodes (6): post_git_sync_result(), run_parameter_file_poll_cycle(), run_poll_cycle(), run_project_load_cycle(), RunParameterFilePollCycleTests, RunPollCycleTests

### Community 29 - "update_execution_entry_point_in_toml"
Cohesion: 0.23
Nodes (8): apply_entry_point_update(), apply_parameter_file_update(), Path, split_toml_value_and_comment(), update_execution_entry_point_in_toml(), update_parameter_variable_in_toml(), EntryPointTomlUpdateTests, ParameterFileUpdateTests

### Community 30 - "build_codex_prompt"
Cohesion: 0.26
Nodes (4): build_codex_prompt(), build_cursor_prompt(), build_planning_refinement_context(), BuildCodexPromptTests

### Community 31 - "run_codex_exec"
Cohesion: 0.26
Nodes (7): map_reasoning_for_codex(), Popen, register_agent_process(), run_codex_exec(), run_tracked_agent_command(), unregister_agent_process(), RunCodexExecTests

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
Cohesion: 0.39
Nodes (3): parse_git_sync_message(), run_git_sync_cycle(), RunGitSyncCycleTests

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
Nodes (6): Agent Task Notifications, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 41 - "Auth-Scoped Supabase Access"
Cohesion: 0.29
Nodes (6): Auth-Scoped Supabase Access, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 42 - "Cursor Agent"
Cohesion: 0.29
Nodes (6): Cursor Agent, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 43 - "Daedalus Git Worktrees"
Cohesion: 0.29
Nodes (6): Daedalus Git Worktrees, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 44 - "Dev Environment Parameter File Loading"
Cohesion: 0.29
Nodes (6): Dev Environment Parameter File Loading, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 45 - "Feature Execution System"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature Execution System, Key Points, Relevant Files, State Log, Summary

### Community 46 - "Feature File Communications System"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature File Communications System, Key Points, Relevant Files, State Log, Summary

### Community 47 - "Git Sync"
Cohesion: 0.29
Nodes (6): Dev Mode, Git Sync, Key Points, Relevant Files, State Log, Summary

### Community 48 - "Local Daemon Feature File Scanner"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Local Daemon Feature File Scanner, Relevant Files, State Log, Summary

### Community 49 - "Local Daemon Manager"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Local Daemon Manager, Relevant Files, State Log, Summary

### Community 50 - "Planning Questionnaire"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Planning Questionnaire, Relevant Files, State Log, Summary

### Community 51 - "Recurrent Row Review Protocol"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Recurrent Row Review Protocol, Relevant Files, State Log, Summary

### Community 52 - "Frontend Supabase Config"
Cohesion: 0.29
Nodes (6): Dev Mode, Frontend Supabase Config, Key Points, Relevant Files, State Log, Summary

### Community 53 - "Supabase Migration Deployment"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, Supabase Migration Deployment

### Community 54 - "System Architecture Communication Engine"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, System Architecture Communication Engine

### Community 55 - "System Architecture Visualization Engine"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, System Architecture Visualization Engine

### Community 56 - "Ventures"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, Ventures

### Community 57 - "architecture.md"
Cohesion: 0.33
Nodes (5): 4-Stage Development Lifecycle, Evidence Extraction, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 58 - "enum"
Cohesion: 0.33
Nodes (6): boolean, integer, null, number, string, enum

### Community 59 - "integrating.md"
Cohesion: 0.40
Nodes (4): 4-Stage Development Lifecycle, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 60 - "layout.tsx"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 62 - "Daedalus Project Instructions"
Cohesion: 0.50
Nodes (3): Daedalus Project Instructions, graphify, Task mode

### Community 64 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 65 - "Shared Database Artifacts"
Cohesion: 0.50
Nodes (3): Automated deployment bootstrap, Shared Database Artifacts, Task-integration cutover

### Community 80 - "system_definition"
Cohesion: 0.20
Nodes (10): system_definition, items, type, uniqueItems, $ref, files, id, additionalProperties (+2 more)

## Knowledge Gaps
- **364 isolated node(s):** `AgentOutputDetailProps`, `AgentOutputViewerProps`, `AgentOutputViewerPresentation`, `AgentPromptMode`, `AgentSessionPanelProps` (+359 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SupabaseUnavailableError` connect `orchestrator.py` to `main.py`, `communications.py`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `GitWorktreeOrchestrator` connect `orchestrator.py` to `main.py`, `__init__.py`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `deploy_pending_migrations()` connect `migration_deployment.py` to `orchestrator.py`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `GitWorktreeOrchestrator` (e.g. with `DirectPromptSupervisor` and `SupabaseUnavailableError`) actually correct?**
  _`GitWorktreeOrchestrator` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `FeatureFilesDashboard()` (e.g. with `mapAgentTaskRowToQueueEntry()` and `exchange()`) actually correct?**
  _`FeatureFilesDashboard()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `generate_architecture_view()` (e.g. with `.run_cycle()` and `.test_dedicated_codex_settings_and_read_only_generation()`) actually correct?**
  _`generate_architecture_view()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `SupabaseUnavailableError` (e.g. with `DirectPromptSupervisor` and `GitWorktreeOrchestrator`) actually correct?**
  _`SupabaseUnavailableError` has 15 INFERRED edges - model-reasoned connections that need verification._